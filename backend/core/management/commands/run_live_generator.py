"""
run_live_generator
==================
Continuously generates realistic live telemetry and factory events for all
RUNNING machines in the TRACE-MES database.  Designed to run in a dedicated
terminal alongside `python manage.py runserver`.

What it does every tick (default 1 s)
--------------------------------------
• Creates a TelemetryPacket for every machine that has a RUNNING execution.
  Values evolve via a random-walk algorithm anchored to machine-type-specific
  operating profiles so the charts look genuinely alive, not random garbage.

Periodic actions
-----------------
• Every ~30 s   → MachineEvent (HEARTBEAT_RESTORED / STATUS_CHANGE) per machine
• Every ~60 s   → ProductionLog flush (batched good/scrap counts)
• Every ~300 s  → Anomaly injection (temperature / vibration spike) on a random
                  machine, creating an AnomalySnapshot + ScrapLog
• Every ~600 s  → Prune TelemetryPackets older than 24 hours

Usage
-----
    python manage.py run_live_generator
    python manage.py run_live_generator --interval 0.5   # 2 Hz
"""

import random
import time
from collections import defaultdict
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import connection
from django.utils import timezone

from core.models import (
    Machine,
    WorkOrder,
    WorkOrderExecution,
    TelemetryPacket,
    MachineEvent,
    ProductionLog,
    ScrapLog,
    AnomalySnapshot,
    DefectCode,
    ProductionLine,
)
from users.models import CustomUser


# ---------------------------------------------------------------------------
# Machine-type telemetry profiles
# Each field:  base   — nominal operating value
#              min    — hard lower bound (clamp)
#              max    — hard upper bound (clamp)
#              noise  — std-dev of Gaussian noise per step
# ---------------------------------------------------------------------------

PROFILES: dict[str, dict[str, dict[str, float]]] = {
    "CNC": {
        "spindle_speed": {"base": 10500, "min": 7000,   "max": 14000,  "noise": 180},
        "feed_rate":     {"base":   550, "min":  200,   "max":   900,  "noise":  28},
        "temperature":   {"base":    58, "min":   38,   "max":    78,  "noise":   0.9},
        "vibration":     {"base": 0.072, "min": 0.020,  "max":  0.160, "noise":   0.003},
    },
    "Press": {
        "spindle_speed": {"base":   2.0, "min":   0.0,  "max":    8.0, "noise":   0.40},
        "feed_rate":     {"base":  28.0, "min":   8.0,  "max":   55.0, "noise":   2.00},
        "temperature":   {"base":  72.0, "min":  48.0,  "max":   92.0, "noise":   1.20},
        "vibration":     {"base":  1.55, "min":  0.50,  "max":   2.80, "noise":   0.080},
    },
    "Welding": {
        "spindle_speed": {"base":   4.0, "min":   0.0,  "max":   12.0, "noise":   0.50},
        "feed_rate":     {"base": 480.0, "min": 200.0,  "max":  750.0, "noise":  22.00},
        "temperature":   {"base": 520.0, "min": 180.0,  "max":  850.0, "noise":  28.00},
        "vibration":     {"base": 0.180, "min": 0.040,  "max":  0.400, "noise":   0.010},
    },
    "Soldering": {
        "spindle_speed": {"base":   0.5, "min":   0.0,  "max":    5.0, "noise":   0.15},
        "feed_rate":     {"base":  45.0, "min":  15.0,  "max":   90.0, "noise":   3.00},
        "temperature":   {"base": 262.0, "min": 235.0,  "max":  310.0, "noise":   2.00},
        "vibration":     {"base": 0.018, "min": 0.005,  "max":  0.040, "noise":   0.001},
    },
    "Testing": {
        "spindle_speed": {"base": 320.0, "min":   0.0,  "max":  580.0, "noise":  15.00},
        "feed_rate":     {"base":  22.0, "min":   0.0,  "max":   70.0, "noise":   3.00},
        "temperature":   {"base":  27.0, "min":  20.0,  "max":   38.0, "noise":   0.40},
        "vibration":     {"base": 0.018, "min": 0.004,  "max":  0.040, "noise":   0.001},
    },
    "Molding": {
        "spindle_speed": {"base": 140.0, "min":  40.0,  "max":  280.0, "noise":   8.00},
        "feed_rate":     {"base":  75.0, "min":  20.0,  "max":  140.0, "noise":   5.00},
        "temperature":   {"base": 225.0, "min": 175.0,  "max":  275.0, "noise":   2.50},
        "vibration":     {"base": 0.038, "min": 0.010,  "max":  0.090, "noise":   0.002},
    },
    "Painting": {
        "spindle_speed": {"base": 1550,  "min":  900,   "max":  1900,  "noise":  30.00},
        "feed_rate":     {"base":  240,  "min":   90,   "max":   420,  "noise":  12.00},
        "temperature":   {"base":   26,  "min":   18,   "max":    38,  "noise":   0.50},
        "vibration":     {"base": 0.014, "min": 0.003,  "max":  0.035, "noise":   0.0008},
    },
    "Assembly": {
        "spindle_speed": {"base":  850,  "min":  200,   "max":  1400,  "noise":  40.00},
        "feed_rate":     {"base":   22,  "min":    5,   "max":    55,  "noise":   2.00},
        "temperature":   {"base":   36,  "min":   22,   "max":    52,  "noise":   0.50},
        "vibration":     {"base": 0.022, "min": 0.005,  "max":  0.055, "noise":   0.001},
    },
    "Packaging": {
        "spindle_speed": {"base":  520,  "min":  120,   "max":   780,  "noise":  20.00},
        "feed_rate":     {"base":  380,  "min":  150,   "max":   580,  "noise":  15.00},
        "temperature":   {"base":   24,  "min":   18,   "max":    32,  "noise":   0.30},
        "vibration":     {"base": 0.028, "min": 0.006,  "max":  0.065, "noise":   0.001},
    },
}

