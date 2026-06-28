"""
Staff invitation service — email delivery, accept flow, governance actions.
"""
import logging
import secrets
from datetime import timedelta
from typing import Optional, Tuple

from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.academics.models import Department, Faculty
from apps.accounts.audit import log_audit
from apps.accounts.scope import get_faculty_admin_faculty_id, get_hod_department_id, is_faculty_admin, is_hod, is_super_admin
from common.validators.student_id_validator import validate_student_id_format
from apps.accounts.models import AuditLog, StaffInvitation, User, UserRole

logger = logging.getLogger(__name__)

INVITE_VALID_DAYS = 7
ROLE_LABELS = {
    UserRole.FACULTY_ADMIN: 'Faculty Dean',
    UserRole.DEPARTMENT_ADMIN: 'Head of Department',
    UserRole.HOD: 'Head of Department',
    UserRole.EXAMINER: 'Lecturer',
    UserRole.STUDENT: 'Student',
}

HOD_INVITABLE_ROLES = (UserRole.EXAMINER, UserRole.STUDENT)


def _normalize_role(role: str) -> str:
    r = (role or '').upper().strip()
    if r == 'HOD':
        return UserRole.DEPARTMENT_ADMIN
    return r


def build_invite_url(token: str) -> str:
    from django.conf import settings
    base = getattr(settings, 'FRONTEND_BASE_URL', 'http://localhost:3000').rstrip('/')
    return f'{base}/invite/accept?token={token}'


from apps.accounts.email_service import send_invitation_email_branded as send_invitation_email


def _friendly_integrity_error(exc: IntegrityError) -> str:
    msg = str(exc).lower()
    if 'email' in msg:
        return 'An account or pending invitation with this email already exists. Check Invitations or revoke the old one.'
    if 'student_id' in msg:
        return 'An account or pending invitation with this matric number already exists.'
    return 'This invitation could not be created because a duplicate record exists.'


def _apply_delivery_result(
    invitation: StaffInvitation,
    ok: bool,
    msg: str,
    *,
    is_resend: bool = False,
) -> StaffInvitation:
    now = timezone.now()
    if is_resend:
        invitation.send_count += 1
    else:
        invitation.send_count = 1
        invitation.sent_at = now
    invitation.last_sent_at = now
    invitation.status = StaffInvitation.Status.SENT
    if ok:
        invitation.delivery_status = StaffInvitation.DeliveryStatus.SENT
        invitation.delivery_error = ''
    else:
        invitation.delivery_status = StaffInvitation.DeliveryStatus.FAILED
        invitation.delivery_error = msg
    invitation.save()
    return invitation


def build_invitation_response_message(invitation: StaffInvitation) -> str:
    if invitation.delivery_status == StaffInvitation.DeliveryStatus.SENT:
        return 'Invitation email sent successfully'
    if invitation.delivery_error:
        return f'Invitation created but email could not be sent: {invitation.delivery_error}'
    return 'Invitation created — copy the secure link from the invitations list'


def _clear_previous_assignment(role: str, faculty: Optional[Faculty], department: Optional[Department]) -> None:
    if role == UserRole.FACULTY_ADMIN and faculty:
        User.objects.filter(role=UserRole.FACULTY_ADMIN, faculty=faculty, is_active=True).update(faculty=None)
    if role in (UserRole.DEPARTMENT_ADMIN, UserRole.HOD) and department:
        User.objects.filter(
            role__in=(UserRole.DEPARTMENT_ADMIN, UserRole.HOD),
            department_fk=department,
            is_active=True,
        ).update(department_fk=None, department='')


FACULTY_ADMIN_INVITABLE_ROLES = (UserRole.DEPARTMENT_ADMIN, UserRole.EXAMINER)


