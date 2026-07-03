"""
HOD Department Management — scoped lecturers, students, invitations.
"""
import csv
import io

from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.invitation_service import (
    ROLE_LABELS,
    build_invite_url,
    build_invitation_response_message,
    create_and_send_invitation,
    resend_invitation,
    revoke_invitation,
    suspend_staff,
    reactivate_staff,
)
from apps.accounts.models import StaffInvitation, User, UserRole
from apps.accounts.scope import get_hod_department_id, is_hod, is_super_admin
from apps.academics.models import CourseAssignment, Result
from common.validators.student_id_validator import sanitize_student_id


def _require_hod(user) -> Response | None:
    if not is_hod(user) and not is_super_admin(user):
        return Response({'error': 'Department Admin access required'}, status=status.HTTP_403_FORBIDDEN)
    if is_hod(user) and not is_super_admin(user) and get_hod_department_id(user) is None:
        return Response({'error': 'Your account is not linked to a department'}, status=status.HTTP_403_FORBIDDEN)
    return None


def _hod_department_id(user) -> int | None:
    if is_super_admin(user):
        return None
    return get_hod_department_id(user)


def _invitation_qs(user):
    qs = StaffInvitation.objects.select_related('faculty', 'department', 'invited_by', 'user')
    dept_id = _hod_department_id(user)
    if dept_id is not None:
        qs = qs.filter(department_id=dept_id)
    return qs.order_by('-created_at')


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
        'created_at': inv.created_at.isoformat() if inv.created_at else None,
        'sent_at': inv.sent_at.isoformat() if inv.sent_at else None,
        'last_sent_at': inv.last_sent_at.isoformat() if inv.last_sent_at else None,
        'accepted_at': inv.accepted_at.isoformat() if inv.accepted_at else None,
        'expires_at': inv.expires_at.isoformat() if inv.expires_at else None,
        'is_expired': inv.is_expired,
        'user_id': inv.user_id,
        'invited_by_email': inv.invited_by.email if inv.invited_by else None,
    }


