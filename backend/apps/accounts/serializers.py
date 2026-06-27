"""
Authentication Serializers
No public registration; login, first-login password change, forgot password.
"""
from rest_framework import serializers
from django.contrib.auth import authenticate
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from typing import Dict, Any, Optional
from .models import User, UserRole


def _validate_password_strength(value: str) -> None:
    """Reusable password strength validation."""
    if len(value) < 8:
        raise serializers.ValidationError('Password must be at least 8 characters long.')
    if not any(c.isdigit() for c in value):
        raise serializers.ValidationError('Password must contain at least one number.')
    if not any(c.isalpha() for c in value):
        raise serializers.ValidationError('Password must contain at least one letter.')


class UserLoginSerializer(serializers.Serializer):
    """
    Serializer for user login
    Supports dual authentication:
    - Students: Login with student_id
    - Admins/HOD/Examiners: Login with email
    """
    username = serializers.CharField(
        required=True,
        help_text='Student ID (for students) or Email (for admins/HOD/Examiners)'
    )
    password = serializers.CharField(
        required=True,
        write_only=True,
        style={'input_type': 'password'}
    )
    
    def validate_username(self, value: str) -> str:
        """Normalize username input"""
        if not value:
            raise serializers.ValidationError('Username (Student ID or Email) is required.')
        return value.strip()
    
    def validate_password(self, value: str) -> str:
        """Validate password is provided"""
        if not value:
            raise serializers.ValidationError('Password is required.')
        return value
    
    def validate(self, attrs: Dict[str, Any]) -> Dict[str, Any]:
        """Validate credentials and authenticate user"""
        import re
        
        username = attrs.get('username', '')
        password = attrs.get('password')
        
        if not username or not password:
            raise serializers.ValidationError(
                'Must include "username" (student_id or email) and "password".',
                code='missing_credentials'
            )
        
        # Normalize username: uppercase for student IDs, lowercase for emails
        student_id_pattern = r'^U\d{2}/[A-Z]{3}/[A-Z]{3}/\d{4}$'
        is_student_id = bool(re.match(student_id_pattern, username.upper()))
        
        if is_student_id:
            normalized_username = username.upper()  # Normalize student ID to uppercase
        else:
            normalized_username = username.lower()  # Normalize email to lowercase
        
        # Authenticate user
        user = authenticate(
            request=self.context.get('request'),
            username=normalized_username,
            password=password
        )
        
        if not user:
            # Generic error message to prevent user enumeration
            raise serializers.ValidationError(
                'Invalid credentials. Please check your Student ID/Email and password.',
                code='authentication_failed'
            )
        
        if not user.is_active:
            raise serializers.ValidationError(
                'Your account is disabled. Please contact support.',
                code='account_disabled'
            )
        
        attrs['user'] = user
        attrs['username'] = normalized_username  # Store normalized username
        return attrs


def _role_to_string(role) -> str:
    """Ensure role is JSON-serializable string (handles TextChoices enum)."""
    if role is None:
        return ''
    if isinstance(role, str):
        return role
    return getattr(role, 'value', None) or str(role)


class UserSerializer(serializers.ModelSerializer):
    """
    Serializer for user profile data (login response, profile).
    Role is serialized via SerializerMethodField so TextChoices enum never breaks JSON.
    """
    role = serializers.SerializerMethodField()
    full_name = serializers.SerializerMethodField()
    faculty_id = serializers.SerializerMethodField()
    faculty_name = serializers.SerializerMethodField()
    department_id = serializers.SerializerMethodField()
    department_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id',
            'student_id',
            'first_name',
            'last_name',
            'full_name',
            'email',
            'role',
            'department',
            'department_id',
            'department_name',
            'faculty_id',
            'faculty_name',
            'level',
            'phone_number',
            'profile_picture_key',
            'module_access',
            'email_verified',
            'is_first_login',
            'is_active',
            'is_staff',
            'date_joined',
            'last_login',
            'last_password_change',
        ]
        read_only_fields = [
            'id', 'student_id', 'first_name', 'last_name', 'full_name',
            'role', 'department', 'department_id', 'department_name',
            'faculty_id', 'faculty_name', 'level', 'module_access',
            'date_joined', 'last_login', 'last_password_change',
            'is_first_login', 'is_active', 'is_staff',
        ]

    def get_role(self, obj):
        if obj is None:
            return ''
        return _role_to_string(obj.role)

    def get_full_name(self, obj):
        if obj is None:
            return ''
        return obj.get_full_name()

    def get_faculty_id(self, obj):
        return obj.faculty_id if obj and obj.faculty_id else None

    def get_faculty_name(self, obj):
        if obj and obj.faculty:
            return obj.faculty.name
        return None

    def get_department_id(self, obj):
        return obj.department_fk_id if obj and obj.department_fk_id else None

    def get_department_name(self, obj):
        if obj and obj.department_fk:
            return obj.department_fk.name
        return obj.department if obj else None

    def to_representation(self, instance):
        """Handle None for optional FK (e.g. uploaded_by on Result)."""
        if instance is None:
            return None
        return super().to_representation(instance)


