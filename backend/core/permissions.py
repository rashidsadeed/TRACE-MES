from rest_framework.permissions import BasePermission


class HasPermission(BasePermission):
    """
    Check if the authenticated user's roles include a specific permission code.

    Usage: permission_classes = [HasPermission('workorders.create')]

    Implementation: This is a factory -- calling HasPermission('code') returns a
    permission class, not an instance. Use it like:
        permission_classes = [HasPermission('workorders.create')]
    """

    def __init__(self, permission_code):
        self.permission_code = permission_code

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        # Superusers / staff always pass (backwards compat)
        if request.user.is_staff:
            return True
        # Check if any of the user's roles contain this permission code
        return request.user.role.filter(
            permissions__code=self.permission_code
        ).exists()


def require_permission(code):
    """Factory function that returns a HasPermission class for use in permission_classes."""
    class DynamicPermission(HasPermission):
        def __init__(self):
            super().__init__(code)
    DynamicPermission.__name__ = f'HasPermission_{code}'
    DynamicPermission.__qualname__ = f'HasPermission_{code}'
    return DynamicPermission


# Convenience shortcuts
IsAdmin = require_permission('system.admin')
IsSupervisor = require_permission('workorders.manage')
