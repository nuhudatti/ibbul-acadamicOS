"""
Audit logging for authentication and admin actions.
Production-grade accountability; used by views and backends.
"""
import logging
from typing import Optional, Any

from .models import AuditLog, User
from .scope import build_scope

logger = logging.getLogger(__name__)


def get_client_ip(request) -> Optional[str]:
    """Get client IP from request (X-Forwarded-For or REMOTE_ADDR)."""
    if not request:
        return None
    xff = request.META.get('HTTP_X_FORWARDED_FOR')
    if xff:
        return xff.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


def get_user_agent(request) -> str:
    """Get User-Agent from request."""
    if not request:
        return ''
    return (request.META.get('HTTP_USER_AGENT') or '')[:500]


def _get_request_scope(request):
    """Get request.scope from Django request or DRF wrapper (request._request)."""
    if not request:
        return None
    scope = getattr(request, 'scope', None)
    if scope is not None:
        return scope
    underlying = getattr(request, '_request', None)
    if underlying is not None:
        return getattr(underlying, 'scope', None)
    return None


def log_audit(
    action: str,
    request=None,
    user: Optional[User] = None,
    identifier: str = '',
    extra: Optional[dict] = None,
) -> Optional[AuditLog]:
    """
    Write an audit log entry with actor_role and scope information.
    action: AuditLog.Action value (e.g. AuditLog.Action.LOGIN_SUCCESS).
    Returns the created AuditLog instance, or None if creation failed.
    """
    try:
        # Ensure action is stored as string value (Django CharField with choices)
        action_str = getattr(action, 'value', action) if action else ''
        if not action_str:
            action_str = str(action)[:50] if action else ''
        choices_dict = dict(AuditLog.Action.choices)
        if action_str not in choices_dict:
            action_str = AuditLog.Action.ADMIN_ACTION.value if hasattr(AuditLog.Action.ADMIN_ACTION, 'value') else 'ADMIN_ACTION'

        ident = identifier or (user.get_username() if user else '') or ''
        scope_faculty = None
        scope_department = None
        actor_role = ''
        if user:
            role_val = getattr(user, 'role', '') or ''
            actor_role = getattr(role_val, 'value', role_val) if role_val else ''
            if isinstance(actor_role, str):
                actor_role = actor_role[:30] if actor_role else ''
            else:
                actor_role = str(actor_role)[:30] if actor_role else ''
            try:
                scope = _get_request_scope(request) or build_scope(user)
            except Exception:  # pragma: no cover - defensive
                scope = None
            if scope is not None:
                scope_faculty = getattr(scope, 'faculty', None) or getattr(scope, 'faculty_id', None)
                scope_department = getattr(scope, 'department', None) or getattr(scope, 'department_id', None)
            # Fallback: HOD/Department Admin and Faculty Admin must have scope so audit list shows them
            if scope_department is None and actor_role:
                role_upper = str(actor_role).upper()
                if role_upper in ('DEPARTMENT_ADMIN', 'HOD'):
                    scope_department = getattr(user, 'department_fk_id', None)
                elif role_upper == 'STUDENT':
                    scope_department = getattr(user, 'department_fk_id', None)
            if scope_faculty is None and actor_role and str(actor_role).upper() == 'FACULTY_ADMIN':
                scope_faculty = getattr(user, 'faculty_id', None)
        audit_entry = AuditLog.objects.create(
            user=user,
            action=action_str,
            actor_role=actor_role,
            identifier=ident[:255] if isinstance(ident, str) else str(ident)[:255],
            ip_address=get_client_ip(request),
            user_agent=get_user_agent(request),
            scope_faculty_id=scope_faculty if scope_faculty is not None else None,
            scope_department_id=scope_department if scope_department is not None else None,
            extra=extra or {},
        )
        return audit_entry
    except Exception as e:  # pragma: no cover - log but never break business flow
        logger.exception('Audit log write failed: %s', e)
        return None