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
* 3 production lines    (groups of machines)
* 9 work orders         (mixed statuses for a realistic snapshot)
* Assignments + executions (RUNNING / AWAITING_START / COMPLETED)
* Initial production logs so jobs already have progress
* Initial STATUS_CHANGE MachineEvent for each RUNNING machine

Safe to re-run: existing records (matched by slug / code / sku) are
skipped so you can call this multiple times without duplicates.

Usage
-----
    python manage.py seed_factory
"""

import random
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from core.models import (
    Machine, Part, DefectCode, ProductionLine,
    WorkOrder, WorkOrderAssignment, WorkOrderExecution, MachineEvent,
    ProductionLog, OrderRequest
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

# Production lines (name, slug, machine_slugs)
PRODUCTION_LINES = [
    ("Auto Parts Assembly Line", "line-auto-parts", ["cnc-001", "press-001", "weld-001"]),
    ("PCB Manufacturing Line",   "line-pcb",        ["solder-001", "test-001"]),
    ("Injection Molding Line",   "line-molding",     ["mold-001"]),
]

# Work orders with realistic mixed statuses
# (part_sku, wo_code, description, target_qty, priority, status,
#  machine_slug_or_None, line_slug_or_None, exec_status_or_None, initial_progress_pct)
WORK_ORDERS = [
    # --- RUNNING on production lines ---
    ("AP-X200", "WO-2026-001", "Auto Part X-200 milling run — Batch #47",
     5000, 3, "IN_PROGRESS", "cnc-001", "line-auto-parts", "RUNNING", 35),
    ("CB-V2",   "WO-2026-002", "Circuit Board V2 soldering — Lot #18",
     2000, 2, "IN_PROGRESS", "solder-001", "line-pcb", "RUNNING", 62),
    # --- RUNNING on direct machine assignment ---
    ("BC-Y",    "WO-2026-003", "Battery Casing press forming — Shift A",
     3000, 3, "IN_PROGRESS", "press-001", None, "RUNNING", 18),
    ("SH-V3",   "WO-2026-004", "Sensor Housing weld sealing — Series V3",
     1000, 2, "IN_PROGRESS", "weld-001", None, "RUNNING", 45),
    # --- AWAITING_START (machine safety confirmation pending) ---
    ("AP-X200", "WO-2026-005", "Auto Part functional test run",
     5000, 2, "IN_PROGRESS", "test-001", None, "AWAITING_START", 0),
    # --- COMPLETED (historical jobs) ---
    ("HB-A",    "WO-2026-006", "Hydraulic Bracket final assembly — DONE",
     2000, 2, "COMPLETED", "asm-001", None, "COMPLETED", 100),
    ("CB-V2",   "WO-2026-007", "Circuit Board secondary CNC trimming — DONE",
     1500, 1, "COMPLETED", "cnc-002", None, "COMPLETED", 100),
    # --- PENDING (not yet accepted — visible in Accept Order) ---
    ("SH-V3",   "WO-2026-008", "Sensor Housing injection moulding — queue",
     800, 1, "PENDING", None, None, None, 0),
    ("HB-A",    "WO-2026-009", "Hydraulic Bracket packaging run",
     1500, 1, "PENDING", None, None, None, 0),
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
        lines      = self._create_production_lines(machines)
        self._create_work_orders(admin, machines, parts, operators, lines)

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

    def _create_production_lines(self, machines):
        line_map = {}
        self.stdout.write("\n  --- Production Lines ---")
        for name, slug, machine_slugs in PRODUCTION_LINES:
            obj, created = ProductionLine.objects.get_or_create(
                slug=slug,
                defaults={"name": name, "status": "ACTIVE"},
            )
            # Assign machines to line
            for ms in machine_slugs:
                m = machines.get(ms)
                if m:
                    obj.machines.add(m)
            line_map[slug] = obj
            verb = "✓  Created" if created else "   Exists "
            machine_names = ", ".join(m.name for m in obj.machines.all())
            self.stdout.write(f"  {verb}: {name:30s} [{machine_names}]")

        # Injection Molding Line → IDLE (no running work)
        molding_line = line_map.get("line-molding")
        if molding_line:
            molding_line.status = "IDLE"
            molding_line.save(update_fields=["status"])

        return line_map

    def _create_work_orders(self, admin, machines, parts, operators, lines):
        self.stdout.write("\n  --- Work Orders ---")
        now = timezone.now()

        for (part_sku, wo_code, description, target_qty, priority,
             wo_status, machine_slug, line_slug, exec_status, progress_pct) in WORK_ORDERS:

            part = parts[part_sku]
            prod_line = lines.get(line_slug) if line_slug else None

            # Spread due dates across the next 1-21 days for a realistic deadline mix.
            due_offset_days = (hash(wo_code) % 21) + 1
            due_date = now + timedelta(days=due_offset_days)

            wo, created = WorkOrder.objects.get_or_create(
                code=wo_code,
                defaults={
                    "description": description,
                    "part":        part,
                    "production_line": prod_line,
                    "target_qty":  target_qty,
                    "priority":    priority,
                    "status":      wo_status,
                    "due_date":    due_date,
                    "created_by":  admin,
                },
            )
            # Backfill due_date on existing rows seeded before the field was added.
            if not created and wo.due_date is None:
                wo.due_date = due_date
                wo.save(update_fields=["due_date"])
            verb = "✓  Created" if created else "   Exists "
            line_info = f" → {prod_line.name}" if prod_line else ""
            self.stdout.write(f"  {verb}: {wo_code} ({wo_status}){line_info}")
            
            # Also create an OrderRequest for the WorkOrder
            # Customers are not created directly in seed_factory, so use admin or leave customer as None
            # Actually, let's create a test customer if it doesn't exist
            customer, _ = CustomUser.objects.get_or_create(
                username="customer1",
                defaults={"email": "customer@tracemes.local", "role_id": 4} # Assuming role_id 4 is customer, but it's better to just set customer=None or admin for seeding if no role
            )
            # Let's just avoid role_id hardcode.
            customer, _ = CustomUser.objects.get_or_create(
                username="test_customer",
                defaults={"email": "cust@test.local"}
            )
            
            req_status_map = {
                "IN_PROGRESS": "APPROVED",
                "PENDING": "PENDING",
                "COMPLETED": "COMPLETED",
                "CANCELLED": "CANCELLED"
            }
            order_req, req_created = OrderRequest.objects.get_or_create(
                work_order=wo,
                defaults={
                    "customer": customer,
                    "title": f"Order for {part.name}",
                    "description": description,
                    "quantity": target_qty,
                    "status": req_status_map.get(wo_status, "PENDING")
                }
            )
            if not req_created and order_req.status != req_status_map.get(wo_status, "PENDING"):
                order_req.status = req_status_map.get(wo_status, "PENDING")
                order_req.save(update_fields=['status'])

            if not machine_slug or not exec_status:
                continue

            machine = machines.get(machine_slug)
            if not machine:
                self.stdout.write(self.style.WARNING(
                    f"    ! Machine slug '{machine_slug}' not found — skipping"
                ))
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

            # Execution
            if not WorkOrderExecution.objects.filter(work_order=wo, machine=machine).exists():
                operator = random.choice(operators)
                exec_obj = WorkOrderExecution.objects.create(
                    work_order=wo,
                    machine=machine,
                    operator=operator,
                    status=exec_status,
                )

                # Set completion time for COMPLETED executions
                if exec_status == "COMPLETED":
                    exec_obj.completed_at = now
                    exec_obj.save(update_fields=["completed_at"])
                    # Machine should be IDLE after completed work
                    if not WorkOrderExecution.objects.filter(
                        machine=machine, status__in=["RUNNING", "AWAITING_START"]
                    ).exists():
                        machine.status = "IDLE"
                        machine.save(update_fields=["status"])

                # Ensure machine is RUNNING for active executions
                if exec_status in ("RUNNING", "AWAITING_START"):
                    if machine.status != "RUNNING":
                        machine.status = "RUNNING"
                        machine.save(update_fields=["status"])

                # Initial machine event
                MachineEvent.objects.create(
                    machine=machine,
                    event_type="STATUS_CHANGE",
                    details={
                        "from":   "IDLE",
                        "to":     exec_status,
                        "reason": f"Execution {exec_status} via seed_factory",
                        "work_order": wo_code,
                    },
                )

                # Create initial production progress
                if progress_pct > 0:
                    initial_qty = int(target_qty * progress_pct / 100)
                    scrap_qty = max(1, int(initial_qty * 0.002))  # ~0.2% scrap
                    ProductionLog.objects.create(
                        execution=exec_obj,
                        recorded_by=operator,
                        good_qty=initial_qty,
                        scrap_qty=scrap_qty,
                    )
                    self.stdout.write(
                        f"    → Execution {exec_status} on {machine.name}"
                        f" (initial progress: {initial_qty}/{target_qty} = {progress_pct}%)"
                    )
                else:
                    self.stdout.write(f"    → Execution {exec_status} on {machine.name}")