def assert_inviter_can_manage(
    actor: User,
    role: str,
    department_id: Optional[int],
    faculty_id: Optional[int] = None,
) -> None:
    """Super Admin: any supported role. Dean: HOD/Lecturer in own faculty. HOD: EXAMINER/STUDENT in own dept."""
    role = _normalize_role(role)
    if is_super_admin(actor):
        return
    if is_faculty_admin(actor):
        dean_faculty_id = get_faculty_admin_faculty_id(actor)
        if dean_faculty_id is None:
            raise ValueError('Your account is not linked to a faculty. Contact Super Admin.')
        if role not in FACULTY_ADMIN_INVITABLE_ROLES:
            raise ValueError('Dean can only invite HODs and Lecturers')
        if not department_id:
            raise ValueError('Select a department for this invitation')
        dept = Department.objects.filter(pk=department_id).select_related('faculty').first()
        if not dept or dept.faculty_id != dean_faculty_id:
            raise ValueError('You can only invite users into departments in your faculty')
        if faculty_id and int(faculty_id) != int(dean_faculty_id):
            raise ValueError('You can only invite within your faculty')
        return
    if not is_hod(actor):
        raise ValueError('You do not have permission to send invitations')
    if role not in HOD_INVITABLE_ROLES:
        raise ValueError('HOD can only invite Lecturers and Students')
    hod_dept = get_hod_department_id(actor)
    if hod_dept is None:
        raise ValueError('Your account is not linked to a department')
    if not department_id or int(department_id) != int(hod_dept):
        raise ValueError('You can only invite users into your own department')


def _create_invitation_record(
    *,
    invited_by: User,
    email: str,
    first_name: str,
    last_name: str,
    role: str,
    faculty_id: Optional[int] = None,
    department_id: Optional[int] = None,
    student_id: Optional[str] = None,
) -> StaffInvitation:
    role = _normalize_role(role)
    assert_inviter_can_manage(invited_by, role, department_id, faculty_id)

    if role == UserRole.STUDENT:
        allowed_roles = (UserRole.STUDENT,)
    elif is_super_admin(invited_by):
        allowed_roles = (
            UserRole.FACULTY_ADMIN,
            UserRole.DEPARTMENT_ADMIN,
            UserRole.EXAMINER,
            UserRole.STUDENT,
        )
    elif is_faculty_admin(invited_by):
        allowed_roles = FACULTY_ADMIN_INVITABLE_ROLES
    else:
        allowed_roles = HOD_INVITABLE_ROLES

    if role not in allowed_roles:
        raise ValueError('Invalid role for this invitation')

    email = (email or '').strip().lower() or None
    faculty = Faculty.objects.filter(pk=faculty_id).first() if faculty_id else None
    department = Department.objects.filter(pk=department_id).select_related('faculty').first() if department_id else None

    if role == UserRole.FACULTY_ADMIN and not faculty:
        raise ValueError('Faculty is required for Dean invitation')
    if role in (UserRole.DEPARTMENT_ADMIN, UserRole.EXAMINER, UserRole.STUDENT) and not department:
        raise ValueError('Department is required for this invitation')

    if department and not faculty:
        faculty = department.faculty

    if is_faculty_admin(invited_by):
        dean_fid = get_faculty_admin_faculty_id(invited_by)
        faculty_id = dean_fid
        if faculty and faculty.id != dean_fid:
            raise ValueError('Department is outside your faculty scope')

    matric = None
    if role == UserRole.STUDENT:
        if not student_id or not str(student_id).strip():
            raise ValueError('Matric number is required for student invitation')
        if not email:
            raise ValueError('Email is required so the student receives their invitation')
        matric = str(student_id).strip().upper()
        validate_student_id_format(matric)
        if User.objects.filter(student_id=matric).exclude(role=UserRole.STUDENT).exists():
            raise ValueError('Matric number is already used by a non-student account')
        active_student = User.objects.filter(student_id=matric, role=UserRole.STUDENT, is_active=True).first()
        if active_student:
            raise ValueError('An active student with this matric number already exists')
    else:
        if not email:
            raise ValueError('Email is required for staff invitations')

    pending_qs = StaffInvitation.objects.select_for_update().filter(
        status__in=(StaffInvitation.Status.PENDING, StaffInvitation.Status.SENT),
        expires_at__gt=timezone.now(),
    )
    if email:
        pending = pending_qs.filter(email__iexact=email).first()
        if pending:
            raise ValueError('A pending invitation already exists for this email. Resend or revoke it first.')
    if matric:
        pending = pending_qs.filter(student_id=matric).first()
        if pending:
            raise ValueError('A pending invitation already exists for this matric number. Resend or revoke it first.')

    existing = User.objects.filter(email__iexact=email).first() if email else None
    existing_student = User.objects.filter(student_id=matric).first() if matric else None
    existing = existing or existing_student

    if existing and existing.is_active:
        if role == UserRole.STUDENT and existing.role == UserRole.STUDENT:
            raise ValueError('Student already exists with this matric number')
        if existing.role not in (UserRole.STUDENT, role):
            raise ValueError(f'User already exists with role {existing.role}. Remove assignment first.')

    if role != UserRole.STUDENT:
        _clear_previous_assignment(role, faculty, department)

    token = secrets.token_urlsafe(32)
    expires_at = timezone.now() + timedelta(days=INVITE_VALID_DAYS)

    default_modules = ['results', 'learning'] if role == UserRole.STUDENT else ['results', 'learning', 'admin']

    if existing:
        user = existing
        user.first_name = first_name
        user.last_name = last_name
        user.role = role
        user.is_staff = role != UserRole.STUDENT
        user.is_active = False
        user.is_first_login = True
        user.faculty = faculty
        user.department_fk = department
        user.department = department.name if department else ''
        user.student_id = matric if role == UserRole.STUDENT else None
        if email:
            user.email = email
        if not user.module_access:
            user.module_access = default_modules
        user.set_unusable_password()
        user.save()
    else:
        temp_pw = secrets.token_urlsafe(24)
        if role == UserRole.STUDENT:
            user = User.objects.create_user(
                email=email,
                password=temp_pw,
                student_id=matric,
                role=UserRole.STUDENT,
                first_name=first_name,
                last_name=last_name,
                is_staff=False,
                is_active=False,
                is_first_login=True,
                faculty=faculty,
                department_fk=department,
                department=department.name if department else '',
                module_access=default_modules,
            )
        else:
            user = User.objects.create_user(
                email=email,
                password=temp_pw,
                role=role,
                first_name=first_name,
                last_name=last_name,
                is_staff=True,
                is_active=False,
                is_first_login=True,
                faculty=faculty,
                department_fk=department,
                department=department.name if department else '',
                module_access=default_modules,
            )
        user.set_unusable_password()
        user.save(update_fields=['password'])

    invitation = StaffInvitation.objects.create(
        email=email or '',
        student_id=matric,
        first_name=first_name,
        last_name=last_name,
        role=role,
        faculty=faculty,
        department=department,
        token=token,
        status=StaffInvitation.Status.PENDING,
        delivery_status=StaffInvitation.DeliveryStatus.QUEUED,
        invited_by=invited_by,
        user=user,
        expires_at=expires_at,
    )

    log_audit(
        AuditLog.Action.ADMIN_ACTION,
        user=invited_by,
        identifier=f'Invited {email} as {role}',
        extra={
            'action': 'STAFF_INVITATION_CREATED',
            'invitation_id': invitation.id,
            'email': email,
            'role': role,
            'invite_url': build_invite_url(token),
        },
    )
    return invitation


