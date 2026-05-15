from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    CustomLoginView, LogoutView, HeartbeatView,
    UserViewSet, RoleViewSet, PermissionViewSet,
)

router = DefaultRouter()
router.register(r'users', UserViewSet, basename='user')
router.register(r'roles', RoleViewSet, basename='role')
router.register(r'permissions', PermissionViewSet, basename='permission')

urlpatterns = [
    # Auth endpoints
    path('auth/login/', CustomLoginView.as_view(), name='auth-login'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='auth-refresh'),
    path('auth/logout/', LogoutView.as_view(), name='auth-logout'),
    path('auth/heartbeat/', HeartbeatView.as_view(), name='auth-heartbeat'),

    # User management endpoints (via router)
    # Produces: /api/users/, /api/users/{id}/, /api/users/me/
    path('', include(router.urls)),
]
