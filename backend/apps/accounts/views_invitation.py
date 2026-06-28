"""
Staff invitation & governance APIs.
Super Admin: platform-wide. Faculty Admin (Dean): scoped to their faculty.
"""
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.accounts.invitation_service import (
    ROLE_LABELS,
    accept_invitation,
    build_invite_url,
    build_invitation_response_message,
    create_and_send_invitation,
    reactivate_staff,
    remove_staff_assignment,
    resend_invitation,
    revoke_invitation,
    suspend_staff,
)
from apps.accounts.models import StaffInvitation, User, UserRole
from apps.accounts.scope import (
    get_faculty_admin_faculty_id,
    is_faculty_admin,
    is_super_admin,
)


def _require_super_admin_only(user) -> Response | None:
    if not is_super_admin(user):
        return Response({'error': 'Super Admin access required'}, status=status.HTTP_403_FORBIDDEN)
    return None


def _can_manage_invitations(user) -> bool:
    return is_super_admin(user) or is_faculty_admin(user)


def _require_invitation_access(user) -> Response | None:
    if not _can_manage_invitations(user):
        return Response({'error': 'You do not have permission to manage invitations'}, status=status.HTTP_403_FORBIDDEN)
    return None


def _invitation_in_scope(user, inv: StaffInvitation) -> bool:
    if is_super_admin(user):
        return True
    if is_faculty_admin(user):
        fid = get_faculty_admin_faculty_id(user)
        return bool(fid and inv.faculty_id == fid)
    return False


def _scoped_invitations_qs(user):
    qs = StaffInvitation.objects.select_related(
        'faculty', 'department', 'invited_by', 'user'
    ).order_by('-created_at')
    if is_faculty_admin(user) and not is_super_admin(user):
        fid = get_faculty_admin_faculty_id(user)
        if fid:
            qs = qs.filter(faculty_id=fid)
        else:
            qs = qs.none()
    return qs


def _serialize_invitation(inv: StaffInvitation) -> dict:
    return {
        'id': inv.id,
        'email': inv.email or None,
        'student_id': inv.student_id,
        'first_name': inv.first_name,
        'last_name': inv.last_name,
        'role': inv.role,
        'role_label': ROLE_LABELS.get(inv.role, inv.role),
        'faculty_id': inv.faculty_id,
        'faculty_name': inv.faculty.name if inv.faculty else None,
        'department_id': inv.department_id,
        'department_name': inv.department.name if inv.department else None,
        'status': inv.status,
        'delivery_status': inv.delivery_status,
        'delivery_error': inv.delivery_error or None,
        'send_count': inv.send_count,
        'invite_url': build_invite_url(inv.token) if inv.is_pending_acceptance else None,
        'token_preview': f'{inv.token[:8]}…' if inv.is_pending_acceptance else None,
        'created_at': inv.created_at.isoformat() if inv.created_at else None,
        'sent_at': inv.sent_at.isoformat() if inv.sent_at else None,
        'last_sent_at': inv.last_sent_at.isoformat() if inv.last_sent_at else None,
        'accepted_at': inv.accepted_at.isoformat() if inv.accepted_at else None,
        'expires_at': inv.expires_at.isoformat() if inv.expires_at else None,
        'is_expired': inv.is_expired,
        'user_id': inv.user_id,
        'invited_by_email': inv.invited_by.email if inv.invited_by else None,
    }


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def invitations_list_create(request):
    denied = _require_invitation_access(request.user)
    if denied:
        return denied

    if request.method == 'GET':
        qs = _scoped_invitations_qs(request.user)
        status_filter = request.GET.get('status', '').strip().upper()
        if status_filter:
            qs = qs.filter(status=status_filter)
        role_filter = request.GET.get('role', '').strip().upper()
        if role_filter:
            if role_filter == 'HOD':
                role_filter = UserRole.DEPARTMENT_ADMIN
            qs = qs.filter(role=role_filter)
        return Response({
            'results': [_serialize_invitation(i) for i in qs[:200]],
            'count': qs.count(),
        })

    data = request.data or {}
    faculty_id = data.get('faculty_id')
    if is_faculty_admin(request.user) and not is_super_admin(request.user):
        faculty_id = get_faculty_admin_faculty_id(request.user)

    try:
        inv = create_and_send_invitation(
            invited_by=request.user,
            email=data.get('email', ''),
            first_name=data.get('first_name', ''),
            last_name=data.get('last_name', ''),
            role=data.get('role', ''),
            faculty_id=faculty_id,
            department_id=data.get('department_id'),
            student_id=data.get('student_id'),
        )
        return Response({
            'message': build_invitation_response_message(inv),
            'email_sent': inv.delivery_status == StaffInvitation.DeliveryStatus.SENT,
            'delivery_status': inv.delivery_status,
            'delivery_error': inv.delivery_error or None,
            'invitation': _serialize_invitation(inv),
        }, status=status.HTTP_201_CREATED)
    except ValueError as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def invitation_resend(request, invitation_id):
    denied = _require_invitation_access(request.user)
    if denied:
        return denied
    inv = get_object_or_404(StaffInvitation, pk=invitation_id)
    if not _invitation_in_scope(request.user, inv):
        return Response({'error': 'Invitation is outside your scope'}, status=status.HTTP_403_FORBIDDEN)
    try:
        inv = resend_invitation(inv, request.user)
        return Response({
            'message': build_invitation_response_message(inv),
            'email_sent': inv.delivery_status == StaffInvitation.DeliveryStatus.SENT,
            'delivery_status': inv.delivery_status,
            'delivery_error': inv.delivery_error or None,
            'invitation': _serialize_invitation(inv),
        })
    except ValueError as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def invitation_revoke(request, invitation_id):
    denied = _require_invitation_access(request.user)
    if denied:
        return denied
    inv = get_object_or_404(StaffInvitation, pk=invitation_id)
    if not _invitation_in_scope(request.user, inv):
        return Response({'error': 'Invitation is outside your scope'}, status=status.HTTP_403_FORBIDDEN)
    try:
        inv = revoke_invitation(inv, request.user)
        return Response({'message': 'Invitation revoked', 'invitation': _serialize_invitation(inv)})
    except ValueError as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([AllowAny])
def invitation_verify(request):
    token = request.GET.get('token', '').strip()
    if not token:
        return Response({'error': 'token is required'}, status=status.HTTP_400_BAD_REQUEST)
    inv = StaffInvitation.objects.select_related('faculty', 'department').filter(token=token).first()
    if not inv:
        return Response({'error': 'Invalid invitation'}, status=status.HTTP_404_NOT_FOUND)
    return Response({
        'email': inv.email,
        'first_name': inv.first_name,
        'last_name': inv.last_name,
        'role': inv.role,
        'role_label': ROLE_LABELS.get(inv.role, inv.role),
        'student_id': inv.student_id,
        'faculty_name': inv.faculty.name if inv.faculty else None,
        'department_name': inv.department.name if inv.department else None,
        'status': inv.status,
        'is_expired': inv.is_expired,
        'expires_at': inv.expires_at.isoformat() if inv.expires_at else None,
        'can_accept': inv.is_pending_acceptance,
    })


@api_view(['POST'])
@permission_classes([AllowAny])
def invitation_accept(request):
    token = (request.data or {}).get('token', '').strip()
    password = (request.data or {}).get('password', '')
    confirm = (request.data or {}).get('password_confirm', '')
    if not token or not password:
        return Response({'error': 'token and password are required'}, status=status.HTTP_400_BAD_REQUEST)
    if password != confirm:
        return Response({'error': 'Passwords do not match'}, status=status.HTTP_400_BAD_REQUEST)
    if len(password) < 8:
        return Response({'error': 'Password must be at least 8 characters'}, status=status.HTTP_400_BAD_REQUEST)
    try:
        user = accept_invitation(token, password)
        return Response({
            'message': 'Account activated successfully. You can now sign in.',
            'email': user.email,
        })
    except ValueError as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def governance_suspend(request, user_id):
    denied = _require_super_admin_only(request.user)
    if denied:
        return denied
    target = get_object_or_404(User, pk=user_id)
    try:
        suspend_staff(target, request.user)
        return Response({'message': f'{target.email} suspended'})
    except ValueError as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def governance_reactivate(request, user_id):
    denied = _require_super_admin_only(request.user)
    if denied:
        return denied
    target = get_object_or_404(User, pk=user_id)
    try:
        reactivate_staff(target, request.user)
        return Response({'message': f'{target.email} reactivated'})
    except ValueError as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def governance_remove_assignment(request, user_id):
    denied = _require_super_admin_only(request.user)
    if denied:
        return denied
    target = get_object_or_404(User, pk=user_id)
    try:
        remove_staff_assignment(target, request.user)
        return Response({'message': f'Assignment removed for {target.email}'})
    except ValueError as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
