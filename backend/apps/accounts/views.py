"""
Authentication Views – Production-ready, no public registration.
Login, first-login password change, forgot password, profile.
All actions audited.
"""
import logging
from django.conf import settings
from django.core.cache import cache
from django.utils import timezone
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from django.contrib.auth.tokens import default_token_generator
from rest_framework import status, generics
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import User, AuditLog
from .serializers import (
    UserLoginSerializer,
    UserSerializer,
    FirstLoginChangePasswordSerializer,
    ForgotPasswordRequestSerializer,
    ForgotPasswordConfirmSerializer,
    ChangePasswordSerializer,
    UpdateEmailSerializer,
    StudentSettingsAccountSerializer,
)
from .audit import log_audit

logger = logging.getLogger(__name__)


def _user_to_login_response(user: User) -> dict:
    """Build user dict for login response; safe for students with null email/datetimes."""
    def _dt(d):
        if d is None:
            return None
        try:
            return d.isoformat() if hasattr(d, 'isoformat') else str(d)
        except Exception:
            return None

    def _role_str(r):
        if r is None:
            return 'STUDENT'
        if isinstance(r, str):
            return r
        return getattr(r, 'value', None) or str(r)

    faculty = getattr(user, 'faculty', None)
    department_fk = getattr(user, 'department_fk', None)

    return {
        'id': user.id,
        'student_id': getattr(user, 'student_id', None) or None,
        'first_name': getattr(user, 'first_name', '') or '',
        'last_name': getattr(user, 'last_name', '') or '',
        'full_name': user.get_full_name(),
        'email': getattr(user, 'email', None) or None,
        'role': _role_str(getattr(user, 'role', None)),
        'department': getattr(user, 'department', '') or '',
        'department_id': department_fk.id if department_fk else None,
        'department_name': department_fk.name if department_fk else (getattr(user, 'department', '') or ''),
        'faculty_id': faculty.id if faculty else None,
        'faculty_name': faculty.name if faculty else None,
        'level': getattr(user, 'level', '') or '',
        'phone_number': getattr(user, 'phone_number', '') or '',
        'profile_picture_key': getattr(user, 'profile_picture_key', '') or '',
        'module_access': getattr(user, 'module_access', []) or [],
        'email_verified': getattr(user, 'email_verified', False) or False,
        'is_first_login': getattr(user, 'is_first_login', True),
        'is_active': getattr(user, 'is_active', True),
        'is_staff': getattr(user, 'is_staff', False),
        'date_joined': _dt(getattr(user, 'date_joined', None)),
        'last_login': _dt(getattr(user, 'last_login', None)),
        'last_password_change': _dt(getattr(user, 'last_password_change', None)),
    }


