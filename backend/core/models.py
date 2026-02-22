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
        return f"{self.timestamp} - {self.actor_user} - {self.action_type} on {self.entity_type}({self.entity_id})"
    