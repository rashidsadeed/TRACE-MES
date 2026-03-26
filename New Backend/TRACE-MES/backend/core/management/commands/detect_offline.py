from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from core.models import Machine, MachineEvent, TelemetryPacket


class Command(BaseCommand):
    help = (
        "Detect machines marked RUNNING that have not sent telemetry recently. "
        "Sets them OFFLINE and creates a HEARTBEAT_LOST event."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--timeout",
            type=int,
            default=3,
            help="Seconds without a packet before a machine is considered offline (default: 3).",
        )

    def handle(self, *args, **options):
        timeout = options["timeout"]

        if timeout <= 0:
            raise CommandError("--timeout must be a positive integer.")

        cutoff = timezone.now() - timedelta(seconds=timeout)

        running_machines = Machine.objects.filter(status="RUNNING")

        if not running_machines.exists():
            self.stdout.write("No machines with status RUNNING found.")
            return

        flagged = 0
        for machine in running_machines:
            last_packet = (
                TelemetryPacket.objects.filter(machine=machine)
                .order_by("-timestamp")
                .first()
            )

            # If no packet at all, or last packet is older than the cutoff
            if last_packet is None or last_packet.timestamp < cutoff:
                last_ts = str(last_packet.timestamp) if last_packet else None

                machine.status = "OFFLINE"
                machine.save(update_fields=["status"])

                MachineEvent.objects.create(
                    machine=machine,
                    event_type="HEARTBEAT_LOST",
                    details={"last_packet_at": last_ts},
                )

                flagged += 1
                self.stderr.write(
                    self.style.WARNING(
                        f"Machine '{machine.name}' (slug={machine.slug}) marked OFFLINE. "
                        f"Last packet: {last_ts}"
                    )
                )

        if flagged == 0:
            self.stdout.write(
                self.style.SUCCESS("All RUNNING machines have recent telemetry.")
            )
        else:
            self.stdout.write(f"{flagged} machine(s) marked OFFLINE.")