class StudentSettingsAccountSerializer(serializers.ModelSerializer):
    """Read-only account info for Student Settings (full name, reg_number, department, level)."""
    full_name = serializers.SerializerMethodField()
    reg_number = serializers.CharField(source='student_id', read_only=True)
    
    class Meta:
        model = User
        fields = ['full_name', 'reg_number', 'department', 'level']
        read_only_fields = ['full_name', 'reg_number', 'department', 'level']
    
    def get_full_name(self, obj):
        return obj.get_full_name()


class ChangePasswordSerializer(serializers.Serializer):
    """Authenticated password change (Settings). Requires current password; strong new password."""
    current_password = serializers.CharField(write_only=True, required=True)
    new_password = serializers.CharField(write_only=True, required=True, min_length=8)
    new_password_confirm = serializers.CharField(write_only=True, required=True)

    def validate_current_password(self, value: str) -> str:
        user = self.context.get('user')
        if not user or not user.check_password(value):
            raise serializers.ValidationError('Current password is incorrect.')
        return value

    def validate_new_password(self, value: str) -> str:
        _validate_password_strength(value)
        return value

    def validate(self, attrs: Dict[str, Any]) -> Dict[str, Any]:
        if attrs['new_password'] != attrs['new_password_confirm']:
            raise serializers.ValidationError({'new_password_confirm': 'Passwords do not match.'})
        return attrs


class UpdateEmailSerializer(serializers.Serializer):
    """Student can add or update email in Settings. Optional; future: verification token."""
    email = serializers.EmailField(required=True, allow_blank=False)

    def validate_email(self, value: str) -> str:
        value = (value or '').strip().lower()
        if not value:
            raise serializers.ValidationError('Enter a valid email address.')
        user = self.context.get('user')
        if user and User.objects.filter(email__iexact=value).exclude(pk=user.pk).exists():
            raise serializers.ValidationError('This email is already in use by another account.')
        return value


class FirstLoginChangePasswordSerializer(serializers.Serializer):
    """First-login mandatory password change."""
    current_password = serializers.CharField(write_only=True, required=True)
    new_password = serializers.CharField(write_only=True, required=True, min_length=8)
    new_password_confirm = serializers.CharField(write_only=True, required=True)

    def validate_current_password(self, value: str) -> str:
        user = self.context.get('user')
        if not user or not user.check_password(value):
            raise serializers.ValidationError('Current password is incorrect.')
        return value

    def validate_new_password(self, value: str) -> str:
        _validate_password_strength(value)
        return value

    def validate(self, attrs: Dict[str, Any]) -> Dict[str, Any]:
        if attrs['new_password'] != attrs['new_password_confirm']:
            raise serializers.ValidationError({'new_password_confirm': 'Passwords do not match.'})
        return attrs


class ForgotPasswordRequestSerializer(serializers.Serializer):
    """Forgot password: request reset by reg_number or email."""
    reg_number_or_email = serializers.CharField(required=True, allow_blank=False)

    def validate_reg_number_or_email(self, value: str) -> str:
        return value.strip() if value else ''


class ForgotPasswordConfirmSerializer(serializers.Serializer):
    """Forgot password: set new password with token."""
    uidb64 = serializers.CharField(required=True)
    token = serializers.CharField(required=True)
    new_password = serializers.CharField(write_only=True, required=True, min_length=8)
    new_password_confirm = serializers.CharField(write_only=True, required=True)

    def validate_new_password(self, value: str) -> str:
        _validate_password_strength(value)
        return value

    def validate(self, attrs: Dict[str, Any]) -> Dict[str, Any]:
        if attrs['new_password'] != attrs['new_password_confirm']:
            raise serializers.ValidationError({'new_password_confirm': 'Passwords do not match.'})
        try:
            uid = force_str(urlsafe_base64_decode(attrs['uidb64']))
            user = User.objects.get(pk=uid)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            raise serializers.ValidationError({'uidb64': 'Invalid or expired reset link.'})
        if not default_token_generator.check_token(user, attrs['token']):
            raise serializers.ValidationError({'token': 'Invalid or expired reset link.'})
        attrs['user'] = user
        return attrs
