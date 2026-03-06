import uuid
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin, BaseUserManager
from django.db import models
from django.utils import timezone

# Custom manager to manage only active users
class ActiveUserManager(BaseUserManager):
    def get_queryset(self):
        return super().get_queryset().filter(is_active=True)

# Managers (helper logic for creating users and superusers)
class CustomUserManager(BaseUserManager):
    def create_user(self, username, email, password=None, **extra_fields):
        if not email:
            raise ValueError('The Email field must be set')
        email = self.normalize_email(email)
        user = self.model(username=username, email=email, **extra_fields)
        user.set_password(password) # Hash the password
        user.save(using=self._db)
        return user
    
    def create_superuser(self, username, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)

        return self.create_user(username, email, password, **extra_fields)
    
# Supporting models (Role, Permission, etc.)
class Permission(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=100, unique=True) # e.g "sys.admin"
    description = models.TextField(blank=True)
    module = models.CharField(max_length=100) # e.g "System"

    def __str__(self):
        return self.code

class Role(models.Model):
    class RoleType(models.TextChoices):
        SYSTEM = 'system', 'System'
        CUSTOM = 'custom', 'Custom'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    type = models.CharField(max_length=20, choices=RoleType.choices, default=RoleType.CUSTOM)
    name = models.CharField(max_length=100, unique=True)
    level = models.IntegerField(default=1) # For hierarchical roles
    description = models.TextField(blank=True, null=True)

    #Many-to-many relationship with permissions
    permissions = models.ManyToManyField(Permission, related_name='roles')

    def __str__(self):
        return self.name

class CustomUser(AbstractBaseUser, PermissionsMixin):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    username = models.CharField(max_length=150, unique=True)
    email = models.EmailField(unique=True)
    first_name = models.CharField(max_length=30, blank=True)
    last_name = models.CharField(max_length=30, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_login = models.DateTimeField(blank=True, null=True) # Django uses 'last_login' by default, can be mapped
    role = models.ManyToManyField(Role, related_name='users', blank=True) # Many-to-many relationship with roles

    is_staff = models.BooleanField(default=False) # Required for admin interface access
    objects = CustomUserManager()
    active = ActiveUserManager()

    USERNAME_FIELD = 'username'
    REQUIRED_FIELDS = ['email']

    def delete(self, using=None, keep_parents=False):
        # Soft delete: Mark the user as inactive instead of deleting from DB
        self.is_active = False
        self.save()

        #close all active sessions for this user
        now = timezone.now()
        self.sessions.filter(ended_at__isnull=True).update(ended_at=now)

    def hard_delete(self, using=None, keep_parents=False):
        # Permanently delete the user from the database
        super().delete(using=using, keep_parents=keep_parents)

    def __str__(self):
        return self.username
    
class UserSession(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='sessions')
    #TODO: ADD TOKEN TO DB SCHEMA AND DIAGRAM
    token = models.CharField(max_length=255, unique=True) # Store JWT or session token 
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    is_switch_user = models.BooleanField(default=False) # Indicates if this session is a result of a user switch
    last_activity = models.DateTimeField(auto_now=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True) # Optional: Track IP address for security

    def __str__(self):
        return f"Session for {self.user.username} (started at {self.started_at})"
    
class ApiClient(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    api_key_hash = models.CharField(max_length=255, unique=True) # Store API key for authentication
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return self.name