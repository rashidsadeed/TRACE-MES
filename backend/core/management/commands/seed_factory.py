"""
seed_factory
============
Seeds the TRACE-MES database with a complete, realistic factory dataset.

Creates
-------
* 1 superuser           → admin / admin123
* 3 operator users      → operator1-3 / operator123
* 10 machines           (types matching the frontend mock data)
* 5 parts / products
* 8 defect codes
* 9 work orders         (7 IN_PROGRESS + 2 PENDING)
* Assignments + RUNNING executions for every IN_PROGRESS order
* Initial STATUS_CHANGE MachineEvent for each RUNNING machine

Safe to re-run: existing records (matched by slug / code / sku) are
skipped so you can call this multiple times without duplicates.

Usage
-----
    python manage.py seed_factory
"""

import random

from django.core.management.base import BaseCommand
from django.utils import timezone

from core.models import (
    Machine, Part, DefectCode,
    WorkOrder, WorkOrderAssignment, WorkOrderExecution, MachineEvent,
)
from users.models import CustomUser


# ---------------------------------------------------------------------------
# Static data definitions
# ---------------------------------------------------------------------------

MACHINES = [
    # RUNNING machines get executions and live telemetry
    {"name": "CNC Lathe Alpha",    "slug": "cnc-001",    "type": "CNC",       "status": "RUNNING"},
    {"name": "CNC Mill Beta",      "slug": "cnc-002",    "type": "CNC",       "status": "RUNNING"},
    {"name": "Hydraulic Press X",  "slug": "press-001",  "type": "Press",     "status": "RUNNING"},
    {"name": "MIG Welder Station", "slug": "weld-001",   "type": "Welding",   "status": "RUNNING"},
    {"name": "Reflow Oven",        "slug": "solder-001", "type": "Soldering", "status": "RUNNING"},
    {"name": "ICT Tester",         "slug": "test-001",   "type": "Testing",   "status": "RUNNING"},
    {"name": "Assembly Robot Arm", "slug": "asm-001",    "type": "Assembly",  "status": "RUNNING"},
    # IDLE / DOWN — can be started manually via the UI
    {"name": "Injection Molder A", "slug": "mold-001",   "type": "Molding",   "status": "IDLE"},
    {"name": "Auto Packer",        "slug": "pack-001",   "type": "Packaging", "status": "IDLE"},
    {"name": "Spray Booth 1",      "slug": "paint-001",  "type": "Painting",  "status": "DOWN"},
]

# (name, sku, description)
PARTS = [
    ("Auto Part X-200",        "AP-X200",  "High-precision auto component for transmission systems"),
    ("Circuit Board V2",       "CB-V2",    "Multilayer PCB for industrial control units"),
    ("Battery Casing Model Y", "BC-Y",     "Aluminium housing for EV battery pack"),
    ("Sensor Housing V3",      "SH-V3",    "Injection-moulded casing for industrial sensors"),
    ("Hydraulic Bracket A",    "HB-A",     "Heavy-duty bracket for hydraulic press assembly"),
]

# (code, description, category)
DEFECT_CODES = [
    ("DC-001", "Surface scratch or gouge",           "Surface"),
    ("DC-002", "Dimensional tolerance out of spec",  "Dimensional"),
    ("DC-003", "Cold weld / incomplete fusion",      "Welding"),
    ("DC-004", "Solder bridge between pads",         "Soldering"),
    ("DC-005", "Porosity in cast section",           "Material"),
    ("DC-006", "Delamination of coating layer",      "Surface"),
    ("DC-007", "Thread damage — M6 or M8",          "Threading"),
    ("DC-008", "Burr not removed at edge",           "Finishing"),
]

# (part_sku, wo_code, description, target_qty, priority, machine_slug or None)
# machine_slug=None  →  PENDING order (no execution created)
WORK_ORDERS = [
    ("AP-X200", "WO-2026-001", "Auto Part X-200 milling run — Batch #47",    5000, 3, "cnc-001"),
    ("CB-V2",   "WO-2026-002", "Circuit Board V2 soldering — Lot #18",        2000, 2, "solder-001"),
    ("BC-Y",    "WO-2026-003", "Battery Casing press forming — Shift A",       3000, 3, "press-001"),
    ("SH-V3",   "WO-2026-004", "Sensor Housing weld sealing — Series V3",      1000, 2, "weld-001"),
    ("AP-X200", "WO-2026-005", "Auto Part functional test run",                5000, 2, "test-001"),
    ("HB-A",    "WO-2026-006", "Hydraulic Bracket final assembly",             2000, 2, "asm-001"),
    ("CB-V2",   "WO-2026-007", "Circuit Board secondary CNC trimming",         1500, 1, "cnc-002"),
    # PENDING — queued for mold / packaging
    ("SH-V3",   "WO-2026-008", "Sensor Housing injection moulding — queue",     800, 1, None),
    ("HB-A",    "WO-2026-009", "Hydraulic Bracket packaging run",              1500, 1, None),
]


