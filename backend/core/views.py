import os
from datetime import timedelta

from django.conf import settings as django_settings
from django.db import transaction
from django.db.models import Prefetch, Subquery, OuterRef
from django.http import FileResponse
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.views import APIView

from core.permissions import require_permission
from rest_framework.response import Response
from rest_framework_simplejwt.authentication import JWTAuthentication
from users.auth import ApiKeyAuthentication

from .models import (
    Machine, Part, WorkOrder, WorkOrderAssignment, WorkOrderExecution,
    DefectCode, ProductionLog, AnomalySnapshot, ScrapLog,
    TelemetryPacket, MachineEvent,
    DataExportJob, SystemConfig, Operation, ProductionLine,
    OrderRequest, Notification,
)
from .serializers import (
    MachineSerializer,
    PartModelUploadSerializer,
    PartSerializer,
    ProductionLineSerializer,
    ProductionLineWriteSerializer,
    WorkOrderSerializer,
    WorkOrderCreateSerializer,
    WorkOrderUpdateSerializer,
    WorkOrderAssignmentSerializer,
    WorkOrderAssignmentCreateSerializer,
    WorkOrderExecutionSerializer,
    ExecutionStartSerializer,
    DefectCodeSerializer,
    DefectCodeCreateSerializer,
    ProductionLogSerializer,
    ProductionLogCreateSerializer,
    ScrapLogSerializer,
    ScrapLogCreateSerializer,
    AnomalySnapshotSerializer,
    TelemetryPacketSerializer,
    MachineOverviewSerializer,
    MachineEventSerializer,
    DataExportJobSerializer,
    DataExportJobCreateSerializer,
    SystemConfigSerializer,
    OperationSerializer,
    OrderRequestSerializer,
    OrderRequestCreateSerializer,
    NotificationSerializer,
)
from core.audit import log_action


class MachineViewSet(viewsets.ModelViewSet):
    """API endpoint that allows machines to be viewed or edited."""
    queryset = Machine.objects.all().order_by("name")
    serializer_class = MachineSerializer
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [IsAuthenticated()]
        # POST / PATCH require machines.manage permission (staff users pass automatically)
        return [require_permission('machines.manage')()]


class PartViewSet(viewsets.ModelViewSet):
    """API endpoint that allows parts to be viewed or edited."""
    queryset = Part.objects.all()
    serializer_class = PartSerializer
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [IsAuthenticated()]
        # POST / PATCH require parts.manage permission (staff users pass automatically)
        return [require_permission('parts.manage')()]

    @action(
        detail=True,
        methods=['post'],
        url_path='upload-model',
        parser_classes=[MultiPartParser, FormParser],
    )
    def upload_model(self, request, pk=None):
        """Upload or replace the 3D model file for a part."""
        part = self.get_object()
        serializer = PartModelUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        before_data = PartSerializer(part, context={'request': request}).data

        part.model_file = serializer.validated_data['model_file']
        part.save(update_fields=['model_file'])

        after_data = PartSerializer(part, context={'request': request}).data
        log_action(
            actor=request.user,
            action="UPLOAD_PART_MODEL",
            entity_type="Part",
            entity_id=part.pk,
            before=before_data,
            after=after_data,
            request=request,
        )
        return Response(after_data, status=status.HTTP_200_OK)


class WorkOrderViewSet(viewsets.ModelViewSet):
    """
    CRUD endpoint for Work Orders.

    - GET    /api/workorders/               — list (filterable by ?status= and ?machine=)
    - POST   /api/workorders/               — create
    - GET    /api/workorders/{id}/           — retrieve
    - PATCH  /api/workorders/{id}/           — partial update (description, target_qty, priority only)
    - POST   /api/workorders/{id}/assign/    — assign a machine + operator
    - GET    /api/workorders/{id}/assignments/ — list assignments for this work order
    """
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_permissions(self):
        if self.action in ('list', 'retrieve', 'assignments'):
            return [IsAuthenticated()]
        # create, partial_update, assign require workorders.create permission
        return [require_permission('workorders.create')()]

    def get_queryset(self):
        qs = WorkOrder.objects.select_related('part', 'created_by').all()

        # Simple manual filtering by query params
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)

        machine_filter = self.request.query_params.get('machine')
        if machine_filter:
            qs = qs.filter(assignments__machine_id=machine_filter).distinct()

        return qs

    def get_serializer_class(self):
        if self.action == 'create':
            return WorkOrderCreateSerializer
        if self.action == 'partial_update':
            return WorkOrderUpdateSerializer
        return WorkOrderSerializer

    def get_serializer(self, *args, **kwargs):
        if self.action == 'partial_update':
            kwargs['partial'] = True
        return super().get_serializer(*args, **kwargs)

    def perform_create(self, serializer):
        wo = serializer.save(created_by=self.request.user)
        after_data = WorkOrderSerializer(wo, context={'request': self.request}).data
        log_action(
            actor=self.request.user,
            action="CREATE_WORKORDER",
            entity_type="WorkOrder",
            entity_id=wo.pk,
            after=after_data,
            request=self.request,
        )
        # Store full representation for create response (see create() override below)
        self._created_response_data = after_data

    def create(self, request, *args, **kwargs):
        """Override to return the full WorkOrderSerializer representation."""
        super().create(request, *args, **kwargs)
        return Response(self._created_response_data, status=status.HTTP_201_CREATED)

    def perform_update(self, serializer):
        instance = serializer.instance
        old_qty = instance.target_qty
        old_due_date = instance.due_date

        before_data = WorkOrderSerializer(instance, context={'request': self.request}).data
        wo = serializer.save()
        after_data = WorkOrderSerializer(wo, context={'request': self.request}).data

        if hasattr(wo, 'order_request') and wo.order_request and wo.order_request.customer:
            changes = []
            if old_qty != wo.target_qty:
                changes.append(f"Quantity changed to {wo.target_qty}")
            if old_due_date != wo.due_date:
                new_date = wo.due_date.strftime('%Y-%m-%d') if wo.due_date else 'Not set'
                changes.append(f"Due date changed to {new_date}")

            if changes:
                Notification.objects.create(
                    user=wo.order_request.customer,
                    title=f"Order Updated: {wo.code}",
                    message="; ".join(changes)
                )

        log_action(
            actor=self.request.user,
            action="UPDATE_WORKORDER",
            entity_type="WorkOrder",
            entity_id=wo.pk,
            before=before_data,
            after=after_data,
            request=self.request,
        )

    @action(detail=True, methods=['post'], url_path='cancel')
    def cancel(self, request, pk=None):
        wo = self.get_object()
        reason = request.data.get('reason', 'No reason provided')
        
        with transaction.atomic():
            wo.status = 'CANCELLED'
            wo.save(update_fields=['status'])

            executions = wo.executions.filter(status__in=['RUNNING', 'PAUSED', 'AWAITING_START', 'STOPPED'])
            for ex in executions:
                ex.status = 'STOPPED'
                ex.completed_at = timezone.now()
                ex.save(update_fields=['status', 'completed_at'])
                
                other_active = WorkOrderExecution.objects.filter(
                    machine=ex.machine,
                    status__in=['RUNNING', 'PAUSED'],
                ).exclude(pk=ex.pk).exists()
                if not other_active:
                    ex.machine.status = 'IDLE'
                    ex.machine.save(update_fields=['status'])

            if hasattr(wo, 'order_request') and wo.order_request:
                wo.order_request.status = 'CANCELLED'
                wo.order_request.save(update_fields=['status'])
                if wo.order_request.customer:
                    Notification.objects.create(
                        user=wo.order_request.customer,
                        title=f"Order Cancelled: {wo.code}",
                        message=f"Your order {wo.code} has been cancelled. Reason: {reason}"
                    )
                    
        return Response({'status': 'cancelled'})

    @action(detail=True, methods=['post'], url_path='complete')
    def complete(self, request, pk=None):
        wo = self.get_object()
        
        with transaction.atomic():
            wo.status = 'COMPLETED'
            wo.save(update_fields=['status'])

            executions = wo.executions.filter(status__in=['RUNNING', 'PAUSED', 'AWAITING_START', 'STOPPED'])
            for ex in executions:
                ex.status = 'COMPLETED'
                ex.completed_at = timezone.now()
                ex.save(update_fields=['status', 'completed_at'])
                
                other_active = WorkOrderExecution.objects.filter(
                    machine=ex.machine,
                    status__in=['RUNNING', 'PAUSED'],
                ).exclude(pk=ex.pk).exists()
                if not other_active:
                    ex.machine.status = 'IDLE'
                    ex.machine.save(update_fields=['status'])

            if hasattr(wo, 'order_request') and wo.order_request:
                wo.order_request.status = 'COMPLETED'
                wo.order_request.save(update_fields=['status'])
                if wo.order_request.customer:
                    Notification.objects.create(
                        user=wo.order_request.customer,
                        title=f"Order Completed: {wo.code}",
                        message=f"Your order {wo.code} has been completed and is ready."
                    )
                    
        return Response({'status': 'completed'})

    @action(detail=True, methods=['post'], url_path='assign')
    def assign(self, request, pk=None):
        """Assign a machine and operator to this work order."""
        work_order = self.get_object()
        if work_order.status in ('CANCELLED', 'COMPLETED'):
            return Response(
                {'detail': f'Cannot assign to a {work_order.status} work order.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = WorkOrderAssignmentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        assignment = serializer.save(
            work_order=work_order,
            assigned_by=request.user,
        )
        after_data = WorkOrderAssignmentSerializer(
            assignment, context={'request': request}
        ).data
        log_action(
            actor=request.user,
            action="ASSIGN_WORKORDER",
            entity_type="WorkOrderAssignment",
            entity_id=assignment.pk,
            after=after_data,
            request=request,
        )
        return Response(after_data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'], url_path='assignments')
    def assignments(self, request, pk=None):
        """List all assignments for this work order."""
        work_order = self.get_object()
        qs = work_order.assignments.select_related('machine', 'operator', 'assigned_by')
        serializer = WorkOrderAssignmentSerializer(qs, many=True, context={'request': request})
        return Response(serializer.data)


class ExecutionViewSet(viewsets.GenericViewSet):
    """
    Production execution lifecycle API.

    POST /api/executions/start/          — start a new execution
    POST /api/executions/{id}/pause/     — pause a running execution
    POST /api/executions/{id}/resume/    — resume a paused execution
    POST /api/executions/{id}/stop/      — stop an execution (terminates early, does not mark Completed)
    """
    queryset = WorkOrderExecution.objects.select_related(
        'work_order', 'work_order__part', 'work_order__production_line',
        'machine', 'operator',
    ).prefetch_related('production_logs')
    serializer_class = WorkOrderExecutionSerializer
    permission_classes = [IsAuthenticated]

    # ---- helpers ----

    def _serialize(self, execution):
        return WorkOrderExecutionSerializer(execution, context={'request': self.request}).data

    # ---- list ----

    def list(self, request):
        """
        GET /api/executions/
        List executions, optionally filtered by ?status= and/or ?machine=
        """
        qs = self.get_queryset()

        status_filter = request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)

        machine_filter = request.query_params.get('machine')
        if machine_filter:
            qs = qs.filter(machine_id=machine_filter)

        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    # ---- actions ----

    @action(detail=False, methods=['post'], url_path='start')
    def start(self, request):
        """Start a new execution for a work order."""
        serializer = ExecutionStartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            # Re-fetch with row locks to prevent race conditions
            work_order = WorkOrder.objects.select_for_update().get(
                pk=serializer.validated_data['work_order'].pk
            )
            machine = Machine.objects.select_for_update().get(
                pk=serializer.validated_data['machine'].pk
            )
            operator = serializer.validated_data.get('operator')

            # Re-validate after locking
            if work_order.status not in ('PENDING', 'PAUSED'):
                return Response(
                    {'detail': f'Work order must be in PENDING or PAUSED status (current: {work_order.status}).'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if machine.status == 'OFFLINE':
                return Response(
                    {'detail': 'Machine must not be OFFLINE.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Transition work order -> IN_PROGRESS
            work_order.status = 'IN_PROGRESS'
            work_order.save(update_fields=['status'])

            # Transition machine -> RUNNING
            machine.status = 'RUNNING'
            machine.save(update_fields=['status'])

            # Create execution record  — starts as AWAITING_START
            # (simulates waiting for physical machine confirmation)
            execution = WorkOrderExecution.objects.create(
                work_order=work_order,
                machine=machine,
                operator=operator,
                status='AWAITING_START',
            )

        after_data = self._serialize(execution)
        log_action(
            actor=request.user,
            action="START_EXECUTION",
            entity_type="WorkOrderExecution",
            entity_id=execution.pk,
            after=after_data,
            request=request,
        )
        return Response(after_data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='pause')
    def pause(self, request, pk=None):
        """Pause a running execution."""
        with transaction.atomic():
            execution = WorkOrderExecution.objects.select_for_update().get(pk=self.get_object().pk)

            if execution.status != 'RUNNING':
                return Response(
                    {'detail': 'Cannot pause: execution is not running.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            before_data = self._serialize(execution)

            execution.status = 'PAUSED'
            execution.paused_at = timezone.now()
            execution.save(update_fields=['status', 'paused_at'])

            work_order = WorkOrder.objects.select_for_update().get(pk=execution.work_order_id)
            work_order.status = 'PAUSED'
            work_order.save(update_fields=['status'])

        execution.work_order.refresh_from_db()
        after_data = self._serialize(execution)
        log_action(
            actor=request.user,
            action="PAUSE_EXECUTION",
            entity_type="WorkOrderExecution",
            entity_id=execution.pk,
            before=before_data,
            after=after_data,
            request=request,
        )
        return Response(after_data)

    @action(detail=True, methods=['post'], url_path='resume')
    def resume(self, request, pk=None):
        """Resume a paused execution."""
        with transaction.atomic():
            execution = WorkOrderExecution.objects.select_for_update().get(pk=self.get_object().pk)

            if execution.status != 'PAUSED':
                return Response(
                    {'detail': 'Cannot resume: execution is not paused.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            before_data = self._serialize(execution)

            execution.status = 'RUNNING'
            execution.paused_at = None
            execution.save(update_fields=['status', 'paused_at'])

            work_order = WorkOrder.objects.select_for_update().get(pk=execution.work_order_id)
            work_order.status = 'IN_PROGRESS'
            work_order.save(update_fields=['status'])

        execution.work_order.refresh_from_db()
        after_data = self._serialize(execution)
        log_action(
            actor=request.user,
            action="RESUME_EXECUTION",
            entity_type="WorkOrderExecution",
            entity_id=execution.pk,
            before=before_data,
            after=after_data,
            request=request,
        )
        return Response(after_data)  # resume

    @action(detail=True, methods=['post'], url_path='stop')
    def stop(self, request, pk=None):
        """Stop an execution (early termination, distinct from Completed)."""
        with transaction.atomic():
            execution = WorkOrderExecution.objects.select_for_update().get(pk=self.get_object().pk)

            if execution.status in ('COMPLETED', 'STOPPED'):
                return Response(
                    {'detail': f'Cannot stop: execution is already {execution.status.lower()}.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            before_data = self._serialize(execution)

            execution.status = 'STOPPED'
            execution.completed_at = timezone.now()
            execution.paused_at = None  # B-4: clear paused_at when stopping a paused execution
            execution.save(update_fields=['status', 'completed_at', 'paused_at'])

            work_order = WorkOrder.objects.select_for_update().get(pk=execution.work_order_id)
            work_order.status = 'CANCELLED'
            work_order.save(update_fields=['status'])

            # B-3: Only set machine IDLE if no other active executions exist on it
            machine = Machine.objects.select_for_update().get(pk=execution.machine_id)
            other_active = WorkOrderExecution.objects.filter(
                machine=machine,
                status__in=['RUNNING', 'PAUSED'],
            ).exclude(pk=execution.pk).exists()
            if not other_active:
                machine.status = 'IDLE'
                machine.save(update_fields=['status'])

        execution.machine.refresh_from_db()
        execution.work_order.refresh_from_db()
        after_data = self._serialize(execution)
        log_action(
            actor=request.user,
            action="STOP_EXECUTION",
            entity_type="WorkOrderExecution",
            entity_id=execution.pk,
            before=before_data,
            after=after_data,
            request=request,
        )
        return Response(after_data)  # stop


# ---- Quality API views ----

class DefectCodeViewSet(viewsets.ModelViewSet):
    """
    GET  /api/defect-codes/     — list defect codes (any authenticated user)
    POST /api/defect-codes/     — create a defect code (admin only)
    """
    queryset = DefectCode.objects.all().order_by("code")
    http_method_names = ['get', 'post', 'head', 'options']

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [IsAuthenticated()]
        return [IsAdminUser()]

    def get_serializer_class(self):
        if self.action == 'create':
            return DefectCodeCreateSerializer
        return DefectCodeSerializer

    def perform_create(self, serializer):
        defect_code = serializer.save()
        after_data = DefectCodeSerializer(defect_code).data
        log_action(
            actor=self.request.user,
            action="CREATE_DEFECT_CODE",
            entity_type="DefectCode",
            entity_id=defect_code.pk,
            after=after_data,
            request=self.request,
        )
        self._created_response_data = after_data

    def create(self, request, *args, **kwargs):
        """Override to return the full DefectCodeSerializer representation."""
        super().create(request, *args, **kwargs)
        return Response(self._created_response_data, status=status.HTTP_201_CREATED)


class ProductionLogCreateView(APIView):
    """POST /api/quality/production-log/ — log good/scrap qty for an execution."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ProductionLogCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        production_log = serializer.save(recorded_by=request.user)
        after_data = ProductionLogSerializer(production_log).data
        log_action(
            actor=request.user,
            action="CREATE_PRODUCTION_LOG",
            entity_type="ProductionLog",
            entity_id=production_log.pk,
            after=after_data,
            request=request,
        )
        return Response(after_data, status=status.HTTP_201_CREATED)


class ScrapLogCreateView(APIView):
    """POST /api/quality/scrap-log/ — log scrap with a defect code."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ScrapLogCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        production_log = serializer.validated_data['production_log']
        execution = production_log.execution
        machine = execution.machine

        # Auto-create anomaly snapshot from recent telemetry
        five_min_ago = timezone.now() - timedelta(minutes=5)
        packets = TelemetryPacket.objects.filter(
            machine=machine, timestamp__gte=five_min_ago
        ).order_by('-timestamp').values(
            'timestamp', 'spindle_speed', 'feed_rate', 'temperature', 'vibration'
        )[:300]

        snapshot = None
        if packets:
            snapshot = AnomalySnapshot.objects.create(
                execution=execution,
                telemetry_window_json=list(packets),
            )

        scrap_log = serializer.save(anomaly_snapshot=snapshot)
        after_data = ScrapLogSerializer(scrap_log).data
        log_action(
            actor=request.user,
            action="CREATE_SCRAP_LOG",
            entity_type="ScrapLog",
            entity_id=scrap_log.pk,
            after=after_data,
            request=request,
        )
        return Response(after_data, status=status.HTTP_201_CREATED)


# ---- Live Overview API views ----

class LiveOverviewView(APIView):
    """
    GET /api/live/overview/
    Return all machines with their current status and most recent TelemetryPacket.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        machines = Machine.objects.all().order_by('name')

        results = []
        for machine in machines:
            latest_packet = TelemetryPacket.objects.filter(
                machine=machine,
            ).order_by('-timestamp').first()
            machine.latest_telemetry = latest_packet
            results.append(machine)

        serializer = MachineOverviewSerializer(results, many=True)
        return Response(serializer.data)


class MachineTelemetryView(APIView):
    """
    GET /api/live/telemetry/<uuid:machine_id>/
    Return last N telemetry packets for a machine.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, machine_id):
        # Validate machine exists
        try:
            Machine.objects.get(pk=machine_id)
        except Machine.DoesNotExist:
            return Response(
                {'detail': 'Machine not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Parse and clamp limit
        try:
            limit = int(request.query_params.get('limit', 100))
        except (ValueError, TypeError):
            limit = 100
        limit = max(1, min(limit, 500))

        packets = TelemetryPacket.objects.filter(
            machine_id=machine_id,
        ).order_by('-timestamp')[:limit]

        serializer = TelemetryPacketSerializer(packets, many=True)
        return Response(serializer.data)


class MachineEventListView(APIView):
    """
    GET /api/live/events/
    Return recent MachineEvent list.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Parse and clamp limit
        try:
            limit = int(request.query_params.get('limit', 50))
        except (ValueError, TypeError):
            limit = 50
        limit = max(1, min(limit, 200))

        qs = MachineEvent.objects.all()

        # Optional machine filter
        machine_filter = request.query_params.get('machine')
        if machine_filter:
            qs = qs.filter(machine_id=machine_filter)

        events = qs.order_by('-timestamp')[:limit]
        serializer = MachineEventSerializer(events, many=True)
        return Response(serializer.data)


# ---- Data Export API views (TASK-015) ----

class IsAuthenticatedOrApiKey(IsAuthenticated):
    """
    Allow access if the request is authenticated via JWT (IsAuthenticated)
    OR via a valid API key (request.auth is an ApiClient instance).
    """

    def has_permission(self, request, view):
        # ApiKeyAuthentication sets user=None, auth=ApiClient
        from users.models import ApiClient
        if request.auth and isinstance(request.auth, ApiClient):
            return True
        return super().has_permission(request, view)


class DataExportJobViewSet(viewsets.GenericViewSet):
    """
    POST   /api/export/jobs/                — create a DataExportJob (status=QUEUED)
    GET    /api/export/jobs/{id}/           — retrieve job status
    GET    /api/export/jobs/{id}/download/  — stream the file when COMPLETED
    """
    queryset = DataExportJob.objects.all()
    serializer_class = DataExportJobSerializer
    authentication_classes = [ApiKeyAuthentication, JWTAuthentication]
    permission_classes = [IsAuthenticatedOrApiKey]

    def get_queryset(self):
        """S3 fix: Filter by ownership. JWT users see only their jobs.
        API key clients (request.user is None) see jobs with requested_by=None."""
        qs = DataExportJob.objects.all()
        if self.request.user and self.request.user.is_authenticated:
            return qs.filter(requested_by=self.request.user)
        # API key auth — only see jobs without a user (API-key-created jobs)
        return qs.filter(requested_by__isnull=True)

    def create(self, request):
        """Create a new export job with status QUEUED."""
        serializer = DataExportJobCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        job = serializer.save(
            requested_by=request.user if request.user and request.user.is_authenticated else None,
            status='QUEUED',
        )
        response_data = DataExportJobSerializer(job, context={'request': request}).data
        log_action(
            actor=request.user if request.user and request.user.is_authenticated else None,
            action="CREATE_EXPORT_JOB",
            entity_type="DataExportJob",
            entity_id=job.pk,
            after=response_data,
            request=request,
        )
        return Response(response_data, status=status.HTTP_202_ACCEPTED)

    def retrieve(self, request, pk=None):
        """Retrieve the current status of an export job."""
        job = self.get_object()
        serializer = DataExportJobSerializer(job, context={'request': request})
        return Response(serializer.data)

    @action(detail=True, methods=['get'], url_path='download')
    def download(self, request, pk=None):
        """Stream the exported file if the job is COMPLETED and a file exists."""
        job = self.get_object()

        if job.status != 'COMPLETED' or not job.file_path:
            return Response(
                {'detail': 'Export not completed or no file available.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        # S4 fix: Validate file_path is within the exports directory
        export_dir = os.path.realpath(os.path.join(django_settings.BASE_DIR, 'exports'))
        resolved = os.path.realpath(job.file_path)
        if not resolved.startswith(export_dir + os.sep):
            return Response(
                {'detail': 'Export file not found on disk.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not os.path.isfile(resolved):
            return Response(
                {'detail': 'Export file not found on disk.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        content_types = {
            'CSV': 'text/csv',
            'JSON': 'application/json',
            'PARQUET': 'application/octet-stream',
        }
        content_type = content_types.get(job.format, 'application/octet-stream')
        filename = os.path.basename(job.file_path)

        return FileResponse(
            open(resolved, 'rb'),
            content_type=content_type,
            as_attachment=True,
            filename=filename,
        )


# ---- SystemConfig API views (TASK-017) ----

class SystemConfigViewSet(viewsets.ModelViewSet):
    """
    GET   /api/config/       — list all SystemConfig entries (admin only)
    POST  /api/config/       — create a SystemConfig entry (admin only)
    PATCH /api/config/{id}/  — update a SystemConfig entry (admin only)
    """
    queryset = SystemConfig.objects.all().order_by('key')
    serializer_class = SystemConfigSerializer
    permission_classes = [IsAdminUser]
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def perform_create(self, serializer):
        config = serializer.save(updated_by=self.request.user)
        after_data = SystemConfigSerializer(config).data
        log_action(
            actor=self.request.user,
            action="CREATE_SYSTEM_CONFIG",
            entity_type="SystemConfig",
            entity_id=config.pk,
            after=after_data,
            request=self.request,
        )
        self._created_response_data = after_data

    def create(self, request, *args, **kwargs):
        """Override to return the full SystemConfigSerializer representation."""
        super().create(request, *args, **kwargs)
        return Response(self._created_response_data, status=status.HTTP_201_CREATED)

    def perform_update(self, serializer):
        instance = serializer.instance
        before_data = SystemConfigSerializer(instance).data
        config = serializer.save(updated_by=self.request.user)
        after_data = SystemConfigSerializer(config).data
        log_action(
            actor=self.request.user,
            action="UPDATE_SYSTEM_CONFIG",
            entity_type="SystemConfig",
            entity_id=config.pk,
            before=before_data,
            after=after_data,
            request=self.request,
        )

    def get_serializer(self, *args, **kwargs):
        if self.action == 'partial_update':
            kwargs['partial'] = True
        return super().get_serializer(*args, **kwargs)


# ---- Operation API views (TASK-017) ----

class OperationViewSet(viewsets.ModelViewSet):
    """
    GET    /api/operations/       — list operations (authenticated)
    POST   /api/operations/       — create operation (admin only)
    PUT    /api/operations/{id}/  — update operation (admin only)
    DELETE /api/operations/{id}/  — delete operation (admin only)
    """
    queryset = Operation.objects.all().order_by('name')
    serializer_class = OperationSerializer
    http_method_names = ['get', 'post', 'put', 'delete', 'head', 'options']

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [IsAuthenticated()]
        return [IsAdminUser()]


class ProductionLineViewSet(viewsets.ModelViewSet):
    """
    GET    /api/production-lines/       — list production lines
    POST   /api/production-lines/       — create a production line
    GET    /api/production-lines/{id}/  — retrieve a production line
    PATCH  /api/production-lines/{id}/  — partial update
    DELETE /api/production-lines/{id}/  — delete
    """
    queryset = ProductionLine.objects.prefetch_related('machines').all().order_by('name')
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_serializer_class(self):
        if self.action in ('create', 'partial_update', 'update'):
            return ProductionLineWriteSerializer
        return ProductionLineSerializer

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [IsAuthenticated()]
        return [IsAdminUser()]

# ---- Customer Order Request API views ----

import trimesh
from django.core.files.base import ContentFile

class OrderRequestViewSet(viewsets.ModelViewSet):
    """
    GET    /api/orders/requests/       — list order requests (customers see their own, admins see all)
    POST   /api/orders/requests/       — create a new order request with a 3D file
    PATCH  /api/orders/requests/{id}/  — approve/reject request (admin only)
    """
    queryset = OrderRequest.objects.all().order_by('-created_at')
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_permissions(self):
        return [IsAuthenticated()]

    def get_serializer_class(self):
        if self.action == 'create':
            return OrderRequestCreateSerializer
        return OrderRequestSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        # Customers only see their own requests unless they are staff
        if not user.is_staff and user.role.filter(type='customer').exists():
            return qs.filter(customer=user)
        return qs
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            print("Validation Errors for OrderRequest:", serializer.errors)
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        order_request = serializer.save(customer=self.request.user)
        
        # Convert 3D file to GLB for web viewing
        if order_request.file_3d:
            try:
                # Load with trimesh
                mesh = trimesh.load(order_request.file_3d.path)
                if hasattr(mesh, 'dump'): 
                    mesh = mesh.dump()
                    if isinstance(mesh, list) and len(mesh) > 0:
                        mesh = mesh[0]
                # Export to GLB
                glb_data = mesh.export(file_type='glb')
                # Save to file_glb
                filename = os.path.splitext(os.path.basename(order_request.file_3d.name))[0] + '.glb'
                order_request.file_glb.save(filename, ContentFile(glb_data), save=True)
            except Exception as e:
                print(f"Failed to convert 3D file to GLB: {e}")
                
        after_data = OrderRequestSerializer(order_request, context={'request': self.request}).data
        log_action(
            actor=self.request.user,
            action="CREATE_ORDER_REQUEST",
            entity_type="OrderRequest",
            entity_id=order_request.pk,
            after=after_data,
            request=self.request,
        )
        self._created_response_data = after_data

    def create(self, request, *args, **kwargs):
        """Override to return the full OrderRequestSerializer representation."""
        super().create(request, *args, **kwargs)
        return Response(self._created_response_data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='approve', permission_classes=[IsAdminUser])
    def approve(self, request, pk=None):
        """Approve an order request and create the corresponding WorkOrder and Part."""
        order_request = self.get_object()
        if order_request.status != 'PENDING':
            return Response({'detail': 'Only pending requests can be approved.'}, status=status.HTTP_400_BAD_REQUEST)

        from .serializers import OrderRequestApproveSerializer
        
        serializer = OrderRequestApproveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        with transaction.atomic():
            # 1. Create the Part
            part = Part.objects.create(
                name=data['part_name'],
                sku=data['part_sku'],
                description=f"Auto-generated for Order Request {order_request.id}",
            )
            
            # Copy 3D file to part
            if order_request.file_glb:
                part.model_file.save(
                    os.path.basename(order_request.file_glb.name),
                    order_request.file_glb.file,
                    save=True
                )
            elif order_request.file_3d:
                part.model_file.save(
                    os.path.basename(order_request.file_3d.name),
                    order_request.file_3d.file,
                    save=True
                )

            # Handle Custom Line Creation if requested
            assignment_type = data.get('assignmentType')
            final_production_line = data.get('production_line') or data.get('lineId')
            
            if assignment_type == 'custom-line' and data.get('customLineName'):
                import string
                from django.utils.text import slugify
                base_slug = slugify(data.get('customLineName'))
                slug = base_slug
                counter = 1
                while ProductionLine.objects.filter(slug=slug).exists():
                    slug = f"{base_slug}-{counter}"
                    counter += 1
                    
                final_production_line = ProductionLine.objects.create(
                    name=data.get('customLineName'),
                    slug=slug,
                    status='Active',
                    is_custom=True
                )
                
            # 2. Create the WorkOrder
            work_order = WorkOrder.objects.create(
                code=f"WO-REQ-{str(order_request.id)[:8].upper()}",
                description=order_request.description or f"Order from {order_request.customer.username}",
                part=part,
                production_line=final_production_line,
                target_qty=data['target_qty'],
                priority=data['priority'],
                due_date=data.get('due_date'),
                created_by=request.user,
                status='PENDING'
            )

            # Assign machines if provided
            machine_ids = []
            if assignment_type == 'machine':
                machine_ids = data.get('machineIds', [])
            elif assignment_type == 'custom-line':
                machine_ids = data.get('customMachineIds', [])

            for machine in machine_ids:
                WorkOrderAssignment.objects.create(
                    work_order=work_order,
                    machine=machine,
                    assigned_by=request.user
                )

            # 3. Update OrderRequest
            order_request.status = 'APPROVED'
            order_request.work_order = work_order
            order_request.save(update_fields=['status', 'work_order'])

        # Serialize and return
        after_data = OrderRequestSerializer(order_request, context={'request': request}).data
        log_action(
            actor=request.user,
            action="APPROVE_ORDER_REQUEST",
            entity_type="OrderRequest",
            entity_id=order_request.pk,
            after=after_data,
            request=request,
        )
        return Response(after_data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='reject', permission_classes=[IsAdminUser])
    def reject(self, request, pk=None):
        order_request = self.get_object()
        if order_request.status != 'PENDING':
            return Response({'detail': 'Only pending requests can be rejected.'}, status=status.HTTP_400_BAD_REQUEST)
        
        order_request.status = 'REJECTED'
        order_request.rejection_reason = request.data.get('rejection_reason', '')
        order_request.save(update_fields=['status', 'rejection_reason'])
        
        after_data = OrderRequestSerializer(order_request, context={'request': request}).data
        log_action(
            actor=request.user,
            action="REJECT_ORDER_REQUEST",
            entity_type="OrderRequest",
            entity_id=order_request.pk,
            after=after_data,
            request=request,
        )
        return Response(after_data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='retry-conversion')
    def retry_conversion(self, request, pk=None):
        import trimesh
        from django.core.files.base import ContentFile
        import os
        
        order_request = self.get_object()
        if order_request.file_glb:
            return Response({'detail': 'GLB file already exists.'}, status=status.HTTP_400_BAD_REQUEST)
            
        if not order_request.file_3d:
            return Response({'detail': 'No original 3D file found.'}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            mesh = trimesh.load(order_request.file_3d.path)
            # Some obj files with multiple objects load as trimesh.Scene instead of trimesh.Trimesh
            if hasattr(mesh, 'dump'): 
                mesh = mesh.dump()
                if isinstance(mesh, list) and len(mesh) > 0:
                    mesh = mesh[0]
                    
            glb_data = mesh.export(file_type='glb')
            filename = os.path.splitext(os.path.basename(order_request.file_3d.name))[0] + '.glb'
            order_request.file_glb.save(filename, ContentFile(glb_data), save=True)
            
            serializer = OrderRequestSerializer(order_request, context={'request': request})
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'detail': f'Conversion failed: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

# ---- Notification API views ----

class NotificationViewSet(viewsets.ModelViewSet):
    """
    GET /api/notifications/ - list notifications for current user
    POST /api/notifications/{id}/mark_read/ - mark as read
    """
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'post', 'head', 'options']

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user)

    @action(detail=True, methods=['post'], url_path='mark_read')
    def mark_read(self, request, pk=None):
        notification = self.get_object()
        notification.is_read = True
        notification.save(update_fields=['is_read'])
        return Response(self.get_serializer(notification).data)