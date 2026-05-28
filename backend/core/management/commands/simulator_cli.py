"""
simulator_cli
=============
Django management command that runs the TRACE-MES machine simulator in
headless / CLI mode.  Designed for Docker and server environments where
a Tkinter GUI is not available.

Replaces ``run_live_generator`` with the unified ``MachineSimulator`` engine
that supports accelerated time, program scheduling, and automatic completion.

Usage
-----
    python manage.py simulator_cli
    python manage.py simulator_cli --interval 0.5
"""

import time

from django.core.management.base import BaseCommand
from django.db import connection

from core.simulator.machine_simulator import MachineSimulator, TIME_SCALE_FACTOR


class Command(BaseCommand):
    help = (
        "Run the TRACE-MES machine simulator in CLI mode (headless). "
        "Generates telemetry, manages program lifecycles, and auto-completes "
        "timed programs.  Press Ctrl+C to stop."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--interval",
            type=float,
            default=1.0,
            help="Seconds between simulation ticks (default: 1.0).",
        )

    def handle(self, *args, **options):
        interval = max(0.05, options["interval"])

        self.stdout.write(self.style.SUCCESS(
            f"\n╔══════════════════════════════════════════════╗\n"
            f"║   TRACE-MES Simulator CLI                    ║\n"
            f"║   Interval: {interval}s   Time Scale: {TIME_SCALE_FACTOR}x"
            f"{'':>{21 - len(f'{interval}s   Time Scale: {TIME_SCALE_FACTOR}x')}}║\n"
            f"╚══════════════════════════════════════════════╝\n"
        ))
        self.stdout.write(
            f"  1 real minute = {TIME_SCALE_FACTOR:.0f} simulated minutes\n"
            f"  Press Ctrl+C to stop.\n"
        )

        simulator = MachineSimulator(time_scale=TIME_SCALE_FACTOR)

        try:
            while True:
                tick_start = time.monotonic()

                try:
                    summary = simulator.tick()
                except Exception as e:
                    self.stderr.write(self.style.ERROR(f"  [ERROR] Tick failed: {e}"))
                    import traceback
                    traceback.print_exc()
                    time.sleep(interval)
                    continue

                # Print telemetry count
                if summary["telemetry_count"] > 0:
                    from django.utils import timezone
                    ts = timezone.now().strftime("%H:%M:%S")
                    self.stdout.write(
                        f"  [{ts}] Tick #{summary['tick']}  "
                        f"Telemetry ×{summary['telemetry_count']}"
                    )

                # Print completion events
                for evt in summary.get("events", []):
                    self.stdout.write(self.style.SUCCESS(f"  [EVENT] {evt}"))

                # Sleep remainder
                elapsed = time.monotonic() - tick_start
                sleep_for = interval - elapsed
                if sleep_for > 0:
                    time.sleep(sleep_for)

        except KeyboardInterrupt:
            self.stdout.write(
                "\n" + self.style.SUCCESS(
                    f"[SimulatorCLI] Stopped after {simulator._tick} tick(s)."
                )
            )
        finally:
            connection.close()
