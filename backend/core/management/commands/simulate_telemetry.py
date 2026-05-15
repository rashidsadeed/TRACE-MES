import random
import time

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from core.models import Machine, TelemetryPacket, WorkOrderExecution


class Command(BaseCommand):
    help = "Generate mock TelemetryPacket rows for a given machine (runs until Ctrl+C)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--machine",
            type=str,
            required=True,
            help="Slug of the machine to simulate telemetry for.",
        )
        parser.add_argument(
            "--interval",
            type=float,
            default=1.0,
            help="Seconds between packets (default: 1.0).",
        )

    def handle(self, *args, **options):
        slug = options["machine"]
        interval = options["interval"]

        if interval <= 0:
            raise CommandError("--interval must be a positive number.")

        try:
            machine = Machine.objects.get(slug=slug)
        except Machine.DoesNotExist:
            raise CommandError(f"Machine with slug '{slug}' not found.")

        if machine.status != "RUNNING":
            self.stderr.write(
                self.style.WARNING(
                    f"Machine '{machine.name}' status is {machine.status}, not RUNNING. Exiting."
                )
            )
            return

        self.stdout.write(
            self.style.SUCCESS(
                f"Starting telemetry simulation for '{machine.name}' "
                f"(interval={interval}s). Press Ctrl+C to stop."
            )
        )

        count = 0
        try:
            while True:
                ts = timezone.now()

                # Link to active execution if one exists
                execution = WorkOrderExecution.objects.filter(
                    machine=machine, status="RUNNING"
                ).first()

                spindle_speed = random.uniform(800, 1500)
                feed_rate = random.uniform(200, 800)
                temperature = random.uniform(35, 75)
                vibration = random.uniform(0.01, 0.15)

                TelemetryPacket.objects.create(
                    machine=machine,
                    execution=execution,
                    timestamp=ts,
                    spindle_speed=spindle_speed,
                    feed_rate=feed_rate,
                    temperature=temperature,
                    vibration=vibration,
                )

                count += 1
                self.stdout.write(
                    f"[{ts}] spindle={spindle_speed:.1f} feed={feed_rate:.1f} "
                    f"temp={temperature:.1f} vib={vibration:.3f}"
                )

                time.sleep(interval)

        except KeyboardInterrupt:
            self.stdout.write("")  # newline after ^C
            self.stdout.write(
                self.style.SUCCESS(
                    f"Stopped. {count} packet(s) generated for '{machine.name}'."
                )
            )
