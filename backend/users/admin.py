from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import CustomUser

class CustomUserAdmin(UserAdmin):
    model = CustomUser

    list_display = ("username", "email", "first_name", "last_name", "role", "is_staff", "is_active")

    fieldsets = UserAdmin.fieldsets + (
        ("MES Role Info", {"fields": ("role",)}),
    )

    add_fieldsets = UserAdmin.add_fieldsets + (
        ("MES Role Info", {"fields": ("role",)}),
    )

admin.site.register(CustomUser, CustomUserAdmin)


# Register your models here.