def _assert_invitation_in_scope(user, inv: StaffInvitation) -> Response | None:
    dept_id = _hod_department_id(user)
    if dept_id is not None and inv.department_id != dept_id:
        return Response({'error': 'Invitation not in your department scope'}, status=status.HTTP_404_NOT_FOUND)
    return None


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def department_overview(request):
    denied = _require_hod(request.user)
    if denied:
        return denied

    dept_id = _hod_department_id(request.user)
    user = request.user

    lecturer_qs = User.objects.filter(role=UserRole.EXAMINER, is_active=True)
    student_qs = User.objects.filter(role=UserRole.STUDENT, is_active=True)
    invite_qs = StaffInvitation.objects.all()

    if dept_id is not None:
        lecturer_qs = lecturer_qs.filter(department_fk_id=dept_id)
        student_qs = student_qs.filter(department_fk_id=dept_id)
        invite_qs = invite_qs.filter(department_id=dept_id)

    pending_invites = invite_qs.filter(
        status__in=(StaffInvitation.Status.PENDING, StaffInvitation.Status.SENT),
        expires_at__gt=timezone.now(),
    ).count()

    dept = None
    if dept_id:
        from apps.academics.models import Department
        dept = Department.objects.select_related('faculty').filter(pk=dept_id).first()

    return Response({
        'department_id': dept_id,
        'department_name': dept.name if dept else user.department,
        'faculty_id': dept.faculty_id if dept else getattr(user, 'faculty_id', None),
        'faculty_name': dept.faculty.name if dept and dept.faculty else None,
        'counts': {
            'lecturers': lecturer_qs.count(),
            'students': student_qs.count(),
            'pending_invitations': pending_invites,
            'active_lecturers': lecturer_qs.filter(is_active=True).count(),
        },
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def department_lecturers(request):
    denied = _require_hod(request.user)
    if denied:
        return denied

    dept_id = _hod_department_id(request.user)
    qs = User.objects.filter(role=UserRole.EXAMINER).select_related('department_fk')
    if dept_id is not None:
        qs = qs.filter(department_fk_id=dept_id)

    search = (request.GET.get('search') or '').strip()
    if search:
        qs = qs.filter(
            Q(first_name__icontains=search)
            | Q(last_name__icontains=search)
            | Q(email__icontains=search)
        )

    results = []
    for u in qs.order_by('last_name', 'first_name')[:300]:
        courses = CourseAssignment.objects.filter(examiner=u).select_related('course')
        results.append({
            'id': u.id,
            'email': u.email,
            'first_name': u.first_name,
            'last_name': u.last_name,
            'full_name': u.get_full_name(),
            'is_active': u.is_active,
            'last_login': u.last_login.isoformat() if u.last_login else None,
            'assigned_courses': [
                {'id': ca.course.id, 'code': ca.course.code, 'title': ca.course.title}
                for ca in courses
            ],
            'status': 'active' if u.is_active else 'inactive',
            'pending': not u.is_active,
        })

    return Response({'results': results, 'count': len(results)})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def department_students(request):
    denied = _require_hod(request.user)
    if denied:
        return denied

    dept_id = _hod_department_id(request.user)
    qs = User.objects.filter(role=UserRole.STUDENT).select_related('department_fk')
    if dept_id is not None:
        qs = qs.filter(department_fk_id=dept_id)

    search = (request.GET.get('search') or '').strip()
    if search:
        qs = qs.filter(
            Q(student_id__icontains=search.upper())
            | Q(first_name__icontains=search)
            | Q(last_name__icontains=search)
            | Q(email__icontains=search)
        )

    results = []
    for u in qs.order_by('student_id')[:500]:
        results.append({
            'id': u.id,
            'student_id': u.student_id,
            'email': u.email,
            'first_name': u.first_name,
            'last_name': u.last_name,
            'full_name': u.get_full_name(),
            'department_name': u.department or (u.department_fk.name if u.department_fk else ''),
            'is_active': u.is_active,
            'last_login': u.last_login.isoformat() if u.last_login else None,
            'status': 'active' if u.is_active else 'pending',
            'pending_activation': not u.is_active,
        })

    return Response({'results': results, 'count': len(results)})


def _assert_student_in_scope(user, target: User):
    dept_id = _hod_department_id(user)
    if is_super_admin(user):
        return None
    if not dept_id or target.department_fk_id != dept_id:
        return Response({'error': 'Student is not in your department.'}, status=status.HTTP_403_FORBIDDEN)
    if target.role != UserRole.STUDENT:
        return Response({'error': 'Not a student account.'}, status=status.HTTP_400_BAD_REQUEST)
    return None


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def department_student_deactivate(request, pk):
    """Deactivate a student (stop access). Results remain on file."""
    denied = _require_hod(request.user)
    if denied:
        return denied
    target = get_object_or_404(User, pk=pk, role=UserRole.STUDENT)
    scope_err = _assert_student_in_scope(request.user, target)
    if scope_err:
        return scope_err
    suspend_staff(target, request.user)
    return Response({
        'message': f'{target.student_id} deactivated. Results stay saved — they will see them after reactivation.',
        'is_active': False,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def department_student_reactivate(request, pk):
    """Reactivate a deactivated student."""
    denied = _require_hod(request.user)
    if denied:
        return denied
    target = get_object_or_404(User, pk=pk, role=UserRole.STUDENT)
    scope_err = _assert_student_in_scope(request.user, target)
    if scope_err:
        return scope_err
    reactivate_staff(target, request.user)
    return Response({
        'message': f'{target.student_id} reactivated.',
        'is_active': True,
    })


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def department_student_delete(request, pk):
    """Remove a student with no saved results. Otherwise deactivate only."""
    denied = _require_hod(request.user)
    if denied:
        return denied
    target = get_object_or_404(User, pk=pk, role=UserRole.STUDENT)
    scope_err = _assert_student_in_scope(request.user, target)
    if scope_err:
        return scope_err
    if Result.objects.filter(student=target, is_deleted=False).exists():
        return Response(
            {
                'error': (
                    'This student has results on file and cannot be deleted. '
                    'Use Deactivate to block login instead.'
                ),
            },
            status=status.HTTP_400_BAD_REQUEST,
        )
    matric = target.student_id
    target.delete()
    return Response({'message': f'Student {matric} removed from the system.'})


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def department_invitations(request):
    denied = _require_hod(request.user)
    if denied:
        return denied

    user = request.user
    dept_id = _hod_department_id(user)

    if request.method == 'GET':
        qs = _invitation_qs(user)
        status_filter = (request.GET.get('status') or '').strip().upper()
        role_filter = (request.GET.get('role') or '').strip().upper()
        if status_filter:
            qs = qs.filter(status=status_filter)
        if role_filter:
            qs = qs.filter(role=role_filter)
        items = [_serialize_invitation(i) for i in qs[:200]]
        return Response({'results': items, 'count': qs.count()})

    data = request.data or {}
    role = (data.get('role') or '').upper()
    if role not in (UserRole.EXAMINER, UserRole.STUDENT):
        return Response({'error': 'HOD can only invite EXAMINER or STUDENT roles'}, status=400)

    target_dept = dept_id or data.get('department_id')
    if not target_dept:
        return Response({'error': 'department_id is required'}, status=400)

    try:
        inv = create_and_send_invitation(
            invited_by=user,
            email=data.get('email', ''),
            first_name=data.get('first_name', ''),
            last_name=data.get('last_name', ''),
            role=role,
            faculty_id=data.get('faculty_id'),
            department_id=int(target_dept),
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
def department_invitation_resend(request, invitation_id):
    denied = _require_hod(request.user)
    if denied:
        return denied
    inv = get_object_or_404(StaffInvitation, pk=invitation_id)
    scope_err = _assert_invitation_in_scope(request.user, inv)
    if scope_err:
        return scope_err
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
def department_invitation_revoke(request, invitation_id):
    denied = _require_hod(request.user)
    if denied:
        return denied
    inv = get_object_or_404(StaffInvitation, pk=invitation_id)
    scope_err = _assert_invitation_in_scope(request.user, inv)
    if scope_err:
        return scope_err
    try:
        inv = revoke_invitation(inv, request.user)
        return Response({'message': 'Invitation revoked', 'invitation': _serialize_invitation(inv)})
    except ValueError as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def department_invitations_export(request):
    """Download CSV of pending student invitations with individual secure links."""
    denied = _require_hod(request.user)
    if denied:
        return denied

    qs = _invitation_qs(request.user).filter(role=UserRole.STUDENT)
    scope = (request.GET.get('scope') or 'pending').strip().lower()
    if scope == 'pending':
        qs = qs.filter(
            status__in=(StaffInvitation.Status.PENDING, StaffInvitation.Status.SENT),
            expires_at__gt=timezone.now(),
        )
    elif scope == 'all':
        pass
    else:
        qs = qs.filter(status=scope.upper())

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        'first_name', 'last_name', 'email', 'student_id', 'status',
        'delivery_status', 'invite_url', 'expires_at', 'delivery_error',
    ])
    for inv in qs.iterator():
        writer.writerow([
            inv.first_name,
            inv.last_name,
            inv.email or '',
            inv.student_id or '',
            inv.status,
            inv.delivery_status or '',
            build_invite_url(inv.token) if inv.is_pending_acceptance else '',
            inv.expires_at.isoformat() if inv.expires_at else '',
            inv.delivery_error or '',
        ])

    from django.http import HttpResponse
    resp = HttpResponse(buf.getvalue(), content_type='text/csv; charset=utf-8')
    resp['Content-Disposition'] = 'attachment; filename="student_invitations_pending.csv"'
    return resp


def _bulk_invite_row_error(row_num, *, error, first_name='', last_name='', email='', student_id='', raw_student_id=''):
    return {
        'row': row_num,
        'error': error,
        'first_name': first_name,
        'last_name': last_name,
        'email': email,
        'student_id': student_id,
        'raw_student_id': raw_student_id or student_id,
    }


def _process_bulk_invite_rows(rows, *, invited_by, dept_id: int):
    """
    Process student invitation rows one-by-one with synchronous SendGrid delivery.
    Returns email_sent, email_failed (invite saved, email not delivered), and errors (not invited).
    """
    import time

    email_sent = []
    email_failed = []
    errors = []
    seen_emails: set[str] = set()
    seen_matrics: set[str] = set()

    for item in rows:
        i = int(item.get('row') or 0)
        first_name = (item.get('first_name') or '').strip()
        last_name = (item.get('last_name') or '').strip()
        email = (item.get('email') or '').strip().lower()
        raw_student_id = (item.get('student_id') or item.get('raw_student_id') or '').strip()
        student_id = sanitize_student_id(raw_student_id) if raw_student_id else ''

        if not first_name or not last_name or not email or not student_id:
            errors.append(_bulk_invite_row_error(
                i,
                error='Missing required field — need first_name, last_name, email, and student_id',
                first_name=first_name,
                last_name=last_name,
                email=email,
                student_id=student_id,
                raw_student_id=raw_student_id,
            ))
            continue

        if email in seen_emails:
            errors.append(_bulk_invite_row_error(
                i,
                error='Duplicate email in this upload — skipped',
                first_name=first_name,
                last_name=last_name,
                email=email,
                student_id=student_id,
                raw_student_id=raw_student_id,
            ))
            continue
        if student_id in seen_matrics:
            errors.append(_bulk_invite_row_error(
                i,
                error='Duplicate matric number in this upload — skipped',
                first_name=first_name,
                last_name=last_name,
                email=email,
                student_id=student_id,
                raw_student_id=raw_student_id,
            ))
            continue
        seen_emails.add(email)
        seen_matrics.add(student_id)

        try:
            inv = create_and_send_invitation(
                invited_by=invited_by,
                email=email,
                first_name=first_name,
                last_name=last_name,
                role=UserRole.STUDENT,
                department_id=int(dept_id),
                student_id=student_id,
                deliver_email_sync=True,
            )
            entry = {
                'row': i,
                'first_name': first_name,
                'last_name': last_name,
                'student_id': inv.student_id,
                'email': inv.email,
                'invite_url': build_invite_url(inv.token),
                'delivery_status': inv.delivery_status,
                'delivery_error': inv.delivery_error or None,
                'email_sent': inv.delivery_status == StaffInvitation.DeliveryStatus.SENT,
            }
            if raw_student_id and raw_student_id.strip().upper() != inv.student_id:
                entry['normalized_from'] = raw_student_id.strip()

            if inv.delivery_status == StaffInvitation.DeliveryStatus.SENT:
                email_sent.append(entry)
            else:
                entry['error'] = 'Email could not be sent. Please try again later.'
                email_failed.append(entry)
        except ValueError as e:
            errors.append(_bulk_invite_row_error(
                i,
                error=str(e),
                first_name=first_name,
                last_name=last_name,
                email=email,
                student_id=student_id,
                raw_student_id=raw_student_id,
            ))
        except Exception as e:
            errors.append(_bulk_invite_row_error(
                i,
                error=f'Unexpected error: {str(e)[:200]}',
                first_name=first_name,
                last_name=last_name,
                email=email,
                student_id=student_id,
                raw_student_id=raw_student_id,
            ))

        time.sleep(0.12)

    return email_sent, email_failed, errors


def _bulk_invite_response(email_sent, email_failed, errors, *, total_rows=None):
    sent_count = len(email_sent)
    failed_email_count = len(email_failed)
    error_count = len(errors)
    parts = []
    if sent_count:
        parts.append(f'{sent_count} verification email(s) sent')
    if failed_email_count:
        parts.append(f'{failed_email_count} invite(s) saved but email failed')
    if error_count:
        parts.append(f'{error_count} row(s) not invited')
    message = ', '.join(parts) if parts else 'No rows processed'

    return {
        'message': message,
        'email_sent_count': sent_count,
        'email_failed_count': failed_email_count,
        'error_count': error_count,
        'created_count': sent_count,
        'total_rows': total_rows if total_rows is not None else sent_count + failed_email_count + error_count,
        'email_sent': email_sent,
        'email_failed': email_failed,
        'errors': errors,
        # Legacy fields for older frontend
        'created': email_sent + email_failed,
    }


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def department_bulk_invite_rows(request):
    """Process a batch of student rows (JSON) — used by frontend to avoid server timeout."""
    denied = _require_hod(request.user)
    if denied:
        return denied

    dept_id = _hod_department_id(request.user) or request.data.get('department_id')
    if not dept_id:
        return Response({'error': 'department_id is required'}, status=400)

    rows = request.data.get('rows') or []
    if not isinstance(rows, list) or not rows:
        return Response({'error': 'rows must be a non-empty list'}, status=400)
    if len(rows) > 15:
        return Response({'error': 'Maximum 15 rows per batch'}, status=400)

    email_sent, email_failed, errors = _process_bulk_invite_rows(rows, invited_by=request.user, dept_id=int(dept_id))
    payload = _bulk_invite_response(
        email_sent, email_failed, errors,
        total_rows=request.data.get('total_rows'),
    )
    payload['batch'] = request.data.get('batch')
    payload['batch_total'] = request.data.get('batch_total')
    return Response(payload, status=status.HTTP_200_OK)


@api_view(['POST'])
@parser_classes([MultiPartParser, FormParser])
@permission_classes([IsAuthenticated])
def department_bulk_invite_students(request):
    """Upload CSV to invite multiple students. Columns: first_name, last_name, email, student_id"""
    denied = _require_hod(request.user)
    if denied:
        return denied

    upload = request.FILES.get('file')
    if not upload:
        return Response({'error': 'Upload a CSV file as "file"'}, status=status.HTTP_400_BAD_REQUEST)

    dept_id = _hod_department_id(request.user) or request.data.get('department_id')
    if not dept_id:
        return Response({'error': 'department_id is required'}, status=400)

    raw_bytes = upload.read()
    try:
        raw = raw_bytes.decode('utf-8-sig')
    except UnicodeDecodeError:
        try:
            raw = raw_bytes.decode('latin-1')
        except Exception:
            return Response({'error': 'File must be UTF-8 or Latin-1 CSV'}, status=400)

    reader = csv.DictReader(io.StringIO(raw))
    if not reader.fieldnames:
        return Response({'error': 'CSV must have a header row'}, status=400)

    def col(row, *names):
        for n in names:
            for key in row.keys():
                if key and key.strip().lower().replace(' ', '_') == n.lower():
                    val = row.get(key, '')
                    if val is not None and str(val).strip():
                        return str(val).strip()
        return ''

    parsed_rows = []
    for i, row in enumerate(reader, start=2):
        parsed_rows.append({
            'row': i,
            'first_name': col(row, 'first_name', 'firstname', 'first'),
            'last_name': col(row, 'last_name', 'lastname', 'last', 'surname'),
            'email': col(row, 'email', 'email_address'),
            'student_id': col(row, 'student_id', 'matric', 'matric_number', 'reg_number'),
            'raw_student_id': col(row, 'student_id', 'matric', 'matric_number', 'reg_number'),
        })

    if not parsed_rows:
        return Response({'error': 'CSV has no data rows'}, status=status.HTTP_400_BAD_REQUEST)

    email_sent, email_failed, errors = _process_bulk_invite_rows(
        parsed_rows, invited_by=request.user, dept_id=int(dept_id),
    )
    return Response(
        _bulk_invite_response(email_sent, email_failed, errors, total_rows=len(parsed_rows)),
        status=status.HTTP_200_OK,
    )