def create_and_send_invitation(
    *,
    invited_by: User,
    email: str,
    first_name: str,
    last_name: str,
    role: str,
    faculty_id: Optional[int] = None,
    department_id: Optional[int] = None,
    student_id: Optional[str] = None,
) -> StaffInvitation:
    try:
        with transaction.atomic():
            invitation = _create_invitation_record(
                invited_by=invited_by,
                email=email,
                first_name=first_name,
                last_name=last_name,
                role=role,
                faculty_id=faculty_id,
                department_id=department_id,
                student_id=student_id,
            )
    except IntegrityError as exc:
        raise ValueError(_friendly_integrity_error(exc)) from exc

    ok, msg = send_invitation_email(invitation)
    invitation = _apply_delivery_result(invitation, ok, msg)

    log_audit(
        AuditLog.Action.ADMIN_ACTION,
        user=invited_by,
        identifier=f'Invitation email to {invitation.email}',
        extra={
            'action': 'STAFF_INVITATION_SENT',
            'invitation_id': invitation.id,
            'email': invitation.email,
            'role': invitation.role,
            'delivery_ok': ok,
            'delivery_error': msg if not ok else '',
            'invite_url': build_invite_url(invitation.token),
        },
    )
    return invitation


def resend_invitation(invitation: StaffInvitation, actor: User) -> StaffInvitation:
    if invitation.status == StaffInvitation.Status.ACCEPTED:
        raise ValueError('Invitation already accepted')
    if invitation.status == StaffInvitation.Status.REVOKED:
        raise ValueError('Invitation was revoked')

    if invitation.is_expired:
        invitation.token = secrets.token_urlsafe(32)
        invitation.expires_at = timezone.now() + timedelta(days=INVITE_VALID_DAYS)
        invitation.status = StaffInvitation.Status.PENDING

    ok, msg = send_invitation_email(invitation)
    invitation = _apply_delivery_result(invitation, ok, msg, is_resend=True)

    log_audit(
        AuditLog.Action.ADMIN_ACTION,
        user=actor,
        identifier=f'Resent invitation to {invitation.email}',
        extra={'action': 'STAFF_INVITATION_RESENT', 'invitation_id': invitation.id},
    )
    return invitation


