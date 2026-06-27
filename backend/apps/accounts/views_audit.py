"""
Audit API views (Module 6 — Audit logs & immutability)
- Staff-only list endpoint with filters and pagination
- SUPER_ADMIN-only delete endpoint that archives logs into AuditLogDeletion and writes deletion AuditLog.
"""
from typing import List, Dict, Any
from django.db.models import Q, Count
from django.utils import timezone
from django.core.paginator import Paginator

from django.contrib.auth import get_user_model
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from .models import AuditLog, AuditLogDeletion, UserRole
from .audit import log_audit

User = get_user_model()


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def audit_list_view(request):
    """
    GET /api/accounts/audit/
    Staff-only. Returns paginated audit logs with filters.
    
    Query params:
    - page: page number (default 1)
    - page_size: items per page (default 50, max 200)
    - search: search in identifier, action, user email/student_id
    - action: filter by action type
    - role: filter by actor role (or 'system' for no user)
    - date_range: 'today', '7d', '30d'
    - date_from: ISO datetime string
    - date_to: ISO datetime string
    - ip: filter by IP address
    """
    user: User = request.user
    if not user.is_staff:
        return Response(
            {'detail': 'Only staff can access audit logs.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    qs = AuditLog.objects.all().select_related('user', 'scope_faculty', 'scope_department').order_by('-created_at')

    # Normalize role to value string (DB stores 'HOD'/'DEPARTMENT_ADMIN' etc.)
    user_role = getattr(user, 'role', None)
    role_str = (getattr(user_role, 'value', None) or str(user_role).upper() if user_role else '') or ''
    # Handle enum string like "UserRole.HOD" -> use value; already "HOD" stays
    if role_str and '.' in role_str:
        role_str = getattr(user_role, 'value', role_str) or role_str

    # HOD: department-scoped (same logic as admin audit view)
    if role_str in ('DEPARTMENT_ADMIN', 'HOD') and getattr(user, 'department_fk_id', None):
        dept_id = user.department_fk_id
        qs = qs.filter(
            Q(scope_department_id=dept_id)
            | Q(scope_department_id__isnull=True, user__department_fk_id=dept_id)
        )
    # Faculty Admin: faculty-scoped
    elif role_str == 'FACULTY_ADMIN' and getattr(user, 'faculty_id', None):
        fac_id = user.faculty_id
        qs = qs.filter(
            Q(scope_faculty_id=fac_id)
            | Q(scope_faculty_id__isnull=True, user__faculty_id=fac_id)
            | Q(scope_faculty_id__isnull=True, user__department_fk__faculty_id=fac_id)
        )

    # Search
    search = request.GET.get('search', '').strip()
    if search:
        qs = qs.filter(
            Q(identifier__icontains=search)
            | Q(action__icontains=search)
            | Q(user__email__icontains=search)
            | Q(user__student_id__icontains=search)
        )

    # Action filter
    action = request.GET.get('action', '').strip()
    if action and action in dict(AuditLog.Action.choices):
        qs = qs.filter(action=action)

    # Role filter
    role = request.GET.get('role', '').strip()
    if role == 'system':
        qs = qs.filter(user__isnull=True)
    elif role and role in dict(UserRole.choices):
        qs = qs.filter(user__role=role)

    # Date range
    date_range = request.GET.get('date_range', '').strip().lower()
    now = timezone.now()
    if date_range == 'today':
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        qs = qs.filter(created_at__gte=start)
    elif date_range == '7d':
        start = now - timezone.timedelta(days=7)
        qs = qs.filter(created_at__gte=start)
    elif date_range == '30d':
        start = now - timezone.timedelta(days=30)
        qs = qs.filter(created_at__gte=start)
    else:
        date_from = request.GET.get('date_from', '').strip()
        date_to = request.GET.get('date_to', '').strip()
        if date_from:
            try:
                from django.utils.dateparse import parse_datetime
                start = parse_datetime(date_from + ' 00:00:00') if len(date_from) <= 10 else parse_datetime(date_from)
                if start:
                    start = timezone.make_aware(start) if timezone.is_naive(start) else start
                    qs = qs.filter(created_at__gte=start)
            except Exception:
                pass
        if date_to:
            try:
                from django.utils.dateparse import parse_datetime
                end = parse_datetime(date_to + ' 23:59:59') if len(date_to) <= 10 else parse_datetime(date_to)
                if end:
                    end = timezone.make_aware(end) if timezone.is_naive(end) else end
                    qs = qs.filter(created_at__lte=end)
            except Exception:
                pass

    # IP filter
    ip = request.GET.get('ip', '').strip()
    if ip:
        qs = qs.filter(ip_address=ip)

    # Pagination
    try:
        page_size = min(200, max(1, int(request.GET.get('page_size', 50))))
    except (TypeError, ValueError):
        page_size = 50
    try:
        page_number = max(1, int(request.GET.get('page', 1)))
    except (TypeError, ValueError):
        page_number = 1

    paginator = Paginator(qs, page_size)
    page = paginator.get_page(page_number)

    # Stats: use same scoped base as list (HOD = department, Faculty Admin = faculty, Super Admin = all)
    base_qs = AuditLog.objects.all().select_related('user').order_by('-created_at')
    if role_str in ('DEPARTMENT_ADMIN', 'HOD') and getattr(user, 'department_fk_id', None):
        dept_id = user.department_fk_id
        base_qs = base_qs.filter(
            Q(scope_department_id=dept_id)
            | Q(scope_department_id__isnull=True, user__department_fk_id=dept_id)
        )
    elif role_str == 'FACULTY_ADMIN' and getattr(user, 'faculty_id', None):
        fac_id = user.faculty_id
        base_qs = base_qs.filter(
            Q(scope_faculty_id=fac_id)
            | Q(scope_faculty_id__isnull=True, user__faculty_id=fac_id)
            | Q(scope_faculty_id__isnull=True, user__department_fk__faculty_id=fac_id)
        )
    stats = {
        'total': base_qs.count(),
        'last_24h': base_qs.filter(created_at__gte=now - timezone.timedelta(hours=24)).count(),
        'last_7d': base_qs.filter(created_at__gte=now - timezone.timedelta(days=7)).count(),
    }

    # Serialize
    logs = []
    for log in page:
        def _action_display(l):
            try:
                return l.get_action_display()
            except Exception:
                return l.action or ''

        def _role_str(r):
            if r is None:
                return ''
            if isinstance(r, str):
                return r
            return getattr(r, 'value', None) or str(r)

        logs.append({
            'id': log.id,
            'action': log.action,
            'action_display': _action_display(log),
            'user': {
                'id': log.user.id,
                'email': log.user.email,
                'student_id': log.user.student_id,
                'first_name': log.user.first_name,
                'last_name': log.user.last_name,
                'role': _role_str(log.user.role),
            } if log.user else None,
            'actor_role': log.actor_role,
            'identifier': log.identifier,
            'ip_address': log.ip_address,
            'user_agent': log.user_agent,
            'scope_faculty': log.scope_faculty.name if log.scope_faculty else None,
            'scope_department': log.scope_department.name if log.scope_department else None,
            'extra': log.extra,
            'created_at': log.created_at.isoformat(),
        })

    return Response({
        'count': paginator.count,
        'page': page_number,
        'page_size': page_size,
        'num_pages': paginator.num_pages,
        'results': logs,
        'stats': stats,
        'action_choices': [{'value': k, 'label': v} for k, v in AuditLog.Action.choices],
        'role_choices': [{'value': '', 'label': 'All'}, {'value': 'system', 'label': 'System'}] + [
            {'value': k, 'label': v} for k, v in UserRole.choices
        ],
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def audit_delete_view(request):
    """
    POST /api/audit/delete/
    SUPER_ADMIN only.

    Body:
    {
      "ids": [1, 2, 3]
    }
    """
    user: User = request.user
    if user.role != UserRole.SUPER_ADMIN and not user.is_superuser:
        return Response(
            {'detail': 'Only SUPER_ADMIN can delete audit logs.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    ids = request.data.get('ids') or []
    if not isinstance(ids, list) or not all(isinstance(i, int) for i in ids):
        return Response(
            {'detail': 'ids must be a list of integers.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    ids: List[int] = list(set(ids))
    if not ids:
        return Response(
            {'detail': 'No ids provided.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    logs = list(AuditLog.objects.filter(id__in=ids))
    archived_ids: List[int] = []
    for log in logs:
        AuditLogDeletion.objects.create(
            original_id=log.id,
            user_id=log.user_id,
            action=log.action,
            identifier=log.identifier,
            actor_role=log.actor_role,
            ip_address=log.ip_address,
            user_agent=log.user_agent,
            scope_faculty_id=log.scope_faculty_id,
            scope_department_id=log.scope_department_id,
            extra=log.extra,
        )
        archived_ids.append(log.id)
        log.delete()

    if archived_ids:
        log_audit(
            AuditLog.Action.AUDIT_LOG_DELETED,
            request=request,
            user=user,
            identifier=','.join(str(i) for i in archived_ids[:50]),
            extra={
                'deleted_ids': archived_ids,
                'count': len(archived_ids),
            },
        )

    return Response(
        {'message': 'Audit logs deleted (archived).', 'deleted_count': len(archived_ids)},
        status=status.HTTP_200_OK,
    )

