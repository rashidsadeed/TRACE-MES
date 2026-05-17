from django.contrib.auth import get_user_model
from django.core.validators import FileExtensionValidator
from rest_framework import serializers
from .models import (
    Machine, Part, WorkOrder, WorkOrderAssignment, WorkOrderExecution,
    DefectCode, ProductionLog, AnomalySnapshot, ScrapLog,
    TelemetryPacket, MachineEvent,
    DataExportJob, SystemConfig, Operation, ProductionLine,
)

User = get_user_model()


class MachineSerializer(serializers.ModelSerializer):
    class Meta:
        model = Machine
        fields = ["id", "name", "type", "status", "slug"]


class ProductionLineSerializer(serializers.ModelSerializer):
    """Read serializer for production lines — includes nested machines."""
    machines = MachineSerializer(many=True, read_only=True)

    class Meta:
        model = ProductionLine
        fields = ["id", "name", "slug", "status", "machines"]
        read_only_fields = fields


class ProductionLineWriteSerializer(serializers.ModelSerializer):
    """Write serializer for create / partial_update on production lines."""
    machines = serializers.PrimaryKeyRelatedField(
        queryset=Machine.objects.all(), many=True, required=False,
    )

    class Meta:
        model = ProductionLine
        fields = ["name", "status", "machines"]


class PartSerializer(serializers.ModelSerializer):
    model_file_url = serializers.SerializerMethodField()

    def get_model_file_url(self, obj):
        request = self.context.get("request")
        file = getattr(obj, "model_file", None)
        if file and hasattr(file, "url"):
            if request:
                return request.build_absolute_uri(file.url)
            return file.url
        return None

    class Meta:
        model = Part
        fields = ["id", "name", "sku", "description", "model_file_url"]


class PartModelUploadSerializer(serializers.ModelSerializer):
    model_file = serializers.FileField(
        write_only=True,
        validators=[FileExtensionValidator(allowed_extensions=["glb", "gltf"])],
    )

    class Meta:
        model = Part
        fields = ["model_file"]


# ---- Helper for user representation ----

class _UserMiniSerializer(serializers.ModelSerializer):
    """Minimal read-only user representation (UUID + username)."""
    class Meta:
        model = User
        fields = ["id", "username"]
        read_only_fields = fields


# ---- Work Order serializers ----

class WorkOrderSerializer(serializers.ModelSerializer):
    """Read serializer — used for list / retrieve / audit snapshots."""
    part = PartSerializer(read_only=True)
    created_by = _UserMiniSerializer(read_only=True)

    class Meta:
        model = WorkOrder
        fields = [
            "id", "code", "description", "part", "target_qty",
            "priority", "status", "due_date",
            "created_by", "created_at", "updated_at",
        ]
        read_only_fields = fields


class WorkOrderCreateSerializer(serializers.ModelSerializer):
    """Write serializer — used for POST (create)."""
    part = serializers.PrimaryKeyRelatedField(queryset=Part.objects.all())
    production_line = serializers.PrimaryKeyRelatedField(
        queryset=ProductionLine.objects.all(), required=False, allow_null=True,
    )

    class Meta:
        model = WorkOrder
        fields = [
            "code", "description", "part", "production_line",
            "target_qty", "priority", "due_date",
        ]


class WorkOrderUpdateSerializer(serializers.ModelSerializer):
    """Write serializer — used for PATCH (partial update)."""

    class Meta:
        model = WorkOrder
        fields = ["description", "target_qty", "priority", "due_date"]


# ---- Work Order Assignment serializers ----

class WorkOrderAssignmentSerializer(serializers.ModelSerializer):
    """Read serializer for assignments."""
    work_order = serializers.UUIDField(source="work_order_id", read_only=True)
    machine = MachineSerializer(read_only=True)
    operator = _UserMiniSerializer(read_only=True)
    assigned_by = _UserMiniSerializer(read_only=True)

    class Meta:
        model = WorkOrderAssignment
        fields = ["id", "work_order", "machine", "operator", "assigned_at", "assigned_by"]
        read_only_fields = fields


class WorkOrderAssignmentCreateSerializer(serializers.ModelSerializer):
    """Write serializer for the assign action."""
    machine = serializers.PrimaryKeyRelatedField(
        queryset=Machine.objects.exclude(status='OFFLINE'),
    )
    operator = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(is_active=True),
    )

    class Meta:
        model = WorkOrderAssignment
        fields = ["machine", "operator"]