def revoke_invitation(invitation: StaffInvitation, actor: User) -> StaffInvitation:
    if invitation.status == StaffInvitation.Status.ACCEPTED:
        raise ValueError('Cannot revoke an accepted invitation')
    invitation.status = StaffInvitation.Status.REVOKED
    invitation.save(update_fields=['status'])
    if invitation.user_id:
        invitation.user.is_active = False
        invitation.user.save(update_fields=['is_active'])
    log_audit(
        AuditLog.Action.ADMIN_ACTION,
        user=actor,
        identifier=f'Revoked invitation {invitation.email}',
        extra={'action': 'STAFF_INVITATION_REVOKED', 'invitation_id': invitation.id},
    )
    return invitation


@transaction.atomic
def accept_invitation(token: str, password: str) -> User:
    invitation = StaffInvitation.objects.select_related('user', 'faculty', 'department').filter(
        token=token
    ).first()
    if not invitation:
        raise ValueError('Invalid or expired invitation link')
    if invitation.status == StaffInvitation.Status.REVOKED:
        raise ValueError('This invitation has been revoked')
    if invitation.status == StaffInvitation.Status.ACCEPTED:
        raise ValueError('This invitation was already accepted. Please sign in.')
    if invitation.is_expired:
        invitation.status = StaffInvitation.Status.EXPIRED
        invitation.save(update_fields=['status'])
        raise ValueError('This invitation has expired. Ask your administrator to resend.')

    user = invitation.user
    if not user:
        raise ValueError('Invitation user record missing')

    user.set_password(password)
    user.is_active = True
    user.is_first_login = False
    user.email_verified = True
    user.last_password_change = timezone.now()
    user.role = invitation.role
    user.faculty = invitation.faculty
    user.department_fk = invitation.department
    user.department = invitation.department.name if invitation.department else ''
    user.is_staff = invitation.role != UserRole.STUDENT
    if invitation.role == UserRole.STUDENT and invitation.student_id:
        user.student_id = invitation.student_id.upper()
    if invitation.role == UserRole.STUDENT and not user.module_access:
        user.module_access = ['results', 'learning']
    user.save()

    invitation.status = StaffInvitation.Status.ACCEPTED
    invitation.accepted_at = timezone.now()
    invitation.save(update_fields=['status', 'accepted_at'])

    log_audit(
        AuditLog.Action.ADMIN_ACTION,
        user=user,
        identifier=f'Accepted invitation {invitation.email}',
        extra={'action': 'STAFF_INVITATION_ACCEPTED', 'invitation_id': invitation.id},
    )
    return user


def suspend_staff(user: User, actor: User) -> User:
    if user.role == UserRole.SUPER_ADMIN:
        raise ValueError('Cannot suspend Super Admin')
    user.is_active = False
    user.save(update_fields=['is_active'])
    log_audit(
        AuditLog.Action.ADMIN_ACTIVATE_DEACTIVATE,
        user=actor,
        identifier=f'Suspended {user.email}',
        extra={'target_user_id': user.id, 'action': 'suspend'},
    )
    return user


def reactivate_staff(user: User, actor: User) -> User:
    user.is_active = True
    user.save(update_fields=['is_active'])
    log_audit(
        AuditLog.Action.ADMIN_ACTIVATE_DEACTIVATE,
        user=actor,
        identifier=f'Reactivated {user.email}',
        extra={'target_user_id': user.id, 'action': 'reactivate'},
    )
    return user


def remove_staff_assignment(user: User, actor: User) -> User:
    if user.role == UserRole.SUPER_ADMIN:
        raise ValueError('Cannot remove Super Admin assignment')
    user.faculty = None
    user.department_fk = None
    user.department = ''
    user.is_active = False
    user.save(update_fields=['faculty', 'department_fk', 'department', 'is_active'])
    StaffInvitation.objects.filter(
        user=user,
        status__in=(StaffInvitation.Status.PENDING, StaffInvitation.Status.SENT),
    ).update(status=StaffInvitation.Status.REVOKED)
    log_audit(
        AuditLog.Action.ADMIN_ACTION,
        user=actor,
        identifier=f'Removed assignment for {user.email}',
        extra={'target_user_id': user.id, 'action': 'remove_assignment'},
    )
    return user
