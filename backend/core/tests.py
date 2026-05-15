import hashlib
import uuid
from django.test import TestCase
from django.db import IntegrityError
from django.db.models import ProtectedError

from django.utils import timezone
from rest_framework import status as http_status
from rest_framework.test import APIClient

from core.models import (
    Machine, Part, WorkOrder, WorkOrderAssignment, WorkOrderExecution,
    DefectCode, ProductionLog, AnomalySnapshot, ScrapLog,
    TelemetryPacket, MachineEvent, AuditLog, DataExportJob,
    SystemConfig, Operation,
)
from users.models import CustomUser, ApiClient


class WorkOrderModelTests(TestCase):
    """Tests for the WorkOrder and WorkOrderAssignment models (TASK-005)."""

    def setUp(self):
        """Create shared fixtures used across multiple tests."""
        self.user = CustomUser.objects.create_user(
            username="testoperator",
            email="operator@example.com",
            password="securePass123!",
        )
        self.part = Part.objects.create(
            name="Widget A",
            sku="WGT-001",
            description="A test widget",
        )
        self.machine = Machine.objects.create(
            name="CNC Mill 1",
            type="Milling",
        )

    # 1. WorkOrder creation
    def test_workorder_creation(self):
        wo = WorkOrder.objects.create(
            code="WO-2026-001",
            part=self.part,
            target_qty=100,
            created_by=self.user,
        )
        self.assertIsNotNone(wo.pk)
        self.assertIsInstance(wo.id, uuid.UUID)

    # 2. WorkOrder default status
    def test_workorder_default_status(self):
        wo = WorkOrder.objects.create(
            code="WO-2026-002",
            part=self.part,
            target_qty=50,
        )
        self.assertEqual(wo.status, "PENDING")

    # 3. WorkOrder unique code
    def test_workorder_unique_code(self):
        WorkOrder.objects.create(
            code="WO-DUP",
            part=self.part,
            target_qty=10,
        )
        with self.assertRaises(IntegrityError):
            WorkOrder.objects.create(
                code="WO-DUP",
                part=self.part,
                target_qty=20,
            )

    # 4. WorkOrder __str__
    def test_workorder_str(self):
        wo = WorkOrder.objects.create(
            code="WO-2026-003",
            part=self.part,
            target_qty=75,
        )
        self.assertEqual(str(wo), "WO-2026-003 (PENDING)")

    # 5. WorkOrder Part PROTECT
    def test_workorder_part_protect(self):
        WorkOrder.objects.create(
            code="WO-PROTECT",
            part=self.part,
            target_qty=10,
        )
        with self.assertRaises(ProtectedError):
            self.part.delete()

    # 6. WorkOrderAssignment creation
    def test_workorderassignment_creation(self):
        wo = WorkOrder.objects.create(
            code="WO-ASSIGN-001",
            part=self.part,
            target_qty=30,
        )
        assignment = WorkOrderAssignment.objects.create(
            work_order=wo,
            machine=self.machine,
            operator=self.user,
            assigned_by=self.user,
        )
        self.assertIsNotNone(assignment.pk)
        self.assertIsInstance(assignment.id, uuid.UUID)

    # 7. WorkOrderAssignment CASCADE on WorkOrder delete
    def test_workorderassignment_cascade_on_workorder_delete(self):
        wo = WorkOrder.objects.create(
            code="WO-CASCADE",
            part=self.part,
            target_qty=15,
        )
        WorkOrderAssignment.objects.create(
            work_order=wo,
            machine=self.machine,
            operator=self.user,
            assigned_by=self.user,
        )
        self.assertEqual(WorkOrderAssignment.objects.count(), 1)
        wo.delete()
        self.assertEqual(WorkOrderAssignment.objects.count(), 0)

    # 8. WorkOrderAssignment Machine PROTECT
    def test_workorderassignment_machine_protect(self):
        wo = WorkOrder.objects.create(
            code="WO-MPROTECT",
            part=self.part,
            target_qty=25,
        )
        WorkOrderAssignment.objects.create(
            work_order=wo,
            machine=self.machine,
            operator=self.user,
            assigned_by=self.user,
        )
        with self.assertRaises(ProtectedError):
            self.machine.delete()

    # 9. WorkOrderAssignment __str__
    def test_workorderassignment_str(self):
        wo = WorkOrder.objects.create(
            code="WO-STR",
            part=self.part,
            target_qty=5,
        )
        assignment = WorkOrderAssignment.objects.create(
            work_order=wo,
            machine=self.machine,
            operator=self.user,
            assigned_by=self.user,
        )
        self.assertEqual(str(assignment), "WO WO-STR -> Machine CNC Mill 1")


class WorkOrderAPITests(TestCase):
    """API tests for the WorkOrder endpoints (TASK-006)."""

    def setUp(self):
        """Create admin user, authenticate via JWT, and set up test fixtures."""
        self.admin_user = CustomUser.objects.create_user(
            username="apiadmin",
            email="apiadmin@example.com",
            password="SecurePass123!",
            is_staff=True,
        )
        self.operator_user = CustomUser.objects.create_user(
            username="apioperator",
            email="apioperator@example.com",
            password="SecurePass123!",
        )
        self.part = Part.objects.create(
            name="API Widget",
            sku="API-WGT-001",
            description="A widget for API tests",
        )
        self.machine = Machine.objects.create(
            name="API CNC Mill",
            type="Milling",
            status="IDLE",
        )

        # Authenticate via JWT
        from rest_framework.test import APIClient as DRFAPIClient
        self.client = DRFAPIClient()
        response = self.client.post(
            "/api/auth/login/",
            {"username": "apiadmin", "password": "SecurePass123!"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, f"Login failed: {response.data}")
        token = response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

        self.base_url = "/api/workorders/"

    def _create_workorder_via_api(self, code="WO-API-001", target_qty=100, **kwargs):
        """Helper: create a work order via POST and return (response, wo_id)."""
        data = {
            "code": code,
            "part": str(self.part.pk),
            "target_qty": target_qty,
        }
        data.update(kwargs)
        resp = self.client.post(self.base_url, data, format="json")
        wo_id = None
        if resp.status_code == 201:
            wo_id = str(WorkOrder.objects.get(code=code).pk)
        return resp, wo_id

    # ---- LIST ----

    def test_list_workorders_returns_200(self):
        response = self.client.get(self.base_url)
        self.assertEqual(response.status_code, 200)

    def test_list_filter_by_status(self):
        self._create_workorder_via_api(code="WO-PEND-1")
        self._create_workorder_via_api(code="WO-PEND-2")
        # Change the second one to a different status directly in DB
        wo = WorkOrder.objects.get(code="WO-PEND-2")
        WorkOrder.objects.filter(pk=wo.pk).update(status="IN_PROGRESS")

        response = self.client.get(self.base_url, {"status": "PENDING"})
        self.assertEqual(response.status_code, 200)
        codes = [item["code"] for item in response.data]
        self.assertIn("WO-PEND-1", codes)
        self.assertNotIn("WO-PEND-2", codes)

    def test_list_unauthenticated_returns_401(self):
        from rest_framework.test import APIClient as DRFAPIClient
        anon_client = DRFAPIClient()
        response = anon_client.get(self.base_url)
        self.assertEqual(response.status_code, 401)

    # ---- CREATE ----

    def test_create_workorder_returns_201(self):
        resp, wo_id = self._create_workorder_via_api(code="WO-CREATE-01")
        self.assertEqual(resp.status_code, 201)
        self.assertIn("code", resp.data)
        # Verify the object was actually persisted with expected fields
        wo = WorkOrder.objects.get(pk=wo_id)
        self.assertIsNotNone(wo.pk)
        self.assertIsNotNone(wo.status)

    def test_create_workorder_default_status_pending(self):
        resp, wo_id = self._create_workorder_via_api(code="WO-DFLT-STATUS")
        self.assertEqual(resp.status_code, 201)
        wo = WorkOrder.objects.get(pk=wo_id)
        self.assertEqual(wo.status, "PENDING")

    def test_create_workorder_sets_created_by(self):
        resp, wo_id = self._create_workorder_via_api(code="WO-CREATED-BY")
        self.assertEqual(resp.status_code, 201)
        wo = WorkOrder.objects.get(pk=wo_id)
        self.assertEqual(wo.created_by, self.admin_user)

    def test_create_workorder_writes_audit_log(self):
        from core.models import AuditLog
        resp, _ = self._create_workorder_via_api(code="WO-AUDIT-CREATE")
        self.assertEqual(resp.status_code, 201)
        log = AuditLog.objects.filter(action="CREATE_WORKORDER").last()
        self.assertIsNotNone(log)
        self.assertEqual(log.entity_type, "WorkOrder")

    def test_create_workorder_duplicate_code_returns_400(self):
        self._create_workorder_via_api(code="WO-DUP-API")
        resp, _ = self._create_workorder_via_api(code="WO-DUP-API")
        self.assertEqual(resp.status_code, 400)

    def test_create_workorder_missing_required_fields_returns_400(self):
        response = self.client.post(self.base_url, {}, format="json")
        self.assertEqual(response.status_code, 400)

    # ---- RETRIEVE ----

    def test_retrieve_workorder_returns_200(self):
        _, wo_id = self._create_workorder_via_api(code="WO-RETRIEVE")
        response = self.client.get(f"{self.base_url}{wo_id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["code"], "WO-RETRIEVE")

    # ---- UPDATE ----

    def test_patch_workorder_description_returns_200(self):
        _, wo_id = self._create_workorder_via_api(code="WO-PATCH-DESC")
        response = self.client.patch(
            f"{self.base_url}{wo_id}/",
            {"description": "new desc"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)

    def test_patch_workorder_cannot_change_status(self):
        _, wo_id = self._create_workorder_via_api(code="WO-NO-STATUS")
        self.client.patch(
            f"{self.base_url}{wo_id}/",
            {"status": "COMPLETED"},
            format="json",
        )
        wo = WorkOrder.objects.get(pk=wo_id)
        self.assertEqual(wo.status, "PENDING")

    def test_patch_workorder_cannot_change_code(self):
        _, wo_id = self._create_workorder_via_api(code="WO-NO-CODE")
        self.client.patch(
            f"{self.base_url}{wo_id}/",
            {"code": "NEW-CODE"},
            format="json",
        )
        wo = WorkOrder.objects.get(pk=wo_id)
        self.assertEqual(wo.code, "WO-NO-CODE")

    def test_patch_workorder_writes_audit_log(self):
        from core.models import AuditLog
        _, wo_id = self._create_workorder_via_api(code="WO-AUDIT-PATCH")
        self.client.patch(
            f"{self.base_url}{wo_id}/",
            {"description": "patched"},
            format="json",
        )
        log = AuditLog.objects.filter(action="UPDATE_WORKORDER").last()
        self.assertIsNotNone(log)
        self.assertIsNotNone(log.before_json)
        self.assertIsNotNone(log.after_json)

    # ---- ASSIGN ----

    def test_assign_machine_and_operator_returns_201(self):
        _, wo_id = self._create_workorder_via_api(code="WO-ASSIGN-API")
        response = self.client.post(
            f"{self.base_url}{wo_id}/assign/",
            {
                "machine": str(self.machine.pk),
                "operator": str(self.operator_user.pk),
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)

    def test_assign_writes_audit_log(self):
        from core.models import AuditLog
        _, wo_id = self._create_workorder_via_api(code="WO-ASSIGN-AUDIT")
        self.client.post(
            f"{self.base_url}{wo_id}/assign/",
            {
                "machine": str(self.machine.pk),
                "operator": str(self.operator_user.pk),
            },
            format="json",
        )
        log = AuditLog.objects.filter(action="ASSIGN_WORKORDER").last()
        self.assertIsNotNone(log)
        self.assertEqual(log.entity_type, "WorkOrderAssignment")

    def test_assign_sets_assigned_by(self):
        _, wo_id = self._create_workorder_via_api(code="WO-ASSIGN-BY")
        response = self.client.post(
            f"{self.base_url}{wo_id}/assign/",
            {
                "machine": str(self.machine.pk),
                "operator": str(self.operator_user.pk),
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["assigned_by"]["username"], self.admin_user.username)

    # ---- ASSIGNMENTS LIST ----

    def test_list_assignments_returns_200(self):
        _, wo_id = self._create_workorder_via_api(code="WO-LISTASSIGN")
        # Create an assignment first
        self.client.post(
            f"{self.base_url}{wo_id}/assign/",
            {
                "machine": str(self.machine.pk),
                "operator": str(self.operator_user.pk),
            },
            format="json",
        )
        response = self.client.get(f"{self.base_url}{wo_id}/assignments/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)

    # ---- DELETE ----

    def test_delete_workorder_returns_405(self):
        _, wo_id = self._create_workorder_via_api(code="WO-DELETE")
        response = self.client.delete(f"{self.base_url}{wo_id}/")
        self.assertEqual(response.status_code, 405)


class WorkOrderExecutionModelTests(TestCase):
    """Tests for the WorkOrderExecution model (TASK-007)."""

    def setUp(self):
        """Create shared fixtures: user, part, machine, work order."""
        self.user = CustomUser.objects.create_user(
            username="exec_operator",
            email="exec_op@example.com",
            password="securePass123!",
        )
        self.part = Part.objects.create(
            name="Exec Widget",
            sku="EXEC-001",
            description="Part for execution tests",
        )
        self.machine = Machine.objects.create(
            name="Exec CNC Mill",
            type="Milling",
        )
        self.work_order = WorkOrder.objects.create(
            code="WO-EXEC-001",
            part=self.part,
            target_qty=50,
            created_by=self.user,
        )

    # 1. Creation — verify UUID pk
    def test_execution_creation_uuid_pk(self):
        execution = WorkOrderExecution.objects.create(
            work_order=self.work_order,
            machine=self.machine,
            operator=self.user,
        )
        self.assertIsNotNone(execution.pk)
        self.assertIsInstance(execution.id, uuid.UUID)

    # 2. Default status is RUNNING
    def test_execution_default_status_running(self):
        execution = WorkOrderExecution.objects.create(
            work_order=self.work_order,
            machine=self.machine,
            operator=self.user,
        )
        self.assertEqual(execution.status, "RUNNING")

    # 3. __str__ representation
    def test_execution_str(self):
        execution = WorkOrderExecution.objects.create(
            work_order=self.work_order,
            machine=self.machine,
            operator=self.user,
        )
        expected = f"Execution {execution.id} for WO-EXEC-001 (RUNNING)"
        self.assertEqual(str(execution), expected)

    # 4. WorkOrder CASCADE — deleting WO deletes its executions
    def test_execution_cascade_on_workorder_delete(self):
        WorkOrderExecution.objects.create(
            work_order=self.work_order,
            machine=self.machine,
            operator=self.user,
        )
        self.assertEqual(WorkOrderExecution.objects.count(), 1)
        self.work_order.delete()
        self.assertEqual(WorkOrderExecution.objects.count(), 0)

    # 5. Machine PROTECT — cannot delete a machine linked to an execution
    def test_execution_machine_protect(self):
        WorkOrderExecution.objects.create(
            work_order=self.work_order,
            machine=self.machine,
            operator=self.user,
        )
        with self.assertRaises(ProtectedError):
            self.machine.delete()

    # 6. paused_at and completed_at are nullable (start as None)
    def test_execution_nullable_timestamps(self):
        execution = WorkOrderExecution.objects.create(
            work_order=self.work_order,
            machine=self.machine,
            operator=self.user,
        )
        self.assertIsNone(execution.paused_at)
        self.assertIsNone(execution.completed_at)


class ExecutionAPITests(TestCase):
    """API tests for the Production Execution endpoints (TASK-008)."""

    def setUp(self):
        """Create admin user, operator, authenticate via JWT, and set up fixtures."""
        from rest_framework.test import APIClient as DRFAPIClient

        self.admin_user = CustomUser.objects.create_user(
            username="exec_admin",
            email="execadmin@example.com",
            password="SecurePass123!",
            is_staff=True,
        )
        self.operator_user = CustomUser.objects.create_user(
            username="exec_operator2",
            email="execop2@example.com",
            password="SecurePass123!",
        )
        self.part = Part.objects.create(
            name="Exec API Widget",
            sku="EXEC-API-001",
            description="Part for execution API tests",
        )
        self.machine = Machine.objects.create(
            name="Exec API Mill",
            type="Milling",
            status="IDLE",
        )
        self.work_order = WorkOrder.objects.create(
            code="WO-EXECAPI-001",
            part=self.part,
            target_qty=100,
            status="PENDING",
            created_by=self.admin_user,
        )

        # Authenticate via JWT
        self.client = DRFAPIClient()
        response = self.client.post(
            "/api/auth/login/",
            {"username": "exec_admin", "password": "SecurePass123!"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, f"Login failed: {response.data}")
        token = response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

        self.base_url = "/api/executions/"

    # ---- helper ----

    def _start_execution(self, work_order=None, machine=None, operator=None):
        """POST to /api/executions/start/ and return (response, execution_uuid)."""
        data = {
            "work_order": str((work_order or self.work_order).pk),
            "machine": str((machine or self.machine).pk),
            "operator": str((operator or self.operator_user).pk),
        }
        resp = self.client.post(f"{self.base_url}start/", data, format="json")
        exec_id = resp.data.get("id") if resp.status_code == 201 else None
        return resp, exec_id

    # ---- START tests ----

    # 1
    def test_start_execution_returns_201(self):
        resp, exec_id = self._start_execution()
        self.assertEqual(resp.status_code, 201)
        self.assertIsNotNone(exec_id)

    # 2
    def test_start_sets_workorder_in_progress(self):
        self._start_execution()
        self.work_order.refresh_from_db()
        self.assertEqual(self.work_order.status, "IN_PROGRESS")

    # 3
    def test_start_sets_machine_running(self):
        self._start_execution()
        self.machine.refresh_from_db()
        self.assertEqual(self.machine.status, "RUNNING")

    # 4
    def test_start_invalid_workorder_status_returns_400(self):
        completed_wo = WorkOrder.objects.create(
            code="WO-COMPLETED-001",
            part=self.part,
            target_qty=10,
            status="COMPLETED",
            created_by=self.admin_user,
        )
        resp, _ = self._start_execution(work_order=completed_wo)
        self.assertEqual(resp.status_code, 400)

    # 5
    def test_start_offline_machine_returns_400(self):
        offline_machine = Machine.objects.create(
            name="Offline Mill",
            type="Milling",
            status="OFFLINE",
        )
        resp, _ = self._start_execution(machine=offline_machine)
        self.assertEqual(resp.status_code, 400)

    # 6
    def test_start_writes_audit_log(self):
        from core.models import AuditLog
        self._start_execution()
        log = AuditLog.objects.filter(action="START_EXECUTION").last()
        self.assertIsNotNone(log)
        self.assertEqual(log.entity_type, "WorkOrderExecution")

    # ---- PAUSE tests ----

    # 7
    def test_pause_running_execution_returns_200(self):
        _, exec_id = self._start_execution()
        resp = self.client.post(f"{self.base_url}{exec_id}/pause/", format="json")
        self.assertEqual(resp.status_code, 200)

    # 8
    def test_pause_sets_paused_at(self):
        _, exec_id = self._start_execution()
        self.client.post(f"{self.base_url}{exec_id}/pause/", format="json")
        execution = WorkOrderExecution.objects.get(pk=exec_id)
        self.assertIsNotNone(execution.paused_at)

    # 9
    def test_pause_completed_execution_returns_400(self):
        _, exec_id = self._start_execution()
        # Stop the execution first to mark it COMPLETED
        self.client.post(f"{self.base_url}{exec_id}/stop/", format="json")
        resp = self.client.post(f"{self.base_url}{exec_id}/pause/", format="json")
        self.assertEqual(resp.status_code, 400)

    # ---- RESUME tests ----

    # 10
    def test_resume_paused_execution_returns_200(self):
        _, exec_id = self._start_execution()
        self.client.post(f"{self.base_url}{exec_id}/pause/", format="json")
        resp = self.client.post(f"{self.base_url}{exec_id}/resume/", format="json")
        self.assertEqual(resp.status_code, 200)

    # 11
    def test_resume_clears_paused_at(self):
        _, exec_id = self._start_execution()
        self.client.post(f"{self.base_url}{exec_id}/pause/", format="json")
        self.client.post(f"{self.base_url}{exec_id}/resume/", format="json")
        execution = WorkOrderExecution.objects.get(pk=exec_id)
        self.assertIsNone(execution.paused_at)

    # 12
    def test_resume_running_execution_returns_400(self):
        _, exec_id = self._start_execution()
        resp = self.client.post(f"{self.base_url}{exec_id}/resume/", format="json")
        self.assertEqual(resp.status_code, 400)

    # ---- STOP tests ----

    # 13
    def test_stop_execution_returns_200(self):
        _, exec_id = self._start_execution()
        resp = self.client.post(f"{self.base_url}{exec_id}/stop/", format="json")
        self.assertEqual(resp.status_code, 200)

    # 14
    def test_stop_sets_machine_idle(self):
        _, exec_id = self._start_execution()
        self.client.post(f"{self.base_url}{exec_id}/stop/", format="json")
        self.machine.refresh_from_db()
        self.assertEqual(self.machine.status, "IDLE")

    # 15
    def test_stop_completed_execution_returns_400(self):
        _, exec_id = self._start_execution()
        self.client.post(f"{self.base_url}{exec_id}/stop/", format="json")
        resp = self.client.post(f"{self.base_url}{exec_id}/stop/", format="json")
        self.assertEqual(resp.status_code, 400)

    # ---- B-3: Machine stays RUNNING when another active execution exists ----

    # 16
    def test_stop_one_execution_machine_stays_running_if_another_active(self):
        """B-3 fix: stopping one execution must NOT set machine to IDLE
        when another active execution still exists on the same machine."""
        # Create a second work order so we can start two executions on the same machine.
        wo2 = WorkOrder.objects.create(
            code="WO-EXECAPI-002",
            part=self.part,
            target_qty=50,
            status="PENDING",
            created_by=self.admin_user,
        )

        # Start execution 1 on self.machine (machine -> RUNNING, WO1 -> IN_PROGRESS)
        resp1, exec_id_1 = self._start_execution()
        self.assertEqual(resp1.status_code, 201)

        # Start execution 2 on the same machine with the second work order.
        # WO2 is still PENDING so it can be started.
        resp2, exec_id_2 = self._start_execution(work_order=wo2)
        self.assertEqual(resp2.status_code, 201)

        # Confirm both executions are RUNNING
        self.assertEqual(WorkOrderExecution.objects.get(pk=exec_id_1).status, "RUNNING")
        self.assertEqual(WorkOrderExecution.objects.get(pk=exec_id_2).status, "RUNNING")

        # Stop execution 1
        stop_resp = self.client.post(f"{self.base_url}{exec_id_1}/stop/", format="json")
        self.assertEqual(stop_resp.status_code, 200)

        # Machine must still be RUNNING because execution 2 is still active
        self.machine.refresh_from_db()
        self.assertEqual(self.machine.status, "RUNNING")

    # ---- B-4: Stopping a PAUSED execution clears paused_at ----

    # 17
    def test_stop_paused_execution_clears_paused_at(self):
        """B-4 fix: stopping a PAUSED execution must set paused_at to None."""
        _, exec_id = self._start_execution()

        # Pause
        pause_resp = self.client.post(f"{self.base_url}{exec_id}/pause/", format="json")
        self.assertEqual(pause_resp.status_code, 200)
        execution = WorkOrderExecution.objects.get(pk=exec_id)
        self.assertIsNotNone(execution.paused_at)

        # Stop the paused execution
        stop_resp = self.client.post(f"{self.base_url}{exec_id}/stop/", format="json")
        self.assertEqual(stop_resp.status_code, 200)

        execution.refresh_from_db()
        self.assertEqual(execution.status, "COMPLETED")
        self.assertIsNone(execution.paused_at)

    # ---- Unauthenticated access returns 401 ----

    # 18
    def test_unauthenticated_start_returns_401(self):
        """All execution endpoints must reject unauthenticated requests with 401."""
        from rest_framework.test import APIClient as DRFAPIClient
        anon = DRFAPIClient()

        resp = anon.post(
            f"{self.base_url}start/",
            {
                "work_order": str(self.work_order.pk),
                "machine": str(self.machine.pk),
                "operator": str(self.operator_user.pk),
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 401)

    # 19
    def test_unauthenticated_pause_returns_401(self):
        from rest_framework.test import APIClient as DRFAPIClient
        anon = DRFAPIClient()
        # Start an execution with the authenticated client so we have a valid ID
        _, exec_id = self._start_execution()
        resp = anon.post(f"{self.base_url}{exec_id}/pause/", format="json")
        self.assertEqual(resp.status_code, 401)

    # 20
    def test_unauthenticated_resume_returns_401(self):
        from rest_framework.test import APIClient as DRFAPIClient
        anon = DRFAPIClient()
        _, exec_id = self._start_execution()
        resp = anon.post(f"{self.base_url}{exec_id}/resume/", format="json")
        self.assertEqual(resp.status_code, 401)

    # 21
    def test_unauthenticated_stop_returns_401(self):
        from rest_framework.test import APIClient as DRFAPIClient
        anon = DRFAPIClient()
        _, exec_id = self._start_execution()
        resp = anon.post(f"{self.base_url}{exec_id}/stop/", format="json")
        self.assertEqual(resp.status_code, 401)


class QualityModelTests(TestCase):
    """Tests for Quality models: DefectCode, ProductionLog, AnomalySnapshot, ScrapLog (TASK-009)."""

    def setUp(self):
        """Create shared fixtures: user, part, machine, work_order, execution."""
        self.user = CustomUser.objects.create_user(
            username="quality_operator",
            email="qualityop@example.com",
            password="securePass123!",
        )
        self.part = Part.objects.create(
            name="Quality Widget",
            sku="QLT-001",
            description="Part for quality tests",
        )
        self.machine = Machine.objects.create(
            name="Quality CNC Mill",
            type="Milling",
        )
        self.work_order = WorkOrder.objects.create(
            code="WO-QLT-001",
            part=self.part,
            target_qty=100,
            created_by=self.user,
        )
        self.execution = WorkOrderExecution.objects.create(
            work_order=self.work_order,
            machine=self.machine,
            operator=self.user,
        )

    # ---- DefectCode tests ----

    # 1
    def test_defectcode_creation(self):
        dc = DefectCode.objects.create(
            code="DC-001",
            description="Surface scratch",
            category="COSMETIC",
        )
        self.assertIsNotNone(dc.pk)
        self.assertIsInstance(dc.id, uuid.UUID)

    # 2
    def test_defectcode_unique_code(self):
        DefectCode.objects.create(
            code="DC-DUP",
            description="First",
            category="COSMETIC",
        )
        with self.assertRaises(IntegrityError):
            DefectCode.objects.create(
                code="DC-DUP",
                description="Second",
                category="STRUCTURAL",
            )

    # 3
    def test_defectcode_str(self):
        dc = DefectCode.objects.create(
            code="DC-STR",
            description="Chip mark",
            category="STRUCTURAL",
        )
        self.assertEqual(str(dc), "DC-STR (STRUCTURAL)")

    # ---- ProductionLog tests ----

    # 4
    def test_productionlog_creation(self):
        pl = ProductionLog.objects.create(
            execution=self.execution,
            recorded_by=self.user,
            good_qty=90,
            scrap_qty=10,
        )
        self.assertIsNotNone(pl.pk)
        self.assertIsInstance(pl.id, uuid.UUID)
        self.assertEqual(pl.good_qty, 90)
        self.assertEqual(pl.scrap_qty, 10)

    # 5
    def test_productionlog_cascade_on_execution_delete(self):
        ProductionLog.objects.create(
            execution=self.execution,
            recorded_by=self.user,
            good_qty=50,
            scrap_qty=5,
        )
        self.assertEqual(ProductionLog.objects.count(), 1)
        self.execution.delete()
        self.assertEqual(ProductionLog.objects.count(), 0)

    # 6
    def test_productionlog_user_set_null(self):
        pl = ProductionLog.objects.create(
            execution=self.execution,
            recorded_by=self.user,
            good_qty=40,
            scrap_qty=2,
        )
        self.user.hard_delete()  # CustomUser.delete() is soft-delete; need real DB delete
        pl.refresh_from_db()
        self.assertIsNone(pl.recorded_by)

    # ---- AnomalySnapshot tests ----

    # 7
    def test_anomalysnapshot_creation(self):
        telemetry_data = {"spindle_speed": [1200, 1250, 1300], "temperature": [45.2, 46.1, 47.0]}
        snap = AnomalySnapshot.objects.create(
            execution=self.execution,
            telemetry_window_json=telemetry_data,
        )
        self.assertIsNotNone(snap.pk)
        self.assertIsInstance(snap.id, uuid.UUID)
        self.assertEqual(snap.telemetry_window_json, telemetry_data)

    # 8
    def test_anomalysnapshot_cascade_on_execution_delete(self):
        AnomalySnapshot.objects.create(
            execution=self.execution,
            telemetry_window_json={"vibration": [0.5, 0.7]},
        )
        self.assertEqual(AnomalySnapshot.objects.count(), 1)
        self.execution.delete()
        self.assertEqual(AnomalySnapshot.objects.count(), 0)

    # ---- ScrapLog tests ----

    # 9
    def test_scraplog_creation(self):
        dc = DefectCode.objects.create(code="DC-SCRAP-01", description="Crack", category="STRUCTURAL")
        pl = ProductionLog.objects.create(
            execution=self.execution,
            recorded_by=self.user,
            good_qty=80,
            scrap_qty=20,
        )
        sl = ScrapLog.objects.create(
            production_log=pl,
            defect_code=dc,
            qty=5,
        )
        self.assertIsNotNone(sl.pk)
        self.assertIsInstance(sl.id, uuid.UUID)
        self.assertEqual(sl.qty, 5)

    # 10
    def test_scraplog_defectcode_protect(self):
        dc = DefectCode.objects.create(code="DC-PROTECT", description="Dent", category="COSMETIC")
        pl = ProductionLog.objects.create(
            execution=self.execution,
            recorded_by=self.user,
            good_qty=70,
            scrap_qty=10,
        )
        ScrapLog.objects.create(
            production_log=pl,
            defect_code=dc,
            qty=3,
        )
        with self.assertRaises(ProtectedError):
            dc.delete()

    # 11
    def test_scraplog_cascade_on_productionlog_delete(self):
        dc = DefectCode.objects.create(code="DC-CASCADE", description="Burr", category="COSMETIC")
        pl = ProductionLog.objects.create(
            execution=self.execution,
            recorded_by=self.user,
            good_qty=60,
            scrap_qty=15,
        )
        ScrapLog.objects.create(
            production_log=pl,
            defect_code=dc,
            qty=7,
        )
        self.assertEqual(ScrapLog.objects.count(), 1)
        pl.delete()
        self.assertEqual(ScrapLog.objects.count(), 0)

    # 12
    def test_scraplog_anomaly_snapshot_set_null(self):
        dc = DefectCode.objects.create(code="DC-SETNULL", description="Warp", category="DIMENSIONAL")
        pl = ProductionLog.objects.create(
            execution=self.execution,
            recorded_by=self.user,
            good_qty=55,
            scrap_qty=8,
        )
        snap = AnomalySnapshot.objects.create(
            execution=self.execution,
            telemetry_window_json={"temp": [50, 55]},
        )
        sl = ScrapLog.objects.create(
            production_log=pl,
            defect_code=dc,
            qty=4,
            anomaly_snapshot=snap,
        )
        self.assertIsNotNone(sl.anomaly_snapshot)
        snap.delete()
        sl.refresh_from_db()
        self.assertIsNone(sl.anomaly_snapshot)


class TelemetryModelTests(TestCase):
    """Tests for the TelemetryPacket and MachineEvent models (TASK-011)."""

    def setUp(self):
        self.user = CustomUser.objects.create_user(
            username="telemetry_op",
            email="telemetry_op@example.com",
            password="securePass123!",
        )
        self.part = Part.objects.create(name="Telem Part", sku="TELEM-001")
        self.machine = Machine.objects.create(name="Telem Mill", type="Milling", status="IDLE")
        self.work_order = WorkOrder.objects.create(
            code="WO-TELEM-001", part=self.part, target_qty=50, created_by=self.user,
        )
        self.execution = WorkOrderExecution.objects.create(
            work_order=self.work_order, machine=self.machine, operator=self.user,
        )

    # ---- TelemetryPacket tests ----

    def test_telemetrypacket_creation(self):
        tp = TelemetryPacket.objects.create(
            machine=self.machine,
            execution=self.execution,
            timestamp=timezone.now(),
            spindle_speed=1200.0,
            feed_rate=500.0,
            temperature=45.5,
            vibration=0.03,
        )
        self.assertIsNotNone(tp.pk)
        self.assertIsInstance(tp.pk, int)  # BigAutoField, not UUID

    def test_telemetrypacket_cascade_on_machine_delete(self):
        TelemetryPacket.objects.create(
            machine=self.machine, timestamp=timezone.now(),
            spindle_speed=1000, feed_rate=400, temperature=40, vibration=0.02,
        )
        self.assertEqual(TelemetryPacket.objects.count(), 1)
        # Must remove execution first (Machine PROTECT from execution)
        self.execution.delete()
        self.machine.delete()
        self.assertEqual(TelemetryPacket.objects.count(), 0)

    def test_telemetrypacket_execution_set_null(self):
        tp = TelemetryPacket.objects.create(
            machine=self.machine, execution=self.execution,
            timestamp=timezone.now(),
            spindle_speed=1100, feed_rate=450, temperature=42, vibration=0.025,
        )
        self.execution.delete()
        tp.refresh_from_db()
        self.assertIsNone(tp.execution)

    def test_telemetrypacket_str(self):
        now = timezone.now()
        tp = TelemetryPacket.objects.create(
            machine=self.machine, timestamp=now,
            spindle_speed=1200, feed_rate=500, temperature=45, vibration=0.03,
        )
        expected = f"Telemetry {tp.pk} — {self.machine.name} @ {now}"
        self.assertEqual(str(tp), expected)

    # ---- MachineEvent tests ----

    def test_machineevent_creation(self):
        event = MachineEvent.objects.create(
            machine=self.machine,
            event_type='HEARTBEAT_LOST',
            details={"reason": "no packet in 3s"},
        )
        self.assertIsNotNone(event.pk)
        self.assertEqual(event.event_type, 'HEARTBEAT_LOST')
        self.assertEqual(event.details, {"reason": "no packet in 3s"})

    def test_machineevent_uuid_pk(self):
        event = MachineEvent.objects.create(
            machine=self.machine, event_type='STATUS_CHANGE',
        )
        self.assertIsInstance(event.id, uuid.UUID)

    def test_machineevent_cascade_on_machine_delete(self):
        MachineEvent.objects.create(
            machine=self.machine, event_type='HEARTBEAT_LOST',
        )
        self.assertEqual(MachineEvent.objects.count(), 1)
        self.execution.delete()  # Remove execution first (Machine PROTECT)
        self.machine.delete()
        self.assertEqual(MachineEvent.objects.count(), 0)

    def test_machineevent_str(self):
        event = MachineEvent.objects.create(
            machine=self.machine, event_type='HEARTBEAT_RESTORED',
        )
        expected = f"HEARTBEAT_RESTORED on {self.machine.name} at {event.timestamp}"
        self.assertEqual(str(event), expected)

    def test_machineevent_details_nullable(self):
        event = MachineEvent.objects.create(
            machine=self.machine, event_type='STATUS_CHANGE',
        )
        self.assertIsNone(event.details)


class RBACPermissionTests(TestCase):
    """Tests for TASK-016: Role-Based Permission Classes (RBAC)."""

    def setUp(self):
        from rest_framework.test import APIClient as DRFAPIClient

        # Staff user (bypasses RBAC checks)
        self.staff_user = CustomUser.objects.create_user(
            username="rbac_staff",
            email="rbac_staff@example.com",
            password="SecurePass123!",
            is_staff=True,
        )
        # Regular user (no roles)
        self.regular_user = CustomUser.objects.create_user(
            username="rbac_regular",
            email="rbac_regular@example.com",
            password="SecurePass123!",
        )
        # Regular user that will be granted a role with permissions
        self.permitted_user = CustomUser.objects.create_user(
            username="rbac_permitted",
            email="rbac_permitted@example.com",
            password="SecurePass123!",
        )

        # Create permissions
        from users.models import Permission, Role
        self.perm_machines = Permission.objects.create(
            code="machines.manage",
            description="Can manage machines",
            module="Machines",
        )
        self.perm_workorders = Permission.objects.create(
            code="workorders.create",
            description="Can create work orders",
            module="WorkOrders",
        )

        # Create a role and attach permissions
        self.role_manager = Role.objects.create(
            name="Manager",
            level=2,
        )
        self.role_manager.permissions.add(self.perm_machines, self.perm_workorders)

        # Assign the role to permitted_user
        self.permitted_user.role.add(self.role_manager)

        # Create a part (needed for work order creation)
        self.part = Part.objects.create(
            name="RBAC Widget",
            sku="RBAC-001",
            description="Part for RBAC tests",
        )

        # Helper: build authenticated clients
        self.staff_client = DRFAPIClient()
        self.regular_client = DRFAPIClient()
        self.permitted_client = DRFAPIClient()

        for client, username in [
            (self.staff_client, "rbac_staff"),
            (self.regular_client, "rbac_regular"),
            (self.permitted_client, "rbac_permitted"),
        ]:
            resp = client.post(
                "/api/auth/login/",
                {"username": username, "password": "SecurePass123!"},
                format="json",
            )
            assert resp.status_code == 200, f"Login failed for {username}: {resp.data}"
            client.credentials(HTTP_AUTHORIZATION=f"Bearer {resp.data['access']}")

    # 1. Staff user bypasses RBAC — can create machine
    def test_staff_user_can_create_machine(self):
        resp = self.staff_client.post(
            "/api/machines/",
            {"name": "Staff Machine", "type": "Milling"},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)

    # 2. Regular user without role gets 403 on machine create
    def test_non_staff_without_permission_cannot_create_machine(self):
        resp = self.regular_client.post(
            "/api/machines/",
            {"name": "Blocked Machine", "type": "Milling"},
            format="json",
        )
        self.assertEqual(resp.status_code, 403)

    # 3. Regular user with machines.manage permission can create machine
    def test_non_staff_with_permission_can_create_machine(self):
        resp = self.permitted_client.post(
            "/api/machines/",
            {"name": "Permitted Machine", "type": "Milling"},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)

    # 4. Any authenticated user can list machines (GET is IsAuthenticated only)
    def test_any_authenticated_user_can_list_machines(self):
        resp = self.regular_client.get("/api/machines/")
        self.assertEqual(resp.status_code, 200)

    # 5. Regular user without role gets 403 on work order create
    def test_non_staff_without_permission_cannot_create_workorder(self):
        resp = self.regular_client.post(
            "/api/workorders/",
            {"code": "WO-RBAC-BLOCKED", "part": str(self.part.pk), "target_qty": 10},
            format="json",
        )
        self.assertEqual(resp.status_code, 403)

    # 6. Regular user with workorders.create permission can create work order
    def test_non_staff_with_permission_can_create_workorder(self):
        resp = self.permitted_client.post(
            "/api/workorders/",
            {"code": "WO-RBAC-001", "part": str(self.part.pk), "target_qty": 10},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)


class QualityAPITests(TestCase):
    """API tests for TASK-010: Quality Entry API (DefectCode, ProductionLog, ScrapLog)."""

    def setUp(self):
        from rest_framework.test import APIClient as DRFAPIClient

        # Admin user (is_staff=True)
        self.admin_user = CustomUser.objects.create_user(
            username="quality_admin",
            email="quality_admin@example.com",
            password="SecurePass123!",
            is_staff=True,
        )
        # Regular operator user
        self.operator_user = CustomUser.objects.create_user(
            username="quality_operator_api",
            email="quality_operator_api@example.com",
            password="SecurePass123!",
        )

        # Fixtures: Part, Machine (IDLE), WorkOrder (PENDING)
        self.part = Part.objects.create(
            name="Quality API Part",
            sku="QAPI-001",
            description="Part for quality API tests",
        )
        self.machine = Machine.objects.create(
            name="Quality API Mill",
            type="Milling",
            status="IDLE",
        )
        self.work_order = WorkOrder.objects.create(
            code="WO-QAPI-001",
            part=self.part,
            target_qty=200,
            created_by=self.admin_user,
        )

        # WorkOrderExecution (RUNNING) — created directly
        self.execution = WorkOrderExecution.objects.create(
            work_order=self.work_order,
            machine=self.machine,
            operator=self.operator_user,
            status="RUNNING",
        )

        # DefectCode for scrap log tests
        self.defect_code = DefectCode.objects.create(
            code="DC-API-001",
            description="Surface scratch",
            category="COSMETIC",
        )

        # Authenticated clients
        self.admin_client = DRFAPIClient()
        self.operator_client = DRFAPIClient()

        for client, username in [
            (self.admin_client, "quality_admin"),
            (self.operator_client, "quality_operator_api"),
        ]:
            resp = client.post(
                "/api/auth/login/",
                {"username": username, "password": "SecurePass123!"},
                format="json",
            )
            assert resp.status_code == 200, f"Login failed for {username}: {resp.data}"
            client.credentials(HTTP_AUTHORIZATION=f"Bearer {resp.data['access']}")

        # Unauthenticated client
        self.anon_client = DRFAPIClient()

    # ---- DefectCode endpoint tests ----

    # 1
    def test_list_defect_codes_returns_200(self):
        """Authenticated GET /api/defect-codes/ returns 200."""
        resp = self.operator_client.get("/api/defect-codes/")
        self.assertEqual(resp.status_code, 200)

    # 2
    def test_create_defect_code_admin_returns_201(self):
        """Admin POST /api/defect-codes/ returns 201."""
        resp = self.admin_client.post(
            "/api/defect-codes/",
            {"code": "DC-NEW-001", "description": "New defect", "category": "STRUCTURAL"},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["code"], "DC-NEW-001")

    # 3
    def test_create_defect_code_non_admin_returns_403(self):
        """Non-admin POST /api/defect-codes/ returns 403."""
        resp = self.operator_client.post(
            "/api/defect-codes/",
            {"code": "DC-BLOCKED", "description": "Blocked", "category": "COSMETIC"},
            format="json",
        )
        self.assertEqual(resp.status_code, 403)

    # ---- ProductionLog endpoint tests ----

    # 4
    def test_create_production_log_returns_201(self):
        """POST /api/quality/production-log/ with valid data returns 201."""
        resp = self.operator_client.post(
            "/api/quality/production-log/",
            {"execution": str(self.execution.pk), "good_qty": 50, "scrap_qty": 3},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["good_qty"], 50)
        self.assertEqual(resp.data["scrap_qty"], 3)

    # 5
    def test_create_production_log_sets_recorded_by(self):
        """recorded_by is automatically set to the request user."""
        resp = self.operator_client.post(
            "/api/quality/production-log/",
            {"execution": str(self.execution.pk), "good_qty": 30, "scrap_qty": 1},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["recorded_by"]["id"], str(self.operator_user.pk))
        self.assertEqual(resp.data["recorded_by"]["username"], self.operator_user.username)

    # 6
    def test_create_production_log_invalid_execution_returns_400(self):
        """Non-existent execution UUID returns 400."""
        fake_uuid = str(uuid.uuid4())
        resp = self.operator_client.post(
            "/api/quality/production-log/",
            {"execution": fake_uuid, "good_qty": 10, "scrap_qty": 0},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    # 7
    def test_create_production_log_unauthenticated_returns_401(self):
        """Unauthenticated POST returns 401."""
        resp = self.anon_client.post(
            "/api/quality/production-log/",
            {"execution": str(self.execution.pk), "good_qty": 10, "scrap_qty": 0},
            format="json",
        )
        self.assertEqual(resp.status_code, 401)

    # ---- ScrapLog endpoint tests ----

    # 8
    def test_create_scrap_log_returns_201(self):
        """POST /api/quality/scrap-log/ with valid data returns 201."""
        # First create a production log
        pl = ProductionLog.objects.create(
            execution=self.execution,
            recorded_by=self.operator_user,
            good_qty=45,
            scrap_qty=5,
        )
        resp = self.operator_client.post(
            "/api/quality/scrap-log/",
            {
                "production_log": str(pl.pk),
                "defect_code": str(self.defect_code.pk),
                "qty": 2,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["qty"], 2)

    # 9
    def test_create_scrap_log_writes_audit_log(self):
        """Creating a scrap log writes an AuditLog entry."""
        pl = ProductionLog.objects.create(
            execution=self.execution,
            recorded_by=self.operator_user,
            good_qty=40,
            scrap_qty=4,
        )
        initial_count = AuditLog.objects.filter(action="CREATE_SCRAP_LOG").count()
        resp = self.operator_client.post(
            "/api/quality/scrap-log/",
            {
                "production_log": str(pl.pk),
                "defect_code": str(self.defect_code.pk),
                "qty": 3,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        new_count = AuditLog.objects.filter(action="CREATE_SCRAP_LOG").count()
        self.assertEqual(new_count, initial_count + 1)

    # 10
    def test_create_production_log_writes_audit_log(self):
        """Creating a production log writes an AuditLog entry."""
        initial_count = AuditLog.objects.filter(action="CREATE_PRODUCTION_LOG").count()
        resp = self.operator_client.post(
            "/api/quality/production-log/",
            {"execution": str(self.execution.pk), "good_qty": 25, "scrap_qty": 2},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        new_count = AuditLog.objects.filter(action="CREATE_PRODUCTION_LOG").count()
        self.assertEqual(new_count, initial_count + 1)


class LiveOverviewAPITests(TestCase):
    """API tests for TASK-012: Live Overview REST Endpoints."""

    def setUp(self):
        from rest_framework.test import APIClient as DRFAPIClient
        from datetime import timedelta

        # Admin user (is_staff=True)
        self.admin_user = CustomUser.objects.create_user(
            username="live_admin",
            email="live_admin@example.com",
            password="SecurePass123!",
            is_staff=True,
        )

        # Machine (IDLE)
        self.machine = Machine.objects.create(
            name="Live Overview Mill",
            type="Milling",
            status="IDLE",
        )

        # Create TelemetryPacket records with explicit timestamps
        now = timezone.now()
        self.packets = []
        for i in range(5):
            pkt = TelemetryPacket.objects.create(
                machine=self.machine,
                timestamp=now - timedelta(seconds=i),
                spindle_speed=1000 + i,
                feed_rate=200.0 + i,
                temperature=45.0 + i,
                vibration=0.5 + i * 0.1,
            )
            self.packets.append(pkt)

        # Create MachineEvent records
        self.events = []
        for event_type in ['STATUS_CHANGE', 'HEARTBEAT_LOST', 'HEARTBEAT_RESTORED']:
            evt = MachineEvent.objects.create(
                machine=self.machine,
                event_type=event_type,
                details={"info": f"test {event_type}"},
            )
            self.events.append(evt)

        # Authenticated client (JWT)
        self.client = DRFAPIClient()
        response = self.client.post(
            "/api/auth/login/",
            {"username": "live_admin", "password": "SecurePass123!"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, f"Login failed: {response.data}")
        token = response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

        # Unauthenticated client
        self.anon_client = DRFAPIClient()

    # ── Overview ──────────────────────────────────────────

    # 1
    def test_overview_returns_200(self):
        """Authenticated GET /api/live/overview/ returns 200."""
        resp = self.client.get("/api/live/overview/")
        self.assertEqual(resp.status_code, 200)

    # 2
    def test_overview_includes_machines(self):
        """Response contains machine data with expected fields."""
        resp = self.client.get("/api/live/overview/")
        self.assertEqual(resp.status_code, 200)
        data = resp.data
        self.assertIsInstance(data, list)
        self.assertGreaterEqual(len(data), 1)
        machine_entry = data[0]
        self.assertEqual(machine_entry["name"], "Live Overview Mill")

    # 3
    def test_overview_unauthenticated_returns_401(self):
        """Unauthenticated GET /api/live/overview/ returns 401."""
        resp = self.anon_client.get("/api/live/overview/")
        self.assertEqual(resp.status_code, 401)

    # ── Telemetry ─────────────────────────────────────────

    # 4
    def test_telemetry_returns_200(self):
        """Authenticated GET for a valid machine returns 200."""
        url = f"/api/live/telemetry/{self.machine.pk}/"
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, 200)

    # 5
    def test_telemetry_nonexistent_machine_returns_404(self):
        """GET for a non-existent machine UUID returns 404."""
        import uuid as _uuid
        fake_id = _uuid.uuid4()
        url = f"/api/live/telemetry/{fake_id}/"
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, 404)

    # 6
    def test_telemetry_returns_packets_ordered_by_timestamp(self):
        """Telemetry packets are returned in descending timestamp order."""
        url = f"/api/live/telemetry/{self.machine.pk}/"
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, 200)
        data = resp.data
        self.assertGreaterEqual(len(data), 2)
        timestamps = [item["timestamp"] for item in data]
        self.assertEqual(timestamps, sorted(timestamps, reverse=True))

    # 7
    def test_telemetry_limit_param(self):
        """?limit=2 returns at most 2 packets."""
        url = f"/api/live/telemetry/{self.machine.pk}/?limit=2"
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, 200)
        self.assertLessEqual(len(resp.data), 2)

    # ── Events ────────────────────────────────────────────

    # 8
    def test_events_returns_200(self):
        """Authenticated GET /api/live/events/ returns 200."""
        resp = self.client.get("/api/live/events/")
        self.assertEqual(resp.status_code, 200)

    # 9
    def test_events_filter_by_machine(self):
        """?machine=<uuid> returns only events for that machine."""
        # Create a second machine with its own event
        other_machine = Machine.objects.create(
            name="Other Machine",
            type="Lathe",
            status="IDLE",
        )
        MachineEvent.objects.create(
            machine=other_machine,
            event_type="STATUS_CHANGE",
            details={"info": "other machine event"},
        )

        url = f"/api/live/events/?machine={self.machine.pk}"
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, 200)
        data = resp.data
        # All returned events should belong to self.machine
        for event in data:
            self.assertEqual(str(event["machine"]), str(self.machine.pk))

    # 10
    def test_events_unauthenticated_returns_401(self):
        """Unauthenticated GET /api/live/events/ returns 401."""
        resp = self.anon_client.get("/api/live/events/")
        self.assertEqual(resp.status_code, 401)


# ---- TASK-013: Management Command Tests -----

from datetime import timedelta
from io import StringIO
from django.core.management import call_command
from django.core.management.base import CommandError


class ManagementCommandTests(TestCase):
    """Tests for simulate_telemetry and detect_offline management commands."""

    def setUp(self):
        self.user = CustomUser.objects.create_user(
            username="cmd_operator",
            email="cmdop@example.com",
            password="securePass123!",
        )
        self.part = Part.objects.create(
            name="Command Widget",
            sku="CMD-001",
            description="Part for management command tests",
        )
        self.machine = Machine.objects.create(
            name="Command Mill",
            slug="command-mill",
            type="Milling",
            status="RUNNING",
        )
        self.work_order = WorkOrder.objects.create(
            code="WO-CMD-001",
            part=self.part,
            target_qty=50,
            created_by=self.user,
        )

    # ---- simulate_telemetry tests ----

    # 1
    def test_simulate_nonexistent_machine_raises_error(self):
        """simulate_telemetry with a nonexistent slug raises CommandError."""
        with self.assertRaises(CommandError):
            call_command("simulate_telemetry", "--machine", "nonexistent-slug")

    # 2
    def test_simulate_non_running_machine_exits(self):
        """simulate_telemetry exits with a warning when machine is not RUNNING."""
        self.machine.status = "IDLE"
        self.machine.save(update_fields=["status"])

        err = StringIO()
        call_command(
            "simulate_telemetry",
            "--machine",
            self.machine.slug,
            stderr=err,
        )
        self.assertIn("not RUNNING", err.getvalue())
        # No TelemetryPacket rows should have been created
        self.assertEqual(
            TelemetryPacket.objects.filter(machine=self.machine).count(), 0
        )

    # 3
    def test_simulate_invalid_interval_raises_error(self):
        """simulate_telemetry with --interval 0 or negative raises CommandError."""
        with self.assertRaises(CommandError):
            call_command(
                "simulate_telemetry",
                "--machine",
                self.machine.slug,
                "--interval",
                "0",
            )
        with self.assertRaises(CommandError):
            call_command(
                "simulate_telemetry",
                "--machine",
                self.machine.slug,
                "--interval",
                "-1",
            )

    # ---- detect_offline tests ----

    # 4
    def test_detect_offline_flags_stale_machine(self):
        """RUNNING machine with stale telemetry is marked OFFLINE with HEARTBEAT_LOST event."""
        TelemetryPacket.objects.create(
            machine=self.machine,
            timestamp=timezone.now() - timedelta(seconds=10),
            spindle_speed=1000,
            feed_rate=500,
            temperature=50,
            vibration=0.05,
        )

        call_command("detect_offline", stdout=StringIO(), stderr=StringIO())

        self.machine.refresh_from_db()
        self.assertEqual(self.machine.status, "OFFLINE")
        self.assertTrue(
            MachineEvent.objects.filter(
                machine=self.machine, event_type="HEARTBEAT_LOST"
            ).exists()
        )

    # 5
    def test_detect_offline_keeps_healthy_machine(self):
        """RUNNING machine with a fresh packet stays RUNNING."""
        TelemetryPacket.objects.create(
            machine=self.machine,
            timestamp=timezone.now(),
            spindle_speed=1000,
            feed_rate=500,
            temperature=50,
            vibration=0.05,
        )

        call_command("detect_offline", stdout=StringIO(), stderr=StringIO())

        self.machine.refresh_from_db()
        self.assertEqual(self.machine.status, "RUNNING")
        self.assertFalse(
            MachineEvent.objects.filter(
                machine=self.machine, event_type="HEARTBEAT_LOST"
            ).exists()
        )

    # 6
    def test_detect_offline_no_running_machines(self):
        """Command exits cleanly when no RUNNING machines exist."""
        self.machine.status = "IDLE"
        self.machine.save(update_fields=["status"])

        out = StringIO()
        call_command("detect_offline", stdout=out, stderr=StringIO())
        self.assertIn("No machines with status RUNNING", out.getvalue())

    # 7
    def test_detect_offline_no_packets_flags_machine(self):
        """RUNNING machine with zero telemetry packets is flagged OFFLINE."""
        # Ensure no packets exist
        self.assertEqual(
            TelemetryPacket.objects.filter(machine=self.machine).count(), 0
        )

        call_command("detect_offline", stdout=StringIO(), stderr=StringIO())

        self.machine.refresh_from_db()
        self.assertEqual(self.machine.status, "OFFLINE")
        self.assertTrue(
            MachineEvent.objects.filter(
                machine=self.machine, event_type="HEARTBEAT_LOST"
            ).exists()
        )

    # 8
    def test_detect_offline_invalid_timeout_raises_error(self):
        """detect_offline with --timeout 0 raises CommandError."""
        with self.assertRaises(CommandError):
            call_command("detect_offline", "--timeout", "0")


# ---- TASK-014: DataExportJob Model Tests -----


class DataExportJobModelTests(TestCase):
    """Tests for the DataExportJob model (TASK-014)."""

    def setUp(self):
        self.user = CustomUser.objects.create_user(
            username="export_user",
            email="export@example.com",
            password="securePass123!",
        )
        self.now = timezone.now()

    # 1
    def test_create_export_job(self):
        """Basic creation with all fields."""
        job = DataExportJob.objects.create(
            requested_by=self.user,
            status="PROCESSING",
            format="JSON",
            date_from=self.now - timedelta(days=7),
            date_to=self.now,
            file_path="/exports/test_export.json",
            error_message=None,
        )
        self.assertIsNotNone(job.pk)
        self.assertIsInstance(job.id, uuid.UUID)
        self.assertEqual(job.requested_by, self.user)
        self.assertEqual(job.status, "PROCESSING")
        self.assertEqual(job.format, "JSON")
        self.assertEqual(job.file_path, "/exports/test_export.json")

    # 2
    def test_default_status_queued(self):
        """Status defaults to QUEUED when not explicitly set."""
        job = DataExportJob.objects.create(
            requested_by=self.user,
            date_from=self.now - timedelta(days=1),
            date_to=self.now,
        )
        self.assertEqual(job.status, "QUEUED")

    # 3
    def test_default_format_csv(self):
        """Format defaults to CSV when not explicitly set."""
        job = DataExportJob.objects.create(
            requested_by=self.user,
            date_from=self.now - timedelta(days=1),
            date_to=self.now,
        )
        self.assertEqual(job.format, "CSV")

    # 4
    def test_str_representation(self):
        """__str__ returns 'Export <uuid> (<status>) — <format>'."""
        job = DataExportJob.objects.create(
            requested_by=self.user,
            status="COMPLETED",
            format="PARQUET",
            date_from=self.now - timedelta(days=3),
            date_to=self.now,
        )
        expected = f"Export {job.id} (COMPLETED) — PARQUET"
        self.assertEqual(str(job), expected)

    # 5
    def test_requested_by_nullable(self):
        """Can create a DataExportJob without requested_by (NULL)."""
        job = DataExportJob.objects.create(
            requested_by=None,
            date_from=self.now - timedelta(days=1),
            date_to=self.now,
        )
        self.assertIsNone(job.requested_by)

    # 6
    def test_requested_by_set_null_on_delete(self):
        """Deleting the user sets requested_by to NULL (via hard_delete)."""
        job = DataExportJob.objects.create(
            requested_by=self.user,
            date_from=self.now - timedelta(days=1),
            date_to=self.now,
        )
        self.assertEqual(job.requested_by, self.user)
        self.user.hard_delete()
        job.refresh_from_db()
        self.assertIsNone(job.requested_by)


# ---- TASK-015: DataExportJob API Tests -----


class DataExportAPITests(TestCase):
    """Tests for the Data Export API (TASK-015)."""

    def setUp(self):
        self.client = APIClient()
        self.admin = CustomUser.objects.create_superuser(
            username="exportadmin",
            email="exportadmin@example.com",
            password="AdminPass123!",
        )
        self.user = CustomUser.objects.create_user(
            username="exportuser",
            email="exportuser@example.com",
            password="UserPass123!",
        )
        self.login_url = "/api/auth/login/"
        self.jobs_url = "/api/export/jobs/"
        self.now = timezone.now()

        # Authenticate as regular user by default
        resp = self.client.post(self.login_url, {
            "username": "exportuser",
            "password": "UserPass123!",
        })
        self.assertEqual(resp.status_code, http_status.HTTP_200_OK)
        self.access_token = resp.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.access_token}")

    def _valid_payload(self, **overrides):
        payload = {
            "date_from": (self.now - timedelta(days=7)).isoformat(),
            "date_to": self.now.isoformat(),
        }
        payload.update(overrides)
        return payload

    # 1
    def test_create_export_job(self):
        """POST /api/export/jobs/ with valid data returns 202."""
        resp = self.client.post(self.jobs_url, self._valid_payload(), format="json")
        self.assertEqual(resp.status_code, http_status.HTTP_202_ACCEPTED)
        self.assertEqual(resp.data["status"], "QUEUED")
        self.assertIn("id", resp.data)

    # 2
    def test_create_export_job_invalid_dates(self):
        """date_from >= date_to returns 400."""
        payload = self._valid_payload(
            date_from=self.now.isoformat(),
            date_to=(self.now - timedelta(days=1)).isoformat(),
        )
        resp = self.client.post(self.jobs_url, payload, format="json")
        self.assertEqual(resp.status_code, http_status.HTTP_400_BAD_REQUEST)

    # 3
    def test_retrieve_export_job(self):
        """GET /api/export/jobs/{id}/ returns job data."""
        create_resp = self.client.post(self.jobs_url, self._valid_payload(), format="json")
        self.assertEqual(create_resp.status_code, http_status.HTTP_202_ACCEPTED)
        job_id = create_resp.data["id"]

        resp = self.client.get(f"{self.jobs_url}{job_id}/")
        self.assertEqual(resp.status_code, http_status.HTTP_200_OK)
        self.assertEqual(resp.data["id"], job_id)
        self.assertEqual(resp.data["status"], "QUEUED")

    # 4
    def test_download_not_completed(self):
        """GET /api/export/jobs/{id}/download/ when QUEUED returns 404."""
        create_resp = self.client.post(self.jobs_url, self._valid_payload(), format="json")
        job_id = create_resp.data["id"]

        resp = self.client.get(f"{self.jobs_url}{job_id}/download/")
        self.assertEqual(resp.status_code, http_status.HTTP_404_NOT_FOUND)

    # 5
    def test_download_completed_no_file(self):
        """COMPLETED job but no file_path returns 404."""
        job = DataExportJob.objects.create(
            requested_by=self.user,
            status="COMPLETED",
            format="CSV",
            date_from=self.now - timedelta(days=1),
            date_to=self.now,
            file_path="",
        )
        resp = self.client.get(f"{self.jobs_url}{job.id}/download/")
        self.assertEqual(resp.status_code, http_status.HTTP_404_NOT_FOUND)

    # 6
    def test_unauthenticated_create_returns_401(self):
        """No auth returns 401."""
        self.client.credentials()  # clear auth
        resp = self.client.post(self.jobs_url, self._valid_payload(), format="json")
        self.assertEqual(resp.status_code, http_status.HTTP_401_UNAUTHORIZED)

    # 7
    def test_api_key_auth_create(self):
        """Create export job with X-API-Key header works."""
        raw_key = "test-export-api-key"
        key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
        ApiClient.objects.create(
            name="export-client",
            api_key_hash=key_hash,
            is_active=True,
        )
        self.client.credentials(HTTP_X_API_KEY=raw_key)
        resp = self.client.post(self.jobs_url, self._valid_payload(), format="json")
        self.assertEqual(resp.status_code, http_status.HTTP_202_ACCEPTED)
        self.assertEqual(resp.data["status"], "QUEUED")

    # 8
    def test_api_key_auth_invalid_key_returns_401(self):
        """Bad API key returns 401."""
        self.client.credentials(HTTP_X_API_KEY="invalid-key-that-does-not-exist")
        resp = self.client.post(self.jobs_url, self._valid_payload(), format="json")
        self.assertEqual(resp.status_code, http_status.HTTP_401_UNAUTHORIZED)

    # 9
    def test_default_format_csv(self):
        """Creating without format defaults to CSV."""
        payload = self._valid_payload()
        # Do not include 'format' key
        payload.pop("format", None)
        resp = self.client.post(self.jobs_url, payload, format="json")
        self.assertEqual(resp.status_code, http_status.HTTP_202_ACCEPTED)
        self.assertEqual(resp.data["format"], "CSV")

    # 10
    def test_create_export_job_parquet(self):
        """Creating with PARQUET format is accepted, status QUEUED."""
        payload = self._valid_payload(format="PARQUET")
        resp = self.client.post(self.jobs_url, payload, format="json")
        self.assertEqual(resp.status_code, http_status.HTTP_202_ACCEPTED)
        self.assertEqual(resp.data["format"], "PARQUET")
        self.assertEqual(resp.data["status"], "QUEUED")


# ---- TASK-017: SystemConfig API Tests -----


class SystemConfigAPITests(TestCase):
    """Tests for the SystemConfig API (TASK-017)."""

    def setUp(self):
        self.client = APIClient()
        self.admin = CustomUser.objects.create_superuser(
            username="cfgadmin",
            email="cfgadmin@example.com",
            password="AdminPass123!",
        )
        self.user = CustomUser.objects.create_user(
            username="cfguser",
            email="cfguser@example.com",
            password="UserPass123!",
        )
        self.login_url = "/api/auth/login/"
        self.config_url = "/api/config/"

        # Authenticate as admin by default
        resp = self.client.post(self.login_url, {
            "username": "cfgadmin",
            "password": "AdminPass123!",
        })
        self.assertEqual(resp.status_code, http_status.HTTP_200_OK)
        self.admin_token = resp.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.admin_token}")

    def _login_as_user(self):
        """Switch credentials to the non-admin user."""
        client = APIClient()
        resp = client.post(self.login_url, {
            "username": "cfguser",
            "password": "UserPass123!",
        })
        self.assertEqual(resp.status_code, http_status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {resp.data['access']}")

    # 1
    def test_list_config_admin(self):
        """Admin GET /api/config/ returns 200."""
        resp = self.client.get(self.config_url)
        self.assertEqual(resp.status_code, http_status.HTTP_200_OK)

    # 2
    def test_list_config_non_admin_returns_403(self):
        """Non-admin GET /api/config/ returns 403."""
        self._login_as_user()
        resp = self.client.get(self.config_url)
        self.assertEqual(resp.status_code, http_status.HTTP_403_FORBIDDEN)

    # 3
    def test_create_config(self):
        """Admin POST /api/config/ creates a config entry."""
        payload = {
            "key": "max_export_rows",
            "value": "10000",
            "data_type": "integer",
            "description": "Maximum rows per export",
        }
        resp = self.client.post(self.config_url, payload, format="json")
        self.assertEqual(resp.status_code, http_status.HTTP_201_CREATED)
        self.assertEqual(resp.data["key"], "max_export_rows")
        self.assertEqual(resp.data["value"], "10000")
        self.assertTrue(SystemConfig.objects.filter(key="max_export_rows").exists())

    # 4
    def test_update_config(self):
        """Admin PATCH /api/config/{id}/ updates entry."""
        config = SystemConfig.objects.create(
            key="heartbeat_timeout",
            value="30",
            data_type="integer",
            updated_by=self.admin,
        )
        resp = self.client.patch(
            f"{self.config_url}{config.id}/",
            {"value": "60"},
            format="json",
        )
        self.assertEqual(resp.status_code, http_status.HTTP_200_OK)
        config.refresh_from_db()
        self.assertEqual(config.value, "60")

    # 5
    def test_create_config_non_admin_returns_403(self):
        """Non-admin POST /api/config/ returns 403."""
        self._login_as_user()
        payload = {
            "key": "forbidden_key",
            "value": "nope",
            "data_type": "string",
        }
        resp = self.client.post(self.config_url, payload, format="json")
        self.assertEqual(resp.status_code, http_status.HTTP_403_FORBIDDEN)

    # 6
    def test_audit_log_on_create(self):
        """Creating a config entry writes an AuditLog with action CREATE_SYSTEM_CONFIG."""
        initial_count = AuditLog.objects.filter(action="CREATE_SYSTEM_CONFIG").count()
        payload = {
            "key": "audit_test_key",
            "value": "audit_test_value",
            "data_type": "string",
        }
        resp = self.client.post(self.config_url, payload, format="json")
        self.assertEqual(resp.status_code, http_status.HTTP_201_CREATED)
        new_count = AuditLog.objects.filter(action="CREATE_SYSTEM_CONFIG").count()
        self.assertEqual(new_count, initial_count + 1)
        log_entry = AuditLog.objects.filter(action="CREATE_SYSTEM_CONFIG").latest("timestamp")
        self.assertEqual(str(log_entry.entity_id), resp.data["id"])


# ---- TASK-017: Operation API Tests -----


class OperationAPITests(TestCase):
    """Tests for the Operation API (TASK-017)."""

    def setUp(self):
        self.client = APIClient()
        self.admin = CustomUser.objects.create_superuser(
            username="opadmin",
            email="opadmin@example.com",
            password="AdminPass123!",
        )
        self.user = CustomUser.objects.create_user(
            username="opuser",
            email="opuser@example.com",
            password="UserPass123!",
        )
        self.login_url = "/api/auth/login/"
        self.ops_url = "/api/operations/"

        # Authenticate as admin by default
        resp = self.client.post(self.login_url, {
            "username": "opadmin",
            "password": "AdminPass123!",
        })
        self.assertEqual(resp.status_code, http_status.HTTP_200_OK)
        self.admin_token = resp.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.admin_token}")

    def _login_as_user(self):
        """Switch credentials to the non-admin user."""
        client = APIClient()
        resp = client.post(self.login_url, {
            "username": "opuser",
            "password": "UserPass123!",
        })
        self.assertEqual(resp.status_code, http_status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {resp.data['access']}")

    # 1
    def test_list_operations_authenticated(self):
        """Authenticated GET /api/operations/ returns 200."""
        Operation.objects.create(name="Drilling", description="Drill holes")
        resp = self.client.get(self.ops_url)
        self.assertEqual(resp.status_code, http_status.HTTP_200_OK)
        self.assertGreaterEqual(len(resp.data), 1)

    # 2
    def test_list_operations_unauthenticated_returns_401(self):
        """No auth GET /api/operations/ returns 401."""
        self.client.credentials()  # clear auth
        resp = self.client.get(self.ops_url)
        self.assertEqual(resp.status_code, http_status.HTTP_401_UNAUTHORIZED)

    # 3
    def test_create_operation_admin(self):
        """Admin POST /api/operations/ creates operation."""
        payload = {"name": "Heat Treat", "description": "Apply heat treatment"}
        resp = self.client.post(self.ops_url, payload, format="json")
        self.assertEqual(resp.status_code, http_status.HTTP_201_CREATED)
        self.assertEqual(resp.data["name"], "Heat Treat")
        self.assertTrue(Operation.objects.filter(name="Heat Treat").exists())

    # 4
    def test_create_operation_non_admin_returns_403(self):
        """Non-admin POST /api/operations/ returns 403."""
        self._login_as_user()
        payload = {"name": "Forbidden Op", "description": "Should not be created"}
        resp = self.client.post(self.ops_url, payload, format="json")
        self.assertEqual(resp.status_code, http_status.HTTP_403_FORBIDDEN)

    # 5
    def test_update_operation_admin(self):
        """Admin PUT /api/operations/{id}/ updates operation."""
        op = Operation.objects.create(name="Turning", description="Turn parts")
        payload = {"name": "Turning v2", "description": "Updated turning"}
        resp = self.client.put(f"{self.ops_url}{op.id}/", payload, format="json")
        self.assertEqual(resp.status_code, http_status.HTTP_200_OK)
        op.refresh_from_db()
        self.assertEqual(op.name, "Turning v2")

    # 6
    def test_delete_operation_admin(self):
        """Admin DELETE /api/operations/{id}/ removes operation."""
        op = Operation.objects.create(name="Polishing", description="Polish surfaces")
        resp = self.client.delete(f"{self.ops_url}{op.id}/")
        self.assertEqual(resp.status_code, http_status.HTTP_204_NO_CONTENT)
        self.assertFalse(Operation.objects.filter(id=op.id).exists())