class Command(BaseCommand):
    help = "Seed the database with a realistic factory dataset for TRACE-MES."

    def handle(self, *args, **options):
        self.stdout.write(self.style.MIGRATE_HEADING(
            "\n╔══════════════════════════════════╗\n"
            "║   TRACE-MES  Factory Seed        ║\n"
            "╚══════════════════════════════════╝"
        ))

        admin      = self._create_admin()
        operators  = self._create_operators()
        machines   = self._create_machines()
        parts      = self._create_parts()
        self._create_defect_codes()
        self._create_work_orders(admin, machines, parts, operators)

        self.stdout.write(self.style.SUCCESS(
            "\n✓  Factory seed complete — system is ready for live data generation.\n"
            "   Next step:  python manage.py run_live_generator\n"
        ))

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _create_admin(self):
        if CustomUser.objects.filter(username="admin").exists():
            self.stdout.write("  [skip] admin user already exists")
            return CustomUser.objects.get(username="admin")

        admin = CustomUser.objects.create_superuser(
            username="admin",
            email="admin@tracemes.local",
            password="admin123",
        )
        self.stdout.write(self.style.SUCCESS("  ✓  Superuser:  admin / admin123"))
        return admin

    def _create_operators(self):
        defs = [
            ("operator1", "op1@tracemes.local", "Ayşe",   "Kaya"),
            ("operator2", "op2@tracemes.local", "Mehmet", "Yıldız"),
            ("operator3", "op3@tracemes.local", "Fatma",  "Demir"),
        ]
        users = []
        for username, email, first, last in defs:
            if CustomUser.objects.filter(username=username).exists():
                self.stdout.write(f"  [skip] {username} already exists")
                users.append(CustomUser.objects.get(username=username))
                continue
            u = CustomUser.objects.create_user(
                username=username, email=email,
                password="operator123",
                first_name=first, last_name=last,
            )
            self.stdout.write(self.style.SUCCESS(f"  ✓  Operator:   {username} / operator123"))
            users.append(u)
        return users

    def _create_machines(self):
        machine_map = {}
        self.stdout.write("\n  --- Machines ---")
        for m in MACHINES:
            obj, created = Machine.objects.get_or_create(
                slug=m["slug"],
                defaults={
                    "name":   m["name"],
                    "type":   m["type"],
                    "status": m["status"],
                },
            )
            if not created and obj.status != m["status"]:
                obj.status = m["status"]
                obj.save(update_fields=["status"])
            machine_map[m["slug"]] = obj
            verb = "✓  Created" if created else "   Exists "
            self.stdout.write(f"  {verb}: {obj.name:28s} ({obj.status})")
        return machine_map

    def _create_parts(self):
        part_map = {}
        self.stdout.write("\n  --- Parts ---")
        for name, sku, desc in PARTS:
            obj, created = Part.objects.get_or_create(
                sku=sku,
                defaults={"name": name, "description": desc},
            )
            part_map[sku] = obj
            verb = "✓  Created" if created else "   Exists "
            self.stdout.write(f"  {verb}: {name:28s} ({sku})")
        return part_map

    def _create_defect_codes(self):
        self.stdout.write("\n  --- Defect Codes ---")
        for code, desc, cat in DEFECT_CODES:
            obj, created = DefectCode.objects.get_or_create(
                code=code,
                defaults={"description": desc, "category": cat},
            )
            if created:
                self.stdout.write(f"  ✓  DefectCode: {code} — {desc[:40]}")

    def _create_work_orders(self, admin, machines, parts, operators):
        self.stdout.write("\n  --- Work Orders ---")
        for part_sku, wo_code, description, target_qty, priority, machine_slug in WORK_ORDERS:
            part      = parts[part_sku]
            wo_status = "IN_PROGRESS" if machine_slug else "PENDING"

            wo, created = WorkOrder.objects.get_or_create(
                code=wo_code,
                defaults={
                    "description": description,
                    "part":        part,
                    "target_qty":  target_qty,
                    "priority":    priority,
                    "status":      wo_status,
                    "created_by":  admin,
                },
            )
            verb = "✓  Created" if created else "   Exists "
            self.stdout.write(f"  {verb}: {wo_code} ({wo_status})")

            if not machine_slug:
                continue

            machine = machines.get(machine_slug)
            if not machine:
                self.stdout.write(self.style.WARNING(f"    ! Machine slug '{machine_slug}' not found — skipping assignment"))
                continue

            # Assignment
            if not WorkOrderAssignment.objects.filter(work_order=wo, machine=machine).exists():
                operator = random.choice(operators)
                WorkOrderAssignment.objects.create(
                    work_order=wo,
                    machine=machine,
                    operator=operator,
                    assigned_by=admin,
                )
                self.stdout.write(f"    → Assigned: {machine.name} / {operator.username}")

            # Execution (only if no active one exists)
            if not WorkOrderExecution.objects.filter(
                work_order=wo, machine=machine, status__in=["RUNNING", "PAUSED"]
            ).exists():
                operator = random.choice(operators)
                WorkOrderExecution.objects.create(
                    work_order=wo,
                    machine=machine,
                    operator=operator,
                    status="RUNNING",
                )
                # Ensure WO is IN_PROGRESS
                if wo.status != "IN_PROGRESS":
                    wo.status = "IN_PROGRESS"
                    wo.save(update_fields=["status", "updated_at"])
                # Ensure machine is RUNNING
                if machine.status != "RUNNING":
                    machine.status = "RUNNING"
                    machine.save(update_fields=["status"])
                # Initial machine event
                MachineEvent.objects.create(
                    machine=machine,
                    event_type="STATUS_CHANGE",
                    details={
                        "from":   "IDLE",
                        "to":     "RUNNING",
                        "reason": "WorkOrder execution started via seed_factory",
                        "work_order": wo_code,
                    },
                )
                self.stdout.write(f"    → Execution RUNNING on {machine.name}")