@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request) -> Response:
    """
    Login with reg_number (Student ID or staff email) and password.
    Returns user + tokens; frontend must redirect to change-password if is_first_login.
    """
    try:
        serializer = UserLoginSerializer(data=request.data, context={'request': request})

        if not serializer.is_valid():
            identifier = (request.data.get('username') or '').strip()
            log_audit(
                AuditLog.Action.LOGIN_FAILED,
                request=request,
                user=None,
                identifier=identifier[:255],
            )
            return Response(
                {'errors': serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = serializer.validated_data['user']

        # Module 7: Regenerate session on login for security (prevents session fixation)
        if hasattr(request, 'session'):
            request.session.cycle_key()

        # Update last_login so User management and dashboards show accurate data
        user.last_login = timezone.now()
        user.save(update_fields=['last_login'])

        from rest_framework_simplejwt.tokens import RefreshToken
        refresh = RefreshToken.for_user(user)
        tokens = {
            'access': str(refresh.access_token),
            'refresh': str(refresh),
        }

        user_data = _user_to_login_response(user)

        try:
            log_audit(
                AuditLog.Action.LOGIN_SUCCESS,
                request=request,
                user=user,
            )
        except Exception as audit_err:
            logger.warning('Audit log on login failed: %s', audit_err)

        return Response(
            {
                'message': 'Login successful',
                'user': user_data,
                'tokens': tokens,
            },
            status=status.HTTP_200_OK,
        )
    except Exception as e:
        logger.exception('Login view error: %s', e)
        err_msg = 'Login failed. Please try again or contact support.'
        if getattr(settings, 'DEBUG', False):
            err_msg = f'{err_msg} ({type(e).__name__}: {str(e)})'
        return Response(
            {'error': err_msg},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def first_login_change_password_view(request) -> Response:
    """
    First-login mandatory password change.
    Requires is_first_login=True; on success sets is_first_login=False.
    """
    user = request.user
    if not getattr(user, 'is_first_login', True):
        return Response(
            {'error': 'This endpoint is only for first-login password change.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    serializer = FirstLoginChangePasswordSerializer(
        data=request.data,
        context={'user': user, 'request': request},
    )
    if not serializer.is_valid():
        return Response(
            {'errors': serializer.errors},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user.set_password(serializer.validated_data['new_password'])
    user.is_first_login = False
    user.last_password_change = timezone.now()
    user.save(update_fields=['password', 'is_first_login', 'last_password_change'])

    # Module 7: Regenerate session on password change (prevents session hijacking)
    if hasattr(request, 'session'):
        request.session.cycle_key()

    log_audit(
        AuditLog.Action.FIRST_LOGIN_PASSWORD_CHANGE,
        request=request,
        user=user,
    )

    return Response(
        {'message': 'Password changed successfully. You can now access the dashboard.'},
        status=status.HTTP_200_OK,
    )


@api_view(['POST'])
@permission_classes([AllowAny])
def forgot_password_request_view(request) -> Response:
    """
    Forgot password: submit reg_number or email.
    If user exists, sends reset link by email (or returns reset link in dev if email not configured).
    Never reveals whether the account exists.
    Module 7: Rate-limited to prevent abuse (5 requests per 15 minutes per identifier).
    """
    # Module 7: Rate limiting for forgot-password (prevent abuse)
    identifier = (request.data.get('reg_number_or_email') or '').strip()[:255]
    if identifier:
        cache_key = f'forgot_password_attempts_{identifier.lower()}'
        attempts = cache.get(cache_key, 0)
        MAX_FORGOT_PASSWORD_ATTEMPTS = 5
        FORGOT_PASSWORD_LOCKOUT_TIME = 900  # 15 minutes
        if attempts >= MAX_FORGOT_PASSWORD_ATTEMPTS:
            logger.warning(f'Forgot-password rate limit exceeded for: {identifier}')
            return Response(
                {'error': 'Too many password reset requests. Please try again later.'},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        cache.set(cache_key, attempts + 1, FORGOT_PASSWORD_LOCKOUT_TIME)

    serializer = ForgotPasswordRequestSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(
            {'errors': serializer.errors},
            status=status.HTTP_400_BAD_REQUEST,
        )

    value = serializer.validated_data['reg_number_or_email'].strip()
    user = None

    from common.validators.student_id_validator import is_valid_student_id_format
    if is_valid_student_id_format(value):
        try:
            user = User.objects.get(student_id__iexact=value.upper(), role='STUDENT')
        except User.DoesNotExist:
            pass
    else:
        try:
            user = User.objects.get(email__iexact=value.lower())
        except User.DoesNotExist:
            pass

    log_audit(
        AuditLog.Action.PASSWORD_RESET_REQUEST,
        request=request,
        user=user,
        identifier=value[:255],
    )

    has_sendable_email = (
        user
        and user.is_active
        and getattr(user, 'email', None)
        and '@placeholder.ibbul.edu.ng' not in (user.email or '')
    )
    if has_sendable_email:
        token = default_token_generator.make_token(user)
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        reset_link = f"{getattr(settings, 'FRONTEND_BASE_URL', 'http://localhost:3000')}/reset-password?uid={uid}&token={token}"
        from apps.accounts.email_service import send_password_reset_email
        send_password_reset_email(user=user, reset_url=reset_link)
    # Same message for everyone (no user enumeration); hint for no-email case
    return Response(
        {
            'message': (
                'If an account exists with that registration number or email and has a verified email on file, '
                'you will receive a password reset link shortly. '
                'If you do not have an email on file, please contact the administrator to reset your password.'
            ),
        },
        status=status.HTTP_200_OK,
    )


@api_view(['POST'])
@permission_classes([AllowAny])
def forgot_password_confirm_view(request) -> Response:
    """Forgot password: set new password using token and uid from email link."""
    serializer = ForgotPasswordConfirmSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(
            {'errors': serializer.errors},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = serializer.validated_data['user']
    user.set_password(serializer.validated_data['new_password'])
    user.last_password_change = timezone.now()
    user.save(update_fields=['password', 'last_password_change'])

    # Module 7: Regenerate session on password reset (prevents session hijacking)
    if hasattr(request, 'session'):
        request.session.cycle_key()

    log_audit(
        AuditLog.Action.PASSWORD_RESET_CONFIRM,
        request=request,
        user=user,
    )

    return Response(
        {'message': 'Password reset successful. You can now sign in with your new password.'},
        status=status.HTTP_200_OK,
    )


class UserProfileView(generics.RetrieveUpdateAPIView):
    """GET/PATCH /api/accounts/profile/ – current user profile. Students can PATCH email only."""
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return self.request.user

    def perform_update(self, serializer):
        user = self.get_object()
        # Only allow updating email (students); account info is read-only
        new_email = serializer.validated_data.get('email')
        if new_email is not None:
            user.email = new_email or None
            user.email_verified = False
            user.save(update_fields=['email', 'email_verified'])
            log_audit(
                AuditLog.Action.EMAIL_UPDATED,
                request=self.request,
                user=user,
                extra={'email': (user.email or '')[:100]},
            )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def student_settings_view(request) -> Response:
    """
    Student Settings: read-only account info + security info (last login, last password change, status).
    Returns data for Account card and Security section.
    """
    user = request.user
    account = StudentSettingsAccountSerializer(user).data
    security = {
        'last_login': user.last_login.isoformat() if user.last_login else None,
        'last_password_change': user.last_password_change.isoformat() if getattr(user, 'last_password_change', None) else None,
        'is_active': user.is_active,
    }
    profile = UserSerializer(user).data
    return Response({
        'account': account,
        'security': security,
        'profile': profile,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_password_view(request) -> Response:
    """
    Authenticated password change (Settings). Not for first-login; use first-login endpoint for that.
    Updates password hash and last_password_change; invalidate-other-sessions is optional (JWT: client can clear tokens).
    """
    user = request.user
    if getattr(user, 'is_first_login', False):
        return Response(
            {'error': 'Use the first-login change-password endpoint to set your password.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    serializer = ChangePasswordSerializer(
        data=request.data,
        context={'user': user, 'request': request},
    )
    if not serializer.is_valid():
        return Response(
            {'errors': serializer.errors},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user.set_password(serializer.validated_data['new_password'])
    user.last_password_change = timezone.now()
    user.save(update_fields=['password', 'last_password_change'])

    # Module 7: Regenerate session on password change (prevents session hijacking)
    if hasattr(request, 'session'):
        request.session.cycle_key()

    log_audit(
        AuditLog.Action.PASSWORD_CHANGE,
        request=request,
        user=user,
    )

    return Response(
        {'message': 'Password changed successfully. For security, you may be signed out on other devices.'},
        status=status.HTTP_200_OK,
    )


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def update_email_view(request) -> Response:
    """Student (or user) can add or update email in Settings. Email is optional; not required for login."""
    user = request.user
    serializer = UpdateEmailSerializer(
        data=request.data,
        context={'user': user, 'request': request},
        partial=True,
    )
    if not serializer.is_valid():
        return Response(
            {'errors': serializer.errors},
            status=status.HTTP_400_BAD_REQUEST,
        )
    new_email = serializer.validated_data.get('email')
    if new_email:
        user.email = new_email
        user.email_verified = False  # Future: send verification token
        user.save(update_fields=['email', 'email_verified'])
        log_audit(
            AuditLog.Action.EMAIL_UPDATED,
            request=request,
            user=user,
            extra={'email': new_email[:100]},
        )
    return Response(
        {'message': 'Email updated.', 'email': user.email},
        status=status.HTTP_200_OK,
    )


@api_view(['GET'])
@permission_classes([AllowAny])
def root_view(request) -> Response:
    return Response({
        'message': 'IBBUL Result Checker API',
        'version': '2.0.0',
        'endpoints': {
            'admin': '/admin/',
            'accounts': {
                'login': '/api/accounts/login/',
                'profile': '/api/accounts/profile/',
                'first_login_change_password': '/api/accounts/first-login/change-password/',
                'forgot_password': '/api/accounts/forgot-password/',
                'forgot_password_confirm': '/api/accounts/forgot-password/confirm/',
                'token_refresh': '/api/accounts/token/refresh/',
            },
        },
    })


@api_view(['GET'])
@permission_classes([AllowAny])
def api_root_view(request) -> Response:
    return Response({
        'message': 'IBBUL Result Checker API',
        'version': '2.0.0',
        'endpoints': {
            'accounts': {
                'login': '/api/accounts/login/',
                'profile': '/api/accounts/profile/',
                'first_login_change_password': '/api/accounts/first-login/change-password/',
                'forgot_password': '/api/accounts/forgot-password/',
                'forgot_password_confirm': '/api/accounts/forgot-password/confirm/',
                'token_refresh': '/api/accounts/token/refresh/',
            },
            'academics': {
                'courses': '/api/academics/courses/',
                'results': '/api/academics/results/',
                'results_upload_csv': '/api/academics/results/upload_csv/',
                'results_manual_entry': '/api/academics/results/manual_entry/',
                'results_summary': '/api/academics/results/summary/',
                'gpa': '/api/academics/gpa/',
                'students': '/api/academics/students/',
                'check_permissions': '/api/academics/check-permissions/',
            },
        },
    })
