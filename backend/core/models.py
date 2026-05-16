import uuid
from django.db import models
from django.conf import settings


#Manufacturing models ------------
class Machine(models.Model):
    STATUS_CHOICES = [
        ('RUNNING', 'Running'),
        ('IDLE', 'Idle'),
        ('DOWN', 'Down'),
        ('OFFLINE', 'Offline'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100)
    slug = models.SlugField(unique=True, blank=True)
    type = models.CharField(max_length=50, help_text="e.g. Milling, Turning, Assembly")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='OFFLINE')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        # Auto-generate slug from name if not provided
        if not self.slug:
            from django.utils.text import slugify
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.status})"

class Part(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100)
    sku = models.CharField(max_length=50, unique=True, help_text="Stock Keeping Unit")
    description = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.sku})"

class Operation(models.Model):
    """
    Represents a generic manufacturing step, e.g., 'Drilling', 'Heat Treat'.
    """
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, null=True)

    def __str__(self):
        return self.name


class ProductionLine(models.Model):
    """A named group of machines that work together on a product flow."""
    STATUS_CHOICES = [
        ('ACTIVE', 'Active'),
        ('IDLE', 'Idle'),
        ('MAINTENANCE', 'Maintenance'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100)
    slug = models.SlugField(unique=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='IDLE')
    machines = models.ManyToManyField(Machine, related_name='production_lines', blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        if not self.slug:
            from django.utils.text import slugify
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.status})"


# ---- SYSTEM AND AUDIT MODELS -----

class SystemConfig(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    key = models.CharField(max_length=100, unique=True)
    value = models.TextField(max_length=255)
    data_type = models.CharField(max_length=50, help_text="e.g. string, integer, boolean")
    description = models.TextField(blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)

    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL,
                                    on_delete=models.SET_NULL,
                                    null=True,
                                    blank=True,
                                    related_name='config_updates'
                                    )
    def __str__(self):
        return f"{self.key} = {self.value} ({self.data_type})"
    
class AuditLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    actor_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='audit_logs'
    )
    timestamp = models.DateTimeField(auto_now_add=True)
    action = models.CharField(max_length=100) # e.g. "CREATE_USER  

    entity_type = models.CharField(max_length=100) # e.g. "User", "Machine"
    entity_id = models.UUIDField() # ID of the affected entity

    before_json = models.JSONField(blank=True, null=True) # State before the change
    after_json = models.JSONField(blank=True, null=True) # State after the change

    ip_address = models.GenericIPAddressField(blank=True, null=True)
    user_agent = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"{self.timestamp} - {self.actor_user} - {self.action} on {self.entity_type}({self.entity_id})"


# ---- WORK ORDER MODELS -----

class WorkOrder(models.Model):
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('IN_PROGRESS', 'In Progress'),
        ('PAUSED', 'Paused'),
        ('COMPLETED', 'Completed'),
        ('CANCELLED', 'Cancelled'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=50, unique=True, help_text='e.g. WO-2026-001')
    description = models.TextField(blank=True)
    part = models.ForeignKey(Part, on_delete=models.PROTECT, related_name='work_orders')
    production_line = models.ForeignKey(
        'ProductionLine', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='work_orders',
        help_text='Optional production line assignment for this work order.',
    )
    target_qty = models.PositiveIntegerField()
    priority = models.IntegerField(default=1)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    due_date = models.DateTimeField(
        null=True, blank=True,
        help_text='Customer-facing deadline for this work order.',
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_work_orders',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.code} ({self.status})"


class WorkOrderAssignment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    work_order = models.ForeignKey(WorkOrder, on_delete=models.CASCADE, related_name='assignments')
    machine = models.ForeignKey(Machine, on_delete=models.PROTECT, related_name='work_order_assignments')
    operator = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='work_order_assignments',
    )
    assigned_at = models.DateTimeField(auto_now_add=True)
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='assigned_work_orders',
    )

    def __str__(self):
        return f"WO {self.work_order.code} -> Machine {self.machine.name}"


