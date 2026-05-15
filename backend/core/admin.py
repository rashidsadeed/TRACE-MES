from django.contrib import admin
from .models import Machine, Part, Operation, SystemConfig, AuditLog
# Register your models here.

@admin.register(Machine)
class MachineAdmin(admin.ModelAdmin):
    list_display = ('name', 'type', 'status', 'created_at')
    list_filter = ('status', 'type')
    search_fields = ('name',"slug")
    # automatically fills the sluf field based on the name field in the admin interface
    prepopulated_fields = {"slug": ("name",)}

@admin.register(Part)
class PartAdmin(admin.ModelAdmin):
    list_display = ('name', 'sku', 'created_at')
    search_fields = ('name', 'sku')

@admin.register(Operation)
class OperationAdmin(admin.ModelAdmin):
    list_display = ('name',)
    search_fields = ('name',)

# ---- system and audit
@admin.register(SystemConfig)
class SystemConfigAdmin(admin.ModelAdmin):
    list_display = ('key', 'value', 'data_type', 'updated_at', 'updated_by')
    search_fields = ('key',"description")
    list_filter = ('data_type',)

@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ('timestamp', "actor_user" , 'action', 'entity_type', 'entity_id')
    list_filter = ('action', 'entity_type', "timestamp")
    # the double underscore allows us to search by the username of the actor_user instead of the id, e.i the foreign key
    search_fields = ('actor_user__username', 'entity_id')

    ### security : make audits read-only
    def has_add_permission(self, request):
        return False
    
    def has_change_permission(self, request, obj=None):
        return False
    
    def has_delete_permission(self, request, obj=None):
        return False
    
    