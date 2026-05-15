import hashlib

from django.utils import timezone
from rest_framework import status, viewsets, mixins
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError

from django.conf import settings
from django.apps import apps

from .models import CustomUser, UserSession, Role, Permission
from .serializers import (
    UserSerializer, UserCreateSerializer, UserUpdateSerializer,
    RoleDetailSerializer, RoleCreateSerializer, RoleUpdateSerializer,
    PermissionSerializer,
)
from .utils import get_client_ip
from core.audit import log_action

SESSION_TIMEOUT_MINUTES = 15


class CustomLoginView(TokenObtainPairView):
    """Override login to create a UserSession on successful authentication."""

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)

        if response.status_code == 200:
            access_token = response.data.get('access', '')
            token_hash = hashlib.sha256(access_token.encode()).hexdigest()

            # Decode user from the token to avoid re-running serializer validation
            from rest_framework_simplejwt.tokens import AccessToken
            decoded = AccessToken(access_token)
            User = apps.get_model(settings.AUTH_USER_MODEL)
            user = User.objects.get(pk=decoded['user_id'])

            UserSession.objects.create(
                user=user,
                token=token_hash,
                ip_address=get_client_ip(request),
            )

        return response


class LogoutView(APIView):
    """Mark the active UserSession as ended."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        auth_header = request.META.get('HTTP_AUTHORIZATION', '')
        if not auth_header.startswith('Bearer '):
            return Response(
                {'detail': 'Missing or invalid Authorization header.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        raw_token = auth_header.split(' ', 1)[1]
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()

        updated = UserSession.objects.filter(
            token=token_hash,
            user=request.user,
            ended_at__isnull=True,
        ).update(ended_at=timezone.now())

        if updated == 0:
            return Response(
                {'detail': 'No active session found for this token.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Blacklist the refresh token if the client supplied it
        # Note: AccessToken does not support blacklisting in simplejwt;
        # mitigation is the 15-min ACCESS_TOKEN_LIFETIME (BLOCK-2).
        refresh_raw = request.data.get('refresh')
        if refresh_raw:
            try:
                RefreshToken(refresh_raw).blacklist()
            except TokenError:
                pass

        return Response({'detail': 'Logged out successfully.'}, status=status.HTTP_200_OK)


class HeartbeatView(APIView):
    """Update last_activity on the active session. Return 401 if session expired."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        auth_header = request.META.get('HTTP_AUTHORIZATION', '')
        if not auth_header.startswith('Bearer '):
            return Response(
                {'detail': 'Missing or invalid Authorization header.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        raw_token = auth_header.split(' ', 1)[1]
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()

        now = timezone.now()

        session = UserSession.objects.filter(
            token=token_hash,
            user=request.user,
            ended_at__isnull=True,
        ).first()

        if session is None:
            return Response(
                {'detail': 'No active session found.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # Check if session has been inactive for longer than the timeout
        time_since_activity = (now - session.last_activity).total_seconds()
        if time_since_activity > SESSION_TIMEOUT_MINUTES * 60:
            session.ended_at = now
            session.save(update_fields=['ended_at'])
            return Response(
                {'detail': 'Session expired due to inactivity.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # Atomic single-field update — avoids a full-row UPDATE and race conditions
        UserSession.objects.filter(pk=session.pk).update(last_activity=now)

        return Response({'detail': 'Session active.', 'last_activity': now}, status=status.HTTP_200_OK)


class UserViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """
    CRUD + role-assignment endpoint for CustomUser.

    Endpoints produced by the router:
        GET    /api/users/        — list active users
        POST   /api/users/        — create a new user
        GET    /api/users/{id}/   — retrieve a user
        PATCH  /api/users/{id}/   — partial update (name, email, roles)
        DELETE /api/users/{id}/   — soft-delete (sets is_active=False)
        GET    /api/users/me/     — return the current user's own profile
    """
    # TODO (TASK-016): Replace IsAdminUser with custom RBAC permission classes.
    # Until then, is_staff is the proxy for admin access.
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_permissions(self):
        # 'me' and 'retrieve' are available to any authenticated user.
        # All mutating actions and list require admin (is_staff).
        if self.action in ('me', 'retrieve'):
            return [IsAuthenticated()]
        return [IsAdminUser()]

    def get_queryset(self):
        return CustomUser.objects.filter(is_active=True).prefetch_related('role')

    def get_serializer_class(self):
        if self.action == 'create':
            return UserCreateSerializer
        if self.action == 'partial_update':
            return UserUpdateSerializer
        return UserSerializer

    def get_serializer(self, *args, **kwargs):
        # Enforce partial=True for PATCH so that all fields are optional.
        if self.action == 'partial_update':
            kwargs['partial'] = True
        return super().get_serializer(*args, **kwargs)

    @action(detail=False, methods=['get'], url_path='me')
    def me(self, request):
        """Return the authenticated user's own profile and assigned roles."""
        serializer = UserSerializer(request.user, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    def perform_create(self, serializer):
        user = serializer.save()
        after_data = UserSerializer(user, context={'request': self.request}).data
        log_action(
            actor=self.request.user,
            action="CREATE_USER",
            entity_type="User",
            entity_id=user.pk,
            after=after_data,
            request=self.request,
        )

    def perform_update(self, serializer):
        instance = serializer.instance
        before_data = UserSerializer(instance, context={'request': self.request}).data
        user = serializer.save()
        after_data = UserSerializer(user, context={'request': self.request}).data
        log_action(
            actor=self.request.user,
            action="UPDATE_USER",
            entity_type="User",
            entity_id=user.pk,
            before=before_data,
            after=after_data,
            request=self.request,
        )

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if request.user.pk == instance.pk:
            return Response(
                {'detail': 'Cannot delete your own account.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        before_data = UserSerializer(instance, context={'request': request}).data
        instance.delete()  # Calls CustomUser.delete() — soft delete
        log_action(
            actor=request.user,
            action="DELETE_USER",
            entity_type="User",
            entity_id=instance.pk,
            before=before_data,
            request=request,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class RoleViewSet(viewsets.ModelViewSet):
    """
    Full CRUD for roles (admin-only).

    Endpoints produced by the router:
        GET    /api/roles/                     — list all roles
        POST   /api/roles/                     — create a new role
        GET    /api/roles/{id}/                — retrieve a role with nested permissions
        PATCH  /api/roles/{id}/                — partial update (name, level, description)
        DELETE /api/roles/{id}/                — delete a role (custom roles only)
        POST   /api/roles/{id}/permissions/    — set the role's permissions
    """
    permission_classes = [IsAdminUser]
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        return Role.objects.prefetch_related('permissions')

    def get_serializer_class(self):
        if self.action == 'create':
            return RoleCreateSerializer
        if self.action == 'partial_update':
            return RoleUpdateSerializer
        return RoleDetailSerializer

    def get_serializer(self, *args, **kwargs):
        if self.action == 'partial_update':
            kwargs['partial'] = True
        return super().get_serializer(*args, **kwargs)

    def perform_create(self, serializer):
        role = serializer.save()
        after_data = RoleDetailSerializer(role).data
        log_action(
            actor=self.request.user,
            action="CREATE_ROLE",
            entity_type="Role",
            entity_id=role.pk,
            after=after_data,
            request=self.request,
        )
        self._created_response_data = after_data

    def create(self, request, *args, **kwargs):
        """Override to return the full RoleDetailSerializer representation."""
        super().create(request, *args, **kwargs)
        return Response(self._created_response_data, status=status.HTTP_201_CREATED)

    def perform_update(self, serializer):
        instance = serializer.instance
        before_data = RoleDetailSerializer(instance).data
        role = serializer.save()
        after_data = RoleDetailSerializer(role).data
        log_action(
            actor=self.request.user,
            action="UPDATE_ROLE",
            entity_type="Role",
            entity_id=role.pk,
            before=before_data,
            after=after_data,
            request=self.request,
        )

    def destroy(self, request, *args, **kwargs):
        role = self.get_object()
        if role.type == 'system':
            return Response(
                {'detail': 'Cannot delete a system role.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        role_pk = role.pk  # Capture before delete clears pk
        before_data = RoleDetailSerializer(role).data
        role.delete()
        log_action(
            actor=request.user,
            action="DELETE_ROLE",
            entity_type="Role",
            entity_id=role_pk,
            before=before_data,
            request=request,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'], url_path='permissions')
    def set_permissions(self, request, pk=None):
        """Replace the role's permissions with the supplied list of Permission UUIDs."""
        role = self.get_object()
        raw = request.data.get('permissions', [])

        # BLOCK-2 fix: validate input type
        if not isinstance(raw, list):
            return Response(
                {'detail': '`permissions` must be a list of UUID strings.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # BLOCK-1 fix: deduplicate before validation
        permission_ids = list(set(raw))

        # Validate that all supplied IDs correspond to existing permissions
        existing = Permission.objects.filter(pk__in=permission_ids)
        if existing.count() != len(permission_ids):
            return Response(
                {'detail': 'One or more permission IDs are invalid.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        before_data = RoleDetailSerializer(role).data
        role.permissions.set(permission_ids)
        after_data = RoleDetailSerializer(role).data
        log_action(
            actor=request.user,
            action="SET_ROLE_PERMISSIONS",
            entity_type="Role",
            entity_id=role.pk,
            before=before_data,
            after=after_data,
            request=request,
        )
        return Response(after_data, status=status.HTTP_200_OK)


class PermissionViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """
    Read-only list of system-defined permissions.

    Endpoint:
        GET /api/permissions/
    """
    permission_classes = [IsAuthenticated]
    serializer_class = PermissionSerializer
    queryset = Permission.objects.all()