_DEFAULT_PROFILE = PROFILES["CNC"]


# ---------------------------------------------------------------------------
# Random-walk state per machine
# ---------------------------------------------------------------------------

def _get_profile(machine_type: str) -> dict:
    return PROFILES.get(machine_type, _DEFAULT_PROFILE)


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def _walk(current: float, param: dict, drift: float = 0.06) -> float:
    """
    One random-walk step.
    The value is pulled toward `base` by `drift` fraction, then perturbed with
    Gaussian noise scaled to `noise`.  The result is clamped to [min, max].
    """
    pull  = (param["base"] - current) * drift
    noise = random.gauss(0, param["noise"])
    return _clamp(current + pull + noise, param["min"], param["max"])


class MachineState:
    """Holds current telemetry values for one machine and advances them each tick."""

    def __init__(self, machine_type: str) -> None:
        profile = _get_profile(machine_type)
        self.profile = profile
        # Initialise near base with some starting variance
        self.spindle_speed = _clamp(
            profile["spindle_speed"]["base"] + random.gauss(0, profile["spindle_speed"]["noise"] * 3),
            profile["spindle_speed"]["min"], profile["spindle_speed"]["max"],
        )
        self.feed_rate = _clamp(
            profile["feed_rate"]["base"] + random.gauss(0, profile["feed_rate"]["noise"] * 3),
            profile["feed_rate"]["min"], profile["feed_rate"]["max"],
        )
        self.temperature = _clamp(
            profile["temperature"]["base"] + random.gauss(0, profile["temperature"]["noise"] * 3),
            profile["temperature"]["min"], profile["temperature"]["max"],
        )
        self.vibration = _clamp(
            profile["vibration"]["base"] + random.gauss(0, profile["vibration"]["noise"] * 3),
            profile["vibration"]["min"], profile["vibration"]["max"],
        )

    def step(self) -> dict:
        """Advance one tick and return rounded telemetry dict."""
        self.spindle_speed = _walk(self.spindle_speed, self.profile["spindle_speed"])
        self.feed_rate     = _walk(self.feed_rate,     self.profile["feed_rate"])
        self.temperature   = _walk(self.temperature,   self.profile["temperature"])
        self.vibration     = _walk(self.vibration,     self.profile["vibration"])
        return {
            "spindle_speed": round(self.spindle_speed, 2),
            "feed_rate":     round(self.feed_rate,     2),
            "temperature":   round(self.temperature,   2),
            "vibration":     round(self.vibration,     4),
        }

    def inject_anomaly(self) -> None:
        """Spike temperature and vibration above the normal maximum."""
        p = self.profile
        spike = random.uniform(1.45, 1.90)
        self.temperature = min(p["temperature"]["max"] * spike, p["temperature"]["max"] * 2.5)
        self.vibration   = min(p["vibration"]["max"]   * spike, p["vibration"]["max"]   * 2.5)


# ---------------------------------------------------------------------------
# Management command
# ---------------------------------------------------------------------------

class Command(BaseCommand):
    help = (
        "Run continuous live data generation for all RUNNING machines. "
        "Press Ctrl+C to stop."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--interval",
            type=float,
            default=1.0,
            help="Seconds between telemetry ticks (default: 1.0).",
        )

    def handle(self, *args, **options):
        interval = max(0.05, options["interval"])

        self.stdout.write(self.style.SUCCESS(
            f"\n[LiveGen] ▶  Started  (interval={interval}s).  Ctrl+C to stop.\n"
        ))

        # machine_id → MachineState
        states: dict[str, MachineState] = {}

        # execution_id → {"good": int, "scrap": int}
        prod_accumulator: dict[str, dict[str, int]] = defaultdict(lambda: {"good": 0, "scrap": 0})

        # awaiting_exec_id → tick when first seen (for delayed activation)
        awaiting_start_seen: dict[str, int] = {}

        tick = 0

        try:
            while True:
                tick_start = time.monotonic()
                ts = timezone.now()
                tick += 1

                # ----------------------------------------------------------
                # Refresh active execution list every 15 ticks so we pick up
                # executions started via the UI without lagging too far.
                # ----------------------------------------------------------
                running_executions = list(
                    WorkOrderExecution.objects
                    .filter(status="RUNNING")
                    .select_related("machine")
                )

                # Initialise state for machines we haven't seen before
                for exc in running_executions:
                    mid = str(exc.machine_id)
                    if mid not in states:
                        states[mid] = MachineState(exc.machine.type)
                        self.stdout.write(
                            f"  [LiveGen] New machine detected: {exc.machine.name} ({exc.machine.type})"
                        )

                # ----------------------------------------------------------
                # 1 Hz — Telemetry packets
                # ----------------------------------------------------------
                packets = []
                for exc in running_executions:
                    mid = str(exc.machine_id)
                    values = states[mid].step()
                    packets.append(TelemetryPacket(
                        machine_id=exc.machine_id,
                        execution_id=exc.id,
                        timestamp=ts,
                        **values,
                    ))
                    # Accumulate production quantities
                    # Each tick represents ~1 s of machining time.
                    # Machines produce roughly 1 unit per 30-120 s.
                    if random.random() < (1 / 60):   # ~1 unit / 60 ticks
                        prod_accumulator[str(exc.id)]["good"] += 1
                    if random.random() < 0.0015:      # ~0.15% scrap rate
                        prod_accumulator[str(exc.id)]["scrap"] += 1

                if packets:
                    TelemetryPacket.objects.bulk_create(packets)
                    self.stdout.write(
                        f"  [{ts.strftime('%H:%M:%S')}] Telemetry ×{len(packets)}"
                        + (f"  (machines: {', '.join(str(p.machine_id)[:8] for p in packets[:3])}{'…' if len(packets) > 3 else ''})" if packets else "")
                    )

                # ----------------------------------------------------------
                # Every ~30 ticks — MachineEvents (heartbeat / status logs)
                # ----------------------------------------------------------
                if tick % 30 == 0:
                    self._emit_heartbeats(running_executions)

                # ----------------------------------------------------------
                # Every ~60 ticks — Flush ProductionLogs
                # ----------------------------------------------------------
                if tick % 60 == 0:
                    self._flush_production_logs(prod_accumulator)
                    prod_accumulator.clear()

                # ----------------------------------------------------------
                # Every ~300 ticks — Anomaly injection (rare, ~5-min cycle)
                # ----------------------------------------------------------
                if tick % 300 == 0 and running_executions:
                    self._inject_anomaly(running_executions, states, ts)

                # ----------------------------------------------------------
                # Every ~600 ticks — Prune old telemetry
                # ----------------------------------------------------------
                if tick % 600 == 0:
                    self._prune_old_telemetry()

                # ----------------------------------------------------------
                # Every ~15 ticks — AWAITING_START → RUNNING transition
                # (simulates physical machine confirmation after 30-60s)
                # ----------------------------------------------------------
                if tick % 15 == 0:
                    self._transition_awaiting_start(awaiting_start_seen, tick, states)

                # ----------------------------------------------------------
                # Every ~60 ticks — Check job completion (actual >= target)
                # ----------------------------------------------------------
                if tick % 60 == 0:
                    self._check_job_completion()

                # ----------------------------------------------------------
                # Every ~120 ticks — Update production line statuses
                # ----------------------------------------------------------
                if tick % 120 == 0:
                    self._update_line_statuses()

                # Sleep the remainder of the interval
                elapsed = time.monotonic() - tick_start
                sleep_for = interval - elapsed
                if sleep_for > 0:
                    time.sleep(sleep_for)

        except KeyboardInterrupt:
            self.stdout.write(
                "\n" + self.style.SUCCESS(f"[LiveGen] ■  Stopped after {tick} tick(s).")
            )
        finally:
            connection.close()

    # ------------------------------------------------------------------
    # Periodic helpers
    # ------------------------------------------------------------------

    def _emit_heartbeats(self, running_executions):
        """Log a heartbeat / status event for every running machine."""
        seen_machine_ids = set()
        events = []
        for exc in running_executions:
            mid = exc.machine_id
            if mid in seen_machine_ids:
                continue
            seen_machine_ids.add(mid)
            event_type = (
                "HEARTBEAT_RESTORED" if random.random() < 0.80 else "STATUS_CHANGE"
            )
            events.append(MachineEvent(
                machine_id=mid,
                event_type=event_type,
                details={
                    "message": "Heartbeat OK" if event_type == "HEARTBEAT_RESTORED" else "Status nominal — all parameters within range",
                    "uptime_s": random.randint(900, 86400),
                    "work_order": str(exc.work_order_id),
                },
            ))
        if events:
            MachineEvent.objects.bulk_create(events)
            self.stdout.write(f"  [Events ] {len(events)} heartbeat event(s) logged")

    def _flush_production_logs(self, accumulator: dict):
        """Write accumulated good/scrap counts as ProductionLog rows."""
        recorder = CustomUser.objects.filter(is_active=True).first()
        created = 0
        for exec_id_str, counts in accumulator.items():
            if counts["good"] == 0 and counts["scrap"] == 0:
                continue
            try:
                execution = WorkOrderExecution.objects.get(id=exec_id_str, status="RUNNING")
            except WorkOrderExecution.DoesNotExist:
                continue
            ProductionLog.objects.create(
                execution=execution,
                recorded_by=recorder,
                good_qty=counts["good"],
                scrap_qty=counts["scrap"],
            )
            created += 1
        if created:
            self.stdout.write(f"  [ProdLog] {created} production log(s) flushed")

    def _inject_anomaly(self, running_executions, states: dict, ts):
        """
        Inject a transient anomaly into one randomly chosen running machine.
        Creates: AnomalySnapshot, ProductionLog (with scrap), ScrapLog.
        """
        exc = random.choice(running_executions)
        mid = str(exc.machine_id)
        state = states.get(mid)
        if not state:
            return

        # Spike the state values
        state.inject_anomaly()

        # Capture the last 5 min of telemetry as a snapshot window
        five_min_ago = ts - timedelta(minutes=5)
        raw_packets = list(
            TelemetryPacket.objects
            .filter(machine_id=exc.machine_id, timestamp__gte=five_min_ago)
            .order_by("-timestamp")
            .values("timestamp", "spindle_speed", "feed_rate", "temperature", "vibration")
            [:300]
        )

        if not raw_packets:
            return

        # Serialise timestamps for JSON storage
        window = [
            {**p, "timestamp": p["timestamp"].isoformat()}
            for p in raw_packets
        ]

        snapshot = AnomalySnapshot.objects.create(
            execution=exc,
            telemetry_window_json=window,
        )

        # Create scrap record
        recorder = CustomUser.objects.filter(is_active=True).first()
        scrap_qty = random.randint(1, 4)
        prod_log = ProductionLog.objects.create(
            execution=exc,
            recorded_by=recorder,
            good_qty=random.randint(0, 1),
            scrap_qty=scrap_qty,
        )

        defect = DefectCode.objects.order_by("?").first()
        if defect:
            ScrapLog.objects.create(
                production_log=prod_log,
                defect_code=defect,
                qty=scrap_qty,
                anomaly_snapshot=snapshot,
            )

        # Log the event
        MachineEvent.objects.create(
            machine=exc.machine,
            event_type="STATUS_CHANGE",
            details={
                "message":     "Anomaly detected — parameter spike",
                "temperature": round(state.temperature, 1),
                "vibration":   round(state.vibration,   4),
                "snapshot_id": str(snapshot.id),
            },
        )

        self.stdout.write(self.style.WARNING(
            f"  [ANOMALY] {exc.machine.name} — spike injected "
            f"(temp={state.temperature:.1f}, vib={state.vibration:.4f})"
        ))

    def _prune_old_telemetry(self):
        """Remove telemetry packets older than 24 hours to keep the DB lean."""
        cutoff = timezone.now() - timedelta(hours=24)
        deleted, _ = TelemetryPacket.objects.filter(timestamp__lt=cutoff).delete()
        if deleted:
            self.stdout.write(f"  [Prune  ] {deleted} old telemetry packet(s) removed")

    def _transition_awaiting_start(self, seen: dict, current_tick: int, states: dict):
        """
        Transition AWAITING_START executions to RUNNING after a simulated
        delay (30-60 ticks ≈ 30-60 seconds), simulating physical machine
        confirmation at the factory floor.
        """
        awaiting = list(
            WorkOrderExecution.objects
            .filter(status="AWAITING_START")
            .select_related("machine", "work_order")
        )
        for exc in awaiting:
            eid = str(exc.id)
            if eid not in seen:
                seen[eid] = current_tick
                delay = random.randint(30, 60)
                self.stdout.write(
                    f"  [Await  ] {exc.machine.name} — will start in ~{delay}s"
                )
                seen[eid] = current_tick + delay  # tick when it should start
                continue

            if current_tick >= seen[eid]:
                # Transition to RUNNING
                exc.status = "RUNNING"
                exc.save(update_fields=["status"])

                # Ensure machine is RUNNING
                exc.machine.status = "RUNNING"
                exc.machine.save(update_fields=["status"])

                # Initialise telemetry state
                mid = str(exc.machine_id)
                if mid not in states:
                    states[mid] = MachineState(exc.machine.type)

                MachineEvent.objects.create(
                    machine=exc.machine,
                    event_type="STATUS_CHANGE",
                    details={
                        "from": "AWAITING_START",
                        "to": "RUNNING",
                        "reason": "Physical machine confirmation received",
                        "work_order": exc.work_order.code,
                    },
                )

                del seen[eid]
                self.stdout.write(self.style.SUCCESS(
                    f"  [START  ] {exc.machine.name} — {exc.work_order.code} now RUNNING"
                ))

    def _check_job_completion(self):
        """
        Auto-complete executions where actual_qty >= target_qty.
        """
        running = (
            WorkOrderExecution.objects
            .filter(status="RUNNING")
            .select_related("work_order", "machine")
        )
        for exc in running:
            actual = sum(log.good_qty for log in exc.production_logs.all())
            target = exc.work_order.target_qty
            if actual >= target:
                exc.status = "COMPLETED"
                exc.completed_at = timezone.now()
                exc.save(update_fields=["status", "completed_at"])

                exc.work_order.status = "COMPLETED"
                exc.work_order.save(update_fields=["status"])

                # Only set machine IDLE if no other active executions
                other_active = WorkOrderExecution.objects.filter(
                    machine=exc.machine,
                    status__in=["RUNNING", "AWAITING_START"],
                ).exclude(pk=exc.pk).exists()
                if not other_active:
                    exc.machine.status = "IDLE"
                    exc.machine.save(update_fields=["status"])

                self.stdout.write(self.style.SUCCESS(
                    f"  [DONE   ] {exc.work_order.code} COMPLETED "
                    f"({actual}/{target}) on {exc.machine.name}"
                ))

    def _update_line_statuses(self):
        """
        Sync production line statuses based on their machines' states.
        If any machine in the line is RUNNING → line is ACTIVE.
        If all machines are IDLE → line is IDLE.
        If any machine is DOWN → line stays ACTIVE but with a warning.
        """
        for line in ProductionLine.objects.prefetch_related("machines").all():
            machine_statuses = set(m.status for m in line.machines.all())
            if "RUNNING" in machine_statuses:
                new_status = "ACTIVE"
            elif machine_statuses <= {"IDLE", "OFFLINE"}:
                new_status = "IDLE"
            else:
                new_status = "ACTIVE"  # DOWN machines still mean the line is engaged

            if line.status != new_status:
                line.status = new_status
                line.save(update_fields=["status"])