# ---- Work Order Execution serializers ----

class WorkOrderExecutionSerializer(serializers.ModelSerializer):
    """Read serializer for execution records."""
    work_order = serializers.UUIDField(source="work_order_id", read_only=True)
    work_order_code = serializers.CharField(source="work_order.code", read_only=True)
    part_name = serializers.CharField(source="work_order.part.name", read_only=True)
    target_qty = serializers.IntegerField(source="work_order.target_qty", read_only=True)
    priority = serializers.IntegerField(source="work_order.priority", read_only=True)
    due_date = serializers.DateTimeField(
        source="work_order.due_date", read_only=True, allow_null=True,
    )
    actual_qty = serializers.SerializerMethodField()
    machine = MachineSerializer(read_only=True)
    operator = _UserMiniSerializer(read_only=True)
    production_line_id = serializers.UUIDField(
        source="work_order.production_line_id", read_only=True, allow_null=True,
    )
    production_line_slug = serializers.SlugField(
        source="work_order.production_line.slug", read_only=True, allow_null=True, default=None,
    )
    production_line_name = serializers.CharField(
        source="work_order.production_line.name", read_only=True, allow_null=True, default=None,
    )
    part_model_url = serializers.SerializerMethodField()

    def get_part_model_url(self, obj):
        request = self.context.get("request")
        file = getattr(obj.work_order.part, "model_file", None)
        if file and hasattr(file, "url"):
            if request:
                return request.build_absolute_uri(file.url)
            return file.url
        return None

    def get_actual_qty(self, obj):
        # Calculate sum of good_qty from all related production logs
        return sum(log.good_qty for log in obj.production_logs.all())

    class Meta:
        model = WorkOrderExecution
        fields = [
            "id", "work_order", "work_order_code", "part_name", "machine", "operator",
            "status", "target_qty", "actual_qty", "priority", "due_date",
            "started_at", "paused_at", "completed_at",
            "production_line_id", "production_line_slug", "production_line_name",
            "part_model_url",
        ]
        read_only_fields = fields


class ExecutionStartSerializer(serializers.Serializer):
    """Write serializer for starting a new execution."""
    work_order = serializers.PrimaryKeyRelatedField(queryset=WorkOrder.objects.all())
    machine = serializers.PrimaryKeyRelatedField(queryset=Machine.objects.all())
    operator = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(is_active=True),
        required=False,
        allow_null=True,
    )

    def validate_work_order(self, value):
        if value.status not in ('PENDING', 'PAUSED'):
            raise serializers.ValidationError(
                f"Work order must be in PENDING or PAUSED status (current: {value.status})."
            )
        return value

    def validate_machine(self, value):
        if value.status == 'OFFLINE':
            raise serializers.ValidationError("Machine must not be OFFLINE.")
        return value


# ---- Defect Code serializers ----

class DefectCodeSerializer(serializers.ModelSerializer):
    """Read serializer — all fields."""
    class Meta:
        model = DefectCode
        fields = ["id", "code", "description", "category"]
        read_only_fields = fields


class DefectCodeCreateSerializer(serializers.ModelSerializer):
    """Write serializer — create a defect code."""
    class Meta:
        model = DefectCode
        fields = ["code", "description", "category"]


# ---- Production Log serializers ----

class ProductionLogSerializer(serializers.ModelSerializer):
    """Read serializer — nested execution UUID, recorded_by mini."""
    execution = serializers.UUIDField(source="execution_id", read_only=True)
    recorded_by = _UserMiniSerializer(read_only=True)

    class Meta:
        model = ProductionLog
        fields = ["id", "execution", "recorded_by", "good_qty", "scrap_qty", "recorded_at"]
        read_only_fields = fields


class ProductionLogCreateSerializer(serializers.ModelSerializer):
    """Write serializer — execution FK, good_qty, scrap_qty."""
    execution = serializers.PrimaryKeyRelatedField(queryset=WorkOrderExecution.objects.all())

    class Meta:
        model = ProductionLog
        fields = ["execution", "good_qty", "scrap_qty"]


# ---- Anomaly Snapshot serializer ----

class AnomalySnapshotSerializer(serializers.ModelSerializer):
    """Read serializer for anomaly snapshots."""
    execution = serializers.UUIDField(source="execution_id", read_only=True)

    class Meta:
        model = AnomalySnapshot
        fields = ["id", "execution", "captured_at", "telemetry_window_json"]
        read_only_fields = fields


# ---- Scrap Log serializers ----

class ScrapLogSerializer(serializers.ModelSerializer):
    """Read serializer — nested UUIDs for production_log, defect_code, anomaly_snapshot."""
    production_log = serializers.UUIDField(source="production_log_id", read_only=True)
    defect_code = DefectCodeSerializer(read_only=True)
    anomaly_snapshot = serializers.UUIDField(source="anomaly_snapshot_id", read_only=True)

    class Meta:
        model = ScrapLog
        fields = ["id", "production_log", "defect_code", "qty", "anomaly_snapshot"]
        read_only_fields = fields


class ScrapLogCreateSerializer(serializers.ModelSerializer):
    """Write serializer — production_log FK, defect_code FK, qty."""
    production_log = serializers.PrimaryKeyRelatedField(queryset=ProductionLog.objects.all())
    defect_code = serializers.PrimaryKeyRelatedField(queryset=DefectCode.objects.all())

    class Meta:
        model = ScrapLog
        fields = ["production_log", "defect_code", "qty"]


# ---- Live / Telemetry serializers ----

class TelemetryPacketSerializer(serializers.ModelSerializer):
    """Read serializer for telemetry packets."""
    machine = serializers.UUIDField(source="machine_id", read_only=True)
    execution = serializers.UUIDField(source="execution_id", read_only=True)

    class Meta:
        model = TelemetryPacket
        fields = [
            "id", "machine", "execution", "timestamp",
            "spindle_speed", "feed_rate", "temperature", "vibration",
        ]
        read_only_fields = fields


class MachineOverviewSerializer(MachineSerializer):
    """Machine serializer extended with the latest telemetry packet."""
    latest_telemetry = TelemetryPacketSerializer(allow_null=True, read_only=True)

    class Meta(MachineSerializer.Meta):
        fields = MachineSerializer.Meta.fields + ["latest_telemetry"]


class MachineEventSerializer(serializers.ModelSerializer):
    """Read serializer for machine events."""
    machine = serializers.UUIDField(source="machine_id", read_only=True)

    class Meta:
        model = MachineEvent
        fields = ["id", "machine", "event_type", "timestamp", "details"]
        read_only_fields = fields


# ---- Data Export Job serializers ----

class DataExportJobSerializer(serializers.ModelSerializer):
    """Read serializer for DataExportJob.
    S5: file_path excluded (internal server path).
    S14: error_message sanitised (no stack traces exposed).
    """
    requested_by = _UserMiniSerializer(read_only=True)
    error_message = serializers.SerializerMethodField()

    class Meta:
        model = DataExportJob
        fields = [
            "id", "requested_by", "status", "format",
            "date_from", "date_to",
            "error_message", "created_at", "completed_at",
        ]
        read_only_fields = fields

    def get_error_message(self, obj):
        """Return only the first line (class + message), strip tracebacks."""
        if not obj.error_message:
            return None
        return obj.error_message.split('\n')[0]


class DataExportJobCreateSerializer(serializers.ModelSerializer):
    """Write serializer for creating a DataExportJob."""

    class Meta:
        model = DataExportJob
        fields = ["format", "date_from", "date_to"]

    def validate(self, attrs):
        if attrs['date_from'] >= attrs['date_to']:
            raise serializers.ValidationError(
                {"date_to": "date_to must be after date_from."}
            )
        # S13: Cap date range at 90 days to prevent resource exhaustion
        from datetime import timedelta
        max_range = timedelta(days=90)
        if (attrs['date_to'] - attrs['date_from']) > max_range:
            raise serializers.ValidationError(
                {"date_to": "Date range must not exceed 90 days."}
            )
        return attrs


# ---- SystemConfig serializers ----

class SystemConfigSerializer(serializers.ModelSerializer):
    """Read/Write serializer for SystemConfig."""
    updated_by = _UserMiniSerializer(read_only=True)

    class Meta:
        model = SystemConfig
        fields = ["id", "key", "value", "data_type", "description", "updated_at", "updated_by"]
        read_only_fields = ["id", "updated_at", "updated_by"]


# ---- Operation serializers ----

class OperationSerializer(serializers.ModelSerializer):
    """Read/Write serializer for Operation."""

    class Meta:
        model = Operation
        fields = ["id", "name", "description"]
        read_only_fields = ["id"]