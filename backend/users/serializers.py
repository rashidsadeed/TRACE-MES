from rest_framework import serializers
from django.contrib.auth import get_user_model

from .models import Role, Permission

User = get_user_model()


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)


class LogoutSerializer(serializers.Serializer):
    pass


# --- User Management Serializers ---

class RoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Role
        fields = ['id', 'name']


class UserSerializer(serializers.ModelSerializer):
    """Read serializer — used for list, retrieve, and the me endpoint."""
    role = RoleSerializer(many=True, read_only=True)

    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'email',
            'first_name',
            'last_name',
            'is_active',
            'created_at',
            'role',
        ]


class UserCreateSerializer(serializers.ModelSerializer):
    """Write serializer — used for user creation (POST /api/users/)."""
    password = serializers.CharField(write_only=True, min_length=8)
    # Accept a list of Role UUIDs; optional
    role = serializers.PrimaryKeyRelatedField(
        queryset=Role.objects.all(),
        many=True,
        required=False,
    )

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'password', 'first_name', 'last_name', 'role']

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError('A user with this email already exists.')
        return value

    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError('A user with this username already exists.')
        return value

    def create(self, validated_data):
        roles = validated_data.pop('role', [])
        password = validated_data.pop('password')
        user = User.objects.create_user(password=password, **validated_data)
        if roles:
            user.role.set(roles)
        return user


class UserUpdateSerializer(serializers.ModelSerializer):
    """Partial update serializer — used for PATCH /api/users/{id}/."""
    role = serializers.PrimaryKeyRelatedField(
        queryset=Role.objects.all(),
        many=True,
        required=False,
    )

    class Meta:
        model = User
        fields = ['first_name', 'last_name', 'email', 'role']
        # All fields are optional for PATCH; partial=True is set at the view level.

    def validate_email(self, value):
        # Allow the current user to keep their own email; reject if taken by another user.
        user = self.instance
        if User.objects.filter(email=value).exclude(pk=user.pk).exists():
            raise serializers.ValidationError('A user with this email already exists.')
        return value

    def update(self, instance, validated_data):
        roles = validated_data.pop('role', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if roles is not None:
            instance.role.set(roles)
        return instance


# --- Role & Permission Management Serializers ---

class PermissionSerializer(serializers.ModelSerializer):
    """Read-only serializer for system-defined permissions."""

    class Meta:
        model = Permission
        fields = ['id', 'code', 'description', 'module']
        read_only_fields = fields


class RoleDetailSerializer(serializers.ModelSerializer):
    """Read serializer for role retrieval — includes nested permissions."""
    permissions = PermissionSerializer(many=True, read_only=True)

    class Meta:
        model = Role
        fields = ['id', 'type', 'name', 'level', 'description', 'permissions']


class RoleCreateSerializer(serializers.ModelSerializer):
    """Write serializer for role creation (POST /api/roles/). Type is always 'custom'."""

    class Meta:
        model = Role
        fields = ['name', 'level', 'description']

    def create(self, validated_data):
        validated_data['type'] = 'custom'
        return super().create(validated_data)


class RoleUpdateSerializer(serializers.ModelSerializer):
    """Partial-update serializer for roles (PATCH /api/roles/{id}/)."""

    class Meta:
        model = Role
        fields = ['name', 'level', 'description']