class WorkOrderExecution(models.Model):
    STATUS_CHOICES = [
        ('AWAITING_START', 'Awaiting Start'),
        ('RUNNING', 'Running'),
        ('PAUSED', 'Paused'),
        ('STOPPED', 'Stopped'),
        ('COMPLETED', 'Completed'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    work_order = models.ForeignKey(WorkOrder, on_delete=models.CASCADE, related_name='executions')
    machine = models.ForeignKey(Machine, on_delete=models.PROTECT, related_name='executions')
    operator = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='executions',
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='RUNNING')
    started_at = models.DateTimeField(auto_now_add=True)
    paused_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"Execution {self.id} for {self.work_order.code} ({self.status})"


# ---- QUALITY MODELS -----

class DefectCode(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=50, unique=True)
    description = models.TextField(blank=True)
    category = models.CharField(max_length=50)

    def __str__(self):
        return f"{self.code} ({self.category})"


class ProductionLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    execution = models.ForeignKey(WorkOrderExecution, on_delete=models.CASCADE, related_name='production_logs')
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='production_logs',
    )
    good_qty = models.PositiveIntegerField()
    scrap_qty = models.PositiveIntegerField(default=0)
    recorded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"ProductionLog {self.id} — good={self.good_qty}, scrap={self.scrap_qty}"


class AnomalySnapshot(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    execution = models.ForeignKey(WorkOrderExecution, on_delete=models.CASCADE, related_name='anomaly_snapshots')
    captured_at = models.DateTimeField(auto_now_add=True)
    telemetry_window_json = models.JSONField(blank=True, null=True, help_text='Last 5 min of telemetry data')

    def __str__(self):
        return f"AnomalySnapshot {self.id} at {self.captured_at}"


class ScrapLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    production_log = models.ForeignKey(ProductionLog, on_delete=models.CASCADE, related_name='scrap_entries')
    defect_code = models.ForeignKey(DefectCode, on_delete=models.PROTECT, related_name='scrap_logs')
    qty = models.PositiveIntegerField()
    anomaly_snapshot = models.ForeignKey(AnomalySnapshot, on_delete=models.SET_NULL, null=True, blank=True, related_name='scrap_logs')

    def __str__(self):
        return f"ScrapLog {self.id} — defect={self.defect_code.code}, qty={self.qty}"


# ---- TELEMETRY MODELS -----

class TelemetryPacket(models.Model):
    id = models.BigAutoField(primary_key=True)
    machine = models.ForeignKey(Machine, on_delete=models.CASCADE, related_name='telemetry_packets')
    execution = models.ForeignKey(
        WorkOrderExecution,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='telemetry_packets',
    )
    timestamp = models.DateTimeField(db_index=True)
    spindle_speed = models.FloatField()
    feed_rate = models.FloatField()
    temperature = models.FloatField()
    vibration = models.FloatField()

    class Meta:
        indexes = [
            models.Index(fields=['machine', 'timestamp']),
        ]

    def __str__(self):
        return f"Telemetry {self.pk} — {self.machine.name} @ {self.timestamp}"


class MachineEvent(models.Model):
    EVENT_TYPE_CHOICES = [
        ('HEARTBEAT_LOST', 'Heartbeat Lost'),
        ('HEARTBEAT_RESTORED', 'Heartbeat Restored'),
        ('STATUS_CHANGE', 'Status Change'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    machine = models.ForeignKey(Machine, on_delete=models.CASCADE, related_name='events')
    event_type = models.CharField(max_length=30, choices=EVENT_TYPE_CHOICES)
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)
    details = models.JSONField(blank=True, null=True)

    def __str__(self):
        return f"{self.event_type} on {self.machine.name} at {self.timestamp}"


# ---- DATA EXPORT MODELS -----

class DataExportJob(models.Model):
    STATUS_CHOICES = [
        ('QUEUED', 'Queued'),
        ('PROCESSING', 'Processing'),
        ('COMPLETED', 'Completed'),
        ('FAILED', 'Failed'),
    ]

    FORMAT_CHOICES = [
        ('CSV', 'CSV'),
        ('JSON', 'JSON'),
        ('PARQUET', 'Parquet'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='export_jobs',
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='QUEUED')
    format = models.CharField(max_length=10, choices=FORMAT_CHOICES, default='CSV')
    date_from = models.DateTimeField()
    date_to = models.DateTimeField()
    file_path = models.CharField(max_length=500, null=True, blank=True)
    error_message = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"Export {self.id} ({self.status}) — {self.format}"