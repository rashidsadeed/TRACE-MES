import os
from datetime import timedelta

from django.conf import settings as django_settings
from django.db import transaction
from django.db.models import Prefetch, Subquery, OuterRef
from django.http import FileResponse
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
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
    DataExportJob, SystemConfig, Operation,
)
from .serializers import (
    MachineSerializer,
    PartSerializer,
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
        before_data = WorkOrderSerializer(instance, context={'request': self.request}).data
        wo = serializer.save()
        after_data = WorkOrderSerializer(wo, context={'request': self.request}).data
        log_action(
            actor=self.request.user,
            action="UPDATE_WORKORDER",
            entity_type="WorkOrder",
            entity_id=wo.pk,
            before=before_data,
            after=after_data,
            request=self.request,
        )

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
    POST /api/executions/{id}/stop/      — stop (complete) an execution
    """
    queryset = WorkOrderExecution.objects.select_related('work_order', 'machine', 'operator')
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
            operator = serializer.validated_data['operator']

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

            # Create execution record
            execution = WorkOrderExecution.objects.create(
                work_order=work_order,
                machine=machine,
                operator=operator,
                status='RUNNING',
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
        """Stop (complete) an execution."""
        with transaction.atomic():
            execution = WorkOrderExecution.objects.select_for_update().get(pk=self.get_object().pk)

            if execution.status == 'COMPLETED':
                return Response(
                    {'detail': 'Cannot stop: execution is already completed.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            before_data = self._serialize(execution)

            execution.status = 'COMPLETED'
            execution.completed_at = timezone.now()
            execution.paused_at = None  # B-4: clear paused_at when stopping a paused execution
            execution.save(update_fields=['status', 'completed_at', 'paused_at'])

            work_order = WorkOrder.objects.select_for_update().get(pk=execution.work_order_id)
            work_order.status = 'COMPLETED'
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