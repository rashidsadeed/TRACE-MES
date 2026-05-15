from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import CustomUser, Role, Permission, UserSession, ActiveUserManager, ApiClient

class CustomUserAdmin(UserAdmin):
    model = CustomUser

    list_display = ("username", "email", "first_name", "last_name", "display_roles", "is_staff", "is_active")

    #filter sidebar
    list_filter = ("is_active", "is_staff", "roles")

    def display_roles(self, obj):
        return ", ".join([role.name for role in obj.roles.all()])
    
    display_roles.short_description = "Roles"


admin.site.register(Role)
admin.site.register(Permission)
admin.site.register(UserSession)
admin.site.register(ApiClient)


# Register your models here.
