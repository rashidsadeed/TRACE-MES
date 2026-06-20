"""
machine_simulator
=================
Core simulation engine for the TRACE-MES machine simulator.

Provides the MachineState (random-walk telemetry), and the MachineSimulator
controller that manages machines, programs, telemetry generation, and
production-log accumulation.

The engine operates on an accelerated time scale (default: 1 real minute =
3 simulated minutes, configurable via TIME_SCALE_FACTOR). This can be
switched to real-time by setting TIME_SCALE_FACTOR = 1.0.
"""

import logging
import random
import threading
import time
import uuid
from collections import defaultdict
from datetime import timedelta

from django.db import connection
from django.db.models import F, Q, Sum
from django.utils import timezone
from django.utils.text import slugify

from core.models import (
    Machine,
    MachineEvent,
    Part,
    ProductionLog,
    TelemetryPacket,
    WorkOrder,
    WorkOrderAssignment,
    WorkOrderExecution,
    AnomalySnapshot,
    ScrapLog,
    DefectCode,
    ProductionLine,
)
from core.audit import log_action
from users.models import CustomUser

from .telemetry_profiles import get_profile

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Time-scale configuration
# ---------------------------------------------------------------------------
# 1 real minute = TIME_SCALE_FACTOR simulated minutes.
# Set to 1.0 for real-time simulation.
TIME_SCALE_FACTOR = 3.0


# ---------------------------------------------------------------------------
# Random-walk helpers
# ---------------------------------------------------------------------------

def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def _walk(current: float, param: dict, drift: float = 0.06) -> float:
    """
    One random-walk step.
    The value is pulled toward ``base`` by ``drift`` fraction, then perturbed
    with Gaussian noise scaled to ``noise``.  The result is clamped to
    [min, max].
    """
    pull = (param["base"] - current) * drift
    noise = random.gauss(0, param["noise"])
    return _clamp(current + pull + noise, param["min"], param["max"])


# ---------------------------------------------------------------------------
# MachineState — holds current telemetry values for one machine
# ---------------------------------------------------------------------------

class MachineState:
    """Holds current telemetry values for one machine and advances them each tick."""

    def __init__(self, machine_type: str) -> None:
        profile = get_profile(machine_type)
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
        self.feed_rate = _walk(self.feed_rate, self.profile["feed_rate"])
        self.temperature = _walk(self.temperature, self.profile["temperature"])
        self.vibration = _walk(self.vibration, self.profile["vibration"])
        return {
            "spindle_speed": round(self.spindle_speed, 2),
            "feed_rate":     round(self.feed_rate, 2),
            "temperature":   round(self.temperature, 2),
            "vibration":     round(self.vibration, 4),
        }

    def inject_anomaly(self) -> None:
        """Spike temperature and vibration above the normal maximum."""
        p = self.profile
        spike = random.uniform(1.45, 1.90)
        self.temperature = min(p["temperature"]["max"] * spike, p["temperature"]["max"] * 2.5)
        self.vibration = min(p["vibration"]["max"] * spike, p["vibration"]["max"] * 2.5)


# ---------------------------------------------------------------------------
# MachineSimulator — the main controller
# ---------------------------------------------------------------------------

class MachineSimulator:
    """
    Manages the full simulation lifecycle:
    - Adding / removing machines
    - Starting / pausing / resuming / stopping programs
    - Generating telemetry (called every tick from the engine thread)
    - Accumulating and flushing production logs
    - Auto-completing programs when duration expires
    """

    def __init__(self, time_scale: float = TIME_SCALE_FACTOR) -> None:
        self.time_scale = time_scale
        # machine_id (str) → MachineState
        self._states: dict[str, MachineState] = {}
        # execution_id (str) → {"good": float, "scrap": float}
        # Floats: rate-based production accrues fractional parts per tick;
        # _flush_production_logs writes the integer part and keeps the rest.
        self._prod_accumulator: dict[str, dict[str, float]] = defaultdict(
            lambda: {"good": 0.0, "scrap": 0.0}
        )
        # Internal tick counter
        self._tick = 0
        # Event log for GUI display (list of dicts)
        self._event_log: list[dict] = []
        self._lock = threading.Lock()

    # ------------------------------------------------------------------
    # Machine management
    # ------------------------------------------------------------------

    def add_machine(self, name: str, machine_type: str, slug: str = "") -> Machine:
        """Create a new machine in the database and initialise its telemetry state."""
        if not slug:
            slug = slugify(name)
        # Ensure unique slug
        base_slug = slug
        counter = 1
        while Machine.objects.filter(slug=slug).exists():
            slug = f"{base_slug}-{counter}"
            counter += 1

        machine = Machine.objects.create(
            name=name,
            type=machine_type,
            slug=slug,
            status="IDLE",
        )
        mid = str(machine.id)
        self._states[mid] = MachineState(machine_type)

        # Log event
        MachineEvent.objects.create(
            machine=machine,
            event_type="STATUS_CHANGE",
            details={"from": "N/A", "to": "IDLE", "reason": "Machine added via simulator"},
        )

        # AuditLog
        log_action(
            actor=self._get_system_user(),
            action="SIMULATOR_ADD_MACHINE",
            entity_type="Machine",
            entity_id=machine.pk,
            after={"name": name, "type": machine_type, "slug": slug, "status": "IDLE"},
        )

        self._log_event(f"Makine eklendi: {name} ({machine_type})")
        return machine

    def remove_machine(self, machine_id: str) -> bool:
        """Set machine status to OFFLINE and stop any active executions."""
        try:
            machine = Machine.objects.get(pk=machine_id)
        except Machine.DoesNotExist:
            return False

        before = {"name": machine.name, "status": machine.status}

        # Stop active executions on this machine
        active_execs = WorkOrderExecution.objects.filter(
            machine=machine, status__in=["RUNNING", "PAUSED", "AWAITING_START"]
        )
        for exc in active_execs:
            exc.status = "STOPPED"
            exc.completed_at = timezone.now()
            exc.save(update_fields=["status", "completed_at"])

        machine.status = "OFFLINE"
        machine.save(update_fields=["status"])

        MachineEvent.objects.create(
            machine=machine,
            event_type="STATUS_CHANGE",
            details={"from": before["status"], "to": "OFFLINE", "reason": "Machine removed via simulator"},
        )

        # Clean up state
        self._states.pop(str(machine_id), None)

        log_action(
            actor=self._get_system_user(),
            action="SIMULATOR_REMOVE_MACHINE",
            entity_type="Machine",
            entity_id=machine.pk,
            before=before,
            after={"status": "OFFLINE"},
        )

        self._log_event(f"Makine kaldırıldı: {machine.name}")
        return True

    # ------------------------------------------------------------------
    # Program lifecycle
    # ------------------------------------------------------------------

    def start_program(
        self,
        machine_id: str,
        program_name: str = "",
        duration_minutes: float = 15.0,
        target_qty: int = 100,
    ) -> WorkOrderExecution | None:
        """
        Start a simulated program on a machine.
        Creates a WorkOrder + WorkOrderExecution and schedules completion.
        Duration is in *simulated* minutes (affected by time_scale).
        """
        try:
            machine = Machine.objects.get(pk=machine_id)
        except Machine.DoesNotExist:
            return None

        if machine.status in ("RUNNING", "OFFLINE"):
            return None

        system_user = self._get_system_user()

        # Create a placeholder Part if needed
        part, _ = Part.objects.get_or_create(
            sku=f"SIM-{uuid.uuid4().hex[:6].upper()}",
            defaults={"name": program_name or f"Simulated Part", "description": "Auto-created by simulator"},
        )

        # Create WorkOrder
        wo_code = f"SIM-{timezone.now().strftime('%H%M%S')}-{uuid.uuid4().hex[:4].upper()}"
        wo = WorkOrder.objects.create(
            code=wo_code,
            description=program_name or f"Simulated program on {machine.name}",
            part=part,
            target_qty=target_qty,
            priority=2,
            status="IN_PROGRESS",
            created_by=system_user,
        )

        # Create assignment
        WorkOrderAssignment.objects.create(
            work_order=wo,
            machine=machine,
            assigned_by=system_user,
        )

        # Create execution with a persisted completion schedule:
        # real_seconds = (duration_minutes * 60) / time_scale
        real_duration_seconds = (duration_minutes * 60) / self.time_scale
        end_time = timezone.now() + timedelta(seconds=real_duration_seconds)
        execution = WorkOrderExecution.objects.create(
            work_order=wo,
            machine=machine,
            operator=system_user,
            status="RUNNING",
            program_ends_at=end_time,
        )

        # Set machine to RUNNING
        machine.status = "RUNNING"
        machine.save(update_fields=["status"])

        # Initialise telemetry state if needed
        mid = str(machine.id)
        if mid not in self._states:
            self._states[mid] = MachineState(machine.type)

        MachineEvent.objects.create(
            machine=machine,
            event_type="STATUS_CHANGE",
            details={
                "from": "IDLE",
                "to": "RUNNING",
                "reason": f"Program started via simulator: {program_name}",
                "work_order": wo_code,
                "duration_sim_min": duration_minutes,
                "duration_real_sec": round(real_duration_seconds, 1),
            },
        )

        log_action(
            actor=system_user,
            action="SIMULATOR_START_PROGRAM",
            entity_type="WorkOrderExecution",
            entity_id=execution.pk,
            after={
                "work_order": wo_code,
                "machine": machine.name,
                "duration_minutes": duration_minutes,
                "target_qty": target_qty,
            },
        )

        self._log_event(
            f"Program başladı: {machine.name} — {wo_code} "
            f"({duration_minutes} sim.dk / {real_duration_seconds:.0f} gerçek sn)"
        )
        return execution

    def pause_program(self, execution_id: str) -> bool:
        """Pause a running execution."""
        try:
            exc = WorkOrderExecution.objects.select_related("machine", "work_order").get(pk=execution_id)
        except WorkOrderExecution.DoesNotExist:
            return False

        if exc.status != "RUNNING":
            return False

        exc.status = "PAUSED"
        exc.paused_at = timezone.now()
        exc.save(update_fields=["status", "paused_at"])

        exc.work_order.status = "PAUSED"
        exc.work_order.save(update_fields=["status"])

        MachineEvent.objects.create(
            machine=exc.machine,
            event_type="STATUS_CHANGE",
            details={"from": "RUNNING", "to": "PAUSED", "reason": "Paused via simulator"},
        )

        log_action(
            actor=self._get_system_user(),
            action="SIMULATOR_PAUSE",
            entity_type="WorkOrderExecution",
            entity_id=exc.pk,
        )

        self._log_event(f"Duraklatıldı: {exc.machine.name} — {exc.work_order.code}")
        return True

    def resume_program(self, execution_id: str) -> bool:
        """Resume a paused execution."""
        try:
            exc = WorkOrderExecution.objects.select_related("machine", "work_order").get(pk=execution_id)
        except WorkOrderExecution.DoesNotExist:
            return False

        if exc.status != "PAUSED":
            return False

        exc.status = "RUNNING"
        exc.paused_at = None
        exc.save(update_fields=["status", "paused_at"])

        exc.work_order.status = "IN_PROGRESS"
        exc.work_order.save(update_fields=["status"])

        exc.machine.status = "RUNNING"
        exc.machine.save(update_fields=["status"])

        MachineEvent.objects.create(
            machine=exc.machine,
            event_type="STATUS_CHANGE",
            details={"from": "PAUSED", "to": "RUNNING", "reason": "Resumed via simulator"},
        )

        log_action(
            actor=self._get_system_user(),
            action="SIMULATOR_RESUME",
            entity_type="WorkOrderExecution",
            entity_id=exc.pk,
        )

        self._log_event(f"Devam edildi: {exc.machine.name} — {exc.work_order.code}")
        return True

    def stop_program(self, execution_id: str) -> bool:
        """Stop an execution (early termination)."""
        try:
            exc = WorkOrderExecution.objects.select_related("machine", "work_order").get(pk=execution_id)
        except WorkOrderExecution.DoesNotExist:
            return False

        if exc.status in ("COMPLETED", "STOPPED"):
            return False

        # Early termination is STOPPED, not COMPLETED — mirrors the REST
        # /executions/{id}/stop/ semantics. The work order stays IN_PROGRESS
        # so the customer keeps seeing it as "In Production".
        exc.status = "STOPPED"
        exc.completed_at = timezone.now()
        exc.save(update_fields=["status", "completed_at"])

        if exc.work_order.status not in ("COMPLETED", "CANCELLED"):
            exc.work_order.status = "IN_PROGRESS"
            exc.work_order.save(update_fields=["status"])

        # Only set machine IDLE if no other active executions
        other_active = WorkOrderExecution.objects.filter(
            machine=exc.machine, status__in=["RUNNING", "PAUSED", "AWAITING_START"]
        ).exclude(pk=exc.pk).exists()
        if not other_active:
            exc.machine.status = "IDLE"
            exc.machine.save(update_fields=["status"])

        MachineEvent.objects.create(
            machine=exc.machine,
            event_type="STATUS_CHANGE",
            details={"from": "RUNNING", "to": "IDLE", "reason": "Stopped via simulator"},
        )

        log_action(
            actor=self._get_system_user(),
            action="SIMULATOR_STOP",
            entity_type="WorkOrderExecution",
            entity_id=exc.pk,
        )

        self._log_event(f"Durduruldu: {exc.machine.name} — {exc.work_order.code}")
        return True

    # ------------------------------------------------------------------
    # Tick — called every second by the engine thread
    # ------------------------------------------------------------------

    def tick(self) -> dict:
        """
        Advance one simulation tick.

        Returns a summary dict with telemetry count and events for display.
        """
        self._tick += 1
        ts = timezone.now()
        summary = {"tick": self._tick, "telemetry_count": 0, "events": []}

        # 1. Generate telemetry for all RUNNING executions
        running_executions = list(
            WorkOrderExecution.objects
            .filter(status="RUNNING")
            .select_related("machine", "work_order")
            .annotate(_produced=Sum("production_logs__good_qty"))
        )

        # Adopt orphan programs: RUNNING executions without a schedule
        # (started before a restart, or resumed sequence steps). Assign a
        # completion time proportional to the remaining quantity so they
        # progress and finish instead of running forever.
        self._adopt_orphan_executions(running_executions, ts)

        # Initialise state for newly detected machines
        for exc in running_executions:
            mid = str(exc.machine_id)
            if mid not in self._states:
                self._states[mid] = MachineState(exc.machine.type)

        packets = []
        for exc in running_executions:
            mid = str(exc.machine_id)
            if mid not in self._states:
                continue
            values = self._states[mid].step()
            packets.append(TelemetryPacket(
                machine_id=exc.machine_id,
                execution_id=exc.id,
                timestamp=ts,
                **values,
            ))
            # Production accumulation — paced as remaining qty over remaining
            # time, so the target is reached right when the program duration
            # expires (self-correcting, works for adopted orphans too). Falls
            # back to the legacy random trickle if no schedule is known yet.
            target = exc.work_order.target_qty if exc.work_order else 0
            acc = self._prod_accumulator[str(exc.id)]
            if exc.program_ends_at and target:
                produced = (exc._produced or 0) + acc["good"]
                remaining = max(0.0, target - produced)
                seconds_left = max(1.0, (exc.program_ends_at - ts).total_seconds())
                acc["good"] += remaining / seconds_left
            elif random.random() < (1 / 60):
                acc["good"] += 1
            if random.random() < 0.0015:
                acc["scrap"] += 1

        if packets:
            TelemetryPacket.objects.bulk_create(packets)
            summary["telemetry_count"] = len(packets)

        # 2. Check for completed programs (duration-based)
        self._check_program_completion(ts, summary)

        # 3. Periodic: heartbeats every 30 ticks
        if self._tick % 30 == 0:
            self._emit_heartbeats(running_executions)

        # 4. Periodic: flush production logs every 60 ticks
        if self._tick % 60 == 0:
            self._flush_production_logs()

        # 5. Periodic: anomaly injection every 300 ticks
        if self._tick % 300 == 0 and running_executions:
            self._inject_anomaly(running_executions, ts)

        # 6. Periodic: prune old telemetry every 600 ticks
        if self._tick % 600 == 0:
            self._prune_old_telemetry()

        # 7. Periodic: update production line statuses every 120 ticks
        if self._tick % 120 == 0:
            self._update_line_statuses()

        # 8. Handle AWAITING_START → RUNNING transitions every 15 ticks
        if self._tick % 15 == 0:
            self._transition_awaiting_start()

        return summary

    # ------------------------------------------------------------------
    # Query helpers
    # ------------------------------------------------------------------

    def get_all_machines(self) -> list[dict]:
        """Return a list of all machines with their current state."""
        machines = Machine.objects.all().order_by("name")
        result = []
        for m in machines:
            mid = str(m.id)
            # Get active execution
            active_exec = WorkOrderExecution.objects.filter(
                machine=m, status__in=["RUNNING", "PAUSED", "AWAITING_START"]
            ).select_related("work_order").first()

            # Progress info
            progress_pct = 0
            remaining_sec = None
            wo_code = None
            exec_id = None
            exec_status = None

            if active_exec:
                wo_code = active_exec.work_order.code
                exec_id = str(active_exec.id)
                exec_status = active_exec.status
                target = active_exec.work_order.target_qty
                actual = sum(log.good_qty for log in active_exec.production_logs.all())
                progress_pct = round((actual / target) * 100, 1) if target > 0 else 0

                if active_exec.program_ends_at:
                    remaining = (active_exec.program_ends_at - timezone.now()).total_seconds()
                    remaining_sec = max(0, round(remaining))

            # Telemetry state
            state = self._states.get(mid)
            telemetry = None
            if state:
                telemetry = {
                    "spindle_speed": round(state.spindle_speed, 2),
                    "feed_rate": round(state.feed_rate, 2),
                    "temperature": round(state.temperature, 2),
                    "vibration": round(state.vibration, 4),
                }

            result.append({
                "id": str(m.id),
                "name": m.name,
                "type": m.type,
                "slug": m.slug,
                "status": m.status,
                "wo_code": wo_code,
                "exec_id": exec_id,
                "exec_status": exec_status,
                "progress_pct": progress_pct,
                "remaining_sec": remaining_sec,
                "telemetry": telemetry,
            })
        return result

    def get_event_log(self, limit: int = 20) -> list[dict]:
        """Return the last N events from the internal event log."""
        with self._lock:
            return list(self._event_log[-limit:])

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _get_system_user(self) -> CustomUser | None:
        """Return the first active admin user, or None."""
        return CustomUser.objects.filter(is_active=True, is_superuser=True).first()

    def _log_event(self, message: str):
        """Add an event to the internal log (thread-safe)."""
        with self._lock:
            self._event_log.append({
                "timestamp": timezone.now().strftime("%H:%M:%S"),
                "message": message,
            })
            # Keep only last 100
            if len(self._event_log) > 100:
                self._event_log = self._event_log[-100:]

    def _adopt_orphan_executions(self, running_executions, ts):
        """
        Give a completion schedule to RUNNING executions that lack one
        (started before a simulator restart, or sequence steps resumed via
        the REST API). The window is proportional to the remaining quantity,
        based on the default 15-sim-minute program length.
        """
        default_real_secs = (15.0 * 60) / self.time_scale
        for exc in running_executions:
            if exc.program_ends_at is not None:
                continue
            target = exc.work_order.target_qty if exc.work_order else 0
            produced = exc._produced or 0
            remaining_ratio = 1.0 if not target else max(0.05, (target - produced) / target)
            exc.program_ends_at = ts + timedelta(seconds=max(30.0, default_real_secs * remaining_ratio))
            exc.save(update_fields=["program_ends_at"])
            self._log_event(
                f"Program süresi atandı: {exc.machine.name} — {exc.work_order.code}"
            )

    def _check_program_completion(self, ts, summary: dict):
        """
        Auto-complete programs whose duration has expired or whose target
        quantity has been reached. Reads the schedule from the database so
        running programs survive simulator restarts.
        """
        due = list(
            WorkOrderExecution.objects
            .filter(status="RUNNING")
            .annotate(_produced=Sum("production_logs__good_qty"))
            .filter(
                Q(program_ends_at__lte=ts)
                | Q(_produced__gte=F("work_order__target_qty"))
            )
            .select_related("machine", "work_order", "work_order__production_line")
        )

        for exc in due:
            exc.status = "COMPLETED"
            exc.completed_at = ts
            exc.save(update_fields=["status", "completed_at"])

            # Check for next machine in sequence
            next_machine = None
            wo = exc.work_order
            if wo.production_line and wo.production_line.machine_sequence:
                seq = wo.production_line.machine_sequence
                current_mid = str(exc.machine.id)
                if current_mid in seq:
                    current_idx = seq.index(current_mid)
                    if current_idx + 1 < len(seq):
                        next_mid = seq[current_idx + 1]
                        try:
                            next_machine = Machine.objects.get(pk=next_mid)
                        except Machine.DoesNotExist:
                            pass

            if next_machine:
                # Create a new execution for the next machine
                WorkOrderExecution.objects.create(
                    work_order=wo,
                    machine=next_machine,
                    status="AWAITING_START"
                )
                self._log_event(f"İş emri {wo.code} sıradaki makineye ({next_machine.name}) aktarıldı.")
            else:
                # Production finished on the last machine. Do NOT auto-complete
                # the work order — the operator must confirm via
                # POST /workorders/{id}/complete/, which archives the order and
                # notifies the customer.
                self._log_event(f"Üretim bitti, operatör onayı bekleniyor: {wo.code}")

            # Flush remaining production
            actual = sum(log.good_qty for log in exc.production_logs.all())
            remaining_qty = max(0, exc.work_order.target_qty - actual)
            if remaining_qty > 0:
                recorder = self._get_system_user()
                ProductionLog.objects.create(
                    execution=exc,
                    recorded_by=recorder,
                    good_qty=remaining_qty,
                    scrap_qty=max(1, int(remaining_qty * 0.002)),
                )

            # Set machine IDLE if no other active work
            other_active = WorkOrderExecution.objects.filter(
                machine=exc.machine, status__in=["RUNNING", "PAUSED", "AWAITING_START"]
            ).exclude(pk=exc.pk).exists()
            if not other_active:
                exc.machine.status = "IDLE"
                exc.machine.save(update_fields=["status"])

            MachineEvent.objects.create(
                machine=exc.machine,
                event_type="STATUS_CHANGE",
                details={
                    "from": "RUNNING", "to": "COMPLETED",
                    "reason": "Program duration expired",
                    "work_order": exc.work_order.code,
                },
            )

            msg = f"Program tamamlandı: {exc.machine.name} — {exc.work_order.code}"
            self._log_event(msg)
            summary["events"].append(msg)
            logger.info(msg)

    def _emit_heartbeats(self, running_executions):
        """Log heartbeat events for running machines."""
        seen = set()
        events = []
        for exc in running_executions:
            mid = exc.machine_id
            if mid in seen:
                continue
            seen.add(mid)
            event_type = "HEARTBEAT_RESTORED" if random.random() < 0.80 else "STATUS_CHANGE"
            events.append(MachineEvent(
                machine_id=mid,
                event_type=event_type,
                details={
                    "message": "Heartbeat OK" if event_type == "HEARTBEAT_RESTORED" else "Status nominal",
                    "uptime_s": random.randint(900, 86400),
                    "work_order": str(exc.work_order_id),
                },
            ))
        if events:
            MachineEvent.objects.bulk_create(events)

    def _flush_production_logs(self):
        """
        Write accumulated good/scrap counts as ProductionLog rows.
        Only the integer part is written; the fractional remainder stays in
        the accumulator so rate-based production doesn't lose parts.
        """
        recorder = self._get_system_user()
        for exec_id_str, counts in list(self._prod_accumulator.items()):
            good_int, scrap_int = int(counts["good"]), int(counts["scrap"])
            if good_int == 0 and scrap_int == 0:
                continue
            try:
                execution = WorkOrderExecution.objects.get(id=exec_id_str, status="RUNNING")
            except WorkOrderExecution.DoesNotExist:
                self._prod_accumulator.pop(exec_id_str, None)
                continue
            ProductionLog.objects.create(
                execution=execution,
                recorded_by=recorder,
                good_qty=good_int,
                scrap_qty=scrap_int,
            )
            counts["good"] -= good_int
            counts["scrap"] -= scrap_int

    def _inject_anomaly(self, running_executions, ts):
        """Inject a transient anomaly into one randomly chosen running machine."""
        exc = random.choice(running_executions)
        mid = str(exc.machine_id)
        state = self._states.get(mid)
        if not state:
            return

        state.inject_anomaly()

        # Capture last 5 min of telemetry as snapshot
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

        window = [{**p, "timestamp": p["timestamp"].isoformat()} for p in raw_packets]
        snapshot = AnomalySnapshot.objects.create(
            execution=exc,
            telemetry_window_json=window,
        )

        recorder = self._get_system_user()
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

        MachineEvent.objects.create(
            machine=exc.machine,
            event_type="STATUS_CHANGE",
            details={
                "message": "Anomaly detected — parameter spike",
                "temperature": round(state.temperature, 1),
                "vibration": round(state.vibration, 4),
                "snapshot_id": str(snapshot.id),
            },
        )
        self._log_event(
            f"ANOMALY: {exc.machine.name} — temp={state.temperature:.1f}, vib={state.vibration:.4f}"
        )

    def _prune_old_telemetry(self):
        """Remove telemetry packets older than 24 hours."""
        cutoff = timezone.now() - timedelta(hours=24)
        deleted, _ = TelemetryPacket.objects.filter(timestamp__lt=cutoff).delete()
        if deleted:
            logger.info(f"Pruned {deleted} old telemetry packet(s)")

    def _update_line_statuses(self):
        """Sync production line statuses based on their machines' states."""
        for line in ProductionLine.objects.prefetch_related("machines").all():
            machine_statuses = set(m.status for m in line.machines.all())
            if "RUNNING" in machine_statuses:
                new_status = "ACTIVE"
            elif machine_statuses <= {"IDLE", "OFFLINE"}:
                new_status = "IDLE"
            else:
                new_status = "ACTIVE"
            if line.status != new_status:
                line.status = new_status
                line.save(update_fields=["status"])

    def _transition_awaiting_start(self):
        """Transition AWAITING_START executions to RUNNING (immediate for simulator)."""
        awaiting = list(
            WorkOrderExecution.objects
            .filter(status="AWAITING_START")
            .select_related("machine", "work_order")
        )
        for exc in awaiting:
            exc.status = "RUNNING"
            exc.save(update_fields=["status"])
            exc.machine.status = "RUNNING"
            exc.machine.save(update_fields=["status"])
            mid = str(exc.machine_id)
            if mid not in self._states:
                self._states[mid] = MachineState(exc.machine.type)
            MachineEvent.objects.create(
                machine=exc.machine,
                event_type="STATUS_CHANGE",
                details={
                    "from": "AWAITING_START", "to": "RUNNING",
                    "reason": "Machine confirmation via simulator",
                    "work_order": exc.work_order.code,
                },
            )
            self._log_event(f"Başlatıldı: {exc.machine.name} — {exc.work_order.code}")
