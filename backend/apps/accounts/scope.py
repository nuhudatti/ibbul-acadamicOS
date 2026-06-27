"""
Module 2 — Scope enforcement for IBBUL Result Management System.
- ScopeMiddleware sets request.scope from request.user (role, faculty, department_fk).
- filter_by_scope(queryset, user) filters querysets by user's scope.
- @scope_required(level) decorator for view-level checks.
- ScopePermission (DRF) and admin get_queryset use scope.
"""
from enum import IntEnum
from typing import Any, Optional, Set

from django.db.models import QuerySet, Q
from django.http import HttpRequest

from .models import User, UserRole


class ScopeLevel(IntEnum):
    """Scope hierarchy: higher value = broader access. Used for @scope_required(level) and ScopePermission."""
    STUDENT = 1   # Own data only
    EXAMINER = 2  # Assigned courses only (CourseAssignment)
    DEPARTMENT = 3  # department_fk
    FACULTY = 4    # faculty
    GLOBAL = 5     # SUPER_ADMIN; no scope restriction


class ScopeContext:
    """Immutable scope context attached to request.scope. Built by ScopeMiddleware."""
    __slots__ = ('level', 'user', 'faculty_id', 'department_id', 'assigned_course_ids')

    def __init__(
        self,
        level: ScopeLevel,
        user: User,
        faculty_id: Optional[int] = None,
        department_id: Optional[int] = None,
        assigned_course_ids: Optional[Set[int]] = None,
    ):
        self.level = level
        self.user = user
        self.faculty_id = faculty_id
        self.department_id = department_id
        self.assigned_course_ids = frozenset(assigned_course_ids or ())

    def can_access_global(self) -> bool:
        return self.level >= ScopeLevel.GLOBAL

    def can_access_faculty(self, faculty_id: Optional[int]) -> bool:
        if self.level >= ScopeLevel.GLOBAL:
            return True
        if self.level >= ScopeLevel.FACULTY and faculty_id is not None:
            return self.faculty_id == faculty_id
        return False

    def can_access_department(self, department_id: Optional[int]) -> bool:
        if self.level >= ScopeLevel.GLOBAL:
            return True
        if self.level >= ScopeLevel.FACULTY and department_id is not None:
            # Faculty admin can access any department in their faculty
            if self.level >= ScopeLevel.FACULTY and self.faculty_id:
                from apps.academics.models import Department
                try:
                    dept = Department.objects.filter(pk=department_id).first()
                    if dept and dept.faculty_id == self.faculty_id:
                        return True
                except Exception:
                    pass
        if self.level >= ScopeLevel.DEPARTMENT and department_id is not None:
            return self.department_id == department_id
        return False

    def can_access_course(self, course_id: Optional[int]) -> bool:
        if self.level >= ScopeLevel.GLOBAL:
            return True
        if self.level >= ScopeLevel.DEPARTMENT:
            # Department/Faculty admin: course belongs to their dept/faculty (checked via filter_by_scope)
            return True  # Actual filtering is in filter_by_scope
        if self.level == ScopeLevel.EXAMINER and course_id is not None:
            return course_id in self.assigned_course_ids
        return False


def _role_str(user: Optional[User]) -> str:
    """Normalize user role to uppercase string (handles DB string or TextChoices)."""
    if user is None:
        return ''
    r = getattr(user, 'role', None)
    if r is None:
        return ''
    if isinstance(r, str):
        return r.upper()
    return getattr(r, 'value', str(r)).upper()


def is_super_admin(user: Optional[User]) -> bool:
    """True if user is SUPER_ADMIN (string or enum)."""
    return _role_str(user) == 'SUPER_ADMIN'


def is_hod(user: Optional[User]) -> bool:
    """True if user is HOD or DEPARTMENT_ADMIN (string or enum)."""
    return _role_str(user) in ('HOD', 'DEPARTMENT_ADMIN')


def is_faculty_admin(user: Optional[User]) -> bool:
    """True if user is FACULTY_ADMIN (Dean)."""
    return _role_str(user) == 'FACULTY_ADMIN'


def get_faculty_admin_faculty_id(user: Optional[User]) -> Optional[int]:
    if user is None or not is_faculty_admin(user):
        return None
    return getattr(user, 'faculty_id', None)


def can_view_staff_results(user: Optional[User]) -> bool:
    """Dean, HOD, and Super Admin can view scoped result management APIs."""
    if user is None or not getattr(user, 'is_staff', False):
        return False
    return is_super_admin(user) or is_hod(user) or is_faculty_admin(user)


def can_manage_department_results(user: Optional[User]) -> bool:
    """Upload, approve, reject — department HOD and Super Admin only."""
    if user is None or not getattr(user, 'is_staff', False):
        return False
    return is_super_admin(user) or is_hod(user)


def staff_can_access_student(user: User, student: User) -> bool:
    """Check whether staff may view a student's records within their scope."""
    scope = build_scope(user)
    if scope is None:
        return False
    if scope.level >= ScopeLevel.GLOBAL:
        return True
    student_dept_id = getattr(student, 'department_fk_id', None)
    if scope.level >= ScopeLevel.FACULTY and scope.faculty_id and student_dept_id:
        from apps.academics.models import Department
        dept = Department.objects.filter(pk=student_dept_id).first()
        return bool(dept and dept.faculty_id == scope.faculty_id)
    if scope.level >= ScopeLevel.DEPARTMENT and scope.department_id:
        return student_dept_id == scope.department_id
    if scope.level == ScopeLevel.EXAMINER:
        from apps.academics.models import Result
        if not scope.assigned_course_ids:
            return False
        return Result.objects.filter(
            student=student, course_id__in=scope.assigned_course_ids
        ).exists()
    return False


def get_hod_department_id(user: Optional[User]) -> Optional[int]:
    """Return department_id for HOD/Department Admin, else None. Use for strict department scoping."""
    if user is None:
        return None
    if not is_hod(user) and not is_super_admin(user):
        return None
    dept = getattr(user, 'department_fk', None)
    if dept is not None:
        return getattr(dept, 'pk', None)
    return getattr(user, 'department_fk_id', None)


def build_scope(user: Optional[User]) -> Optional[ScopeContext]:
    """Build ScopeContext from user. Returns None for anonymous or inactive users."""
    if user is None or not user.is_authenticated or not getattr(user, 'is_active', True):
        return None

    role = getattr(user, 'role', None)
    role_upper = _role_str(user)
    faculty_id = getattr(user, 'faculty_id', None) or None
    # HOD: use get_hod_department_id so department is resolved consistently (department_fk or department_fk_id)
    department_id = get_hod_department_id(user) if role_upper in ('DEPARTMENT_ADMIN', 'HOD') or role in (UserRole.DEPARTMENT_ADMIN, UserRole.HOD) else (getattr(user, 'department_fk_id', None) or None)

    if role_upper == 'SUPER_ADMIN' or role == UserRole.SUPER_ADMIN:
        return ScopeContext(ScopeLevel.GLOBAL, user, faculty_id=None, department_id=None)
    if role_upper == 'FACULTY_ADMIN' or role == UserRole.FACULTY_ADMIN:
        return ScopeContext(ScopeLevel.FACULTY, user, faculty_id=faculty_id, department_id=None)
    if role_upper in ('DEPARTMENT_ADMIN', 'HOD') or role in (UserRole.DEPARTMENT_ADMIN, UserRole.HOD):
        return ScopeContext(ScopeLevel.DEPARTMENT, user, faculty_id=faculty_id, department_id=department_id)
    if role_upper == 'EXAMINER' or role == UserRole.EXAMINER:
        from apps.academics.models import CourseAssignment
        assigned = set(
            CourseAssignment.objects.filter(examiner=user).values_list('course_id', flat=True)
        )
        return ScopeContext(ScopeLevel.EXAMINER, user, faculty_id=None, department_id=None, assigned_course_ids=assigned)
    if role_upper == 'STUDENT' or role == UserRole.STUDENT:
        return ScopeContext(ScopeLevel.STUDENT, user, faculty_id=None, department_id=None)
    # Legacy or unknown role: treat as student
    return ScopeContext(ScopeLevel.STUDENT, user, faculty_id=None, department_id=None)


def filter_by_scope(queryset: QuerySet[Any], user: User, request: Optional[HttpRequest] = None) -> QuerySet[Any]:
    """
    Filter queryset by user's scope. Use in views and admin get_queryset.
    Supports: Faculty, Department, Course, Result, ResultUploadBatch, User (staff list).
    """
    scope = build_scope(user)
    if scope is None:
        return queryset.none()

    model = queryset.model
    model_name = model._meta.model_name

    if scope.level >= ScopeLevel.GLOBAL:
        return queryset

    if model_name == 'faculty':
        if scope.level == ScopeLevel.FACULTY and scope.faculty_id:
            return queryset.filter(pk=scope.faculty_id)
        if scope.level == ScopeLevel.DEPARTMENT and scope.department_id:
            from apps.academics.models import Department
            dept = Department.objects.filter(pk=scope.department_id).select_related('faculty').first()
            if dept and dept.faculty_id:
                return queryset.filter(pk=dept.faculty_id)
        if scope.level >= ScopeLevel.DEPARTMENT:
            return queryset
        return queryset.none()

    if model_name == 'department':
        if scope.level == ScopeLevel.FACULTY and scope.faculty_id:
            return queryset.filter(faculty_id=scope.faculty_id)
        if scope.level == ScopeLevel.DEPARTMENT and scope.department_id:
            return queryset.filter(pk=scope.department_id)
        if scope.level == ScopeLevel.EXAMINER:
            # Examiner sees departments that have their assigned courses
            from apps.academics.models import Course
            course_ids = scope.assigned_course_ids
            if not course_ids:
                return queryset.none()
            dept_ids = Course.objects.filter(pk__in=course_ids).values_list('department_id', flat=True).distinct()
            return queryset.filter(pk__in=dept_ids)
        return queryset.none()

    if model_name == 'course':
        if scope.level == ScopeLevel.FACULTY and scope.faculty_id:
            return queryset.filter(department__faculty_id=scope.faculty_id)
        if scope.level == ScopeLevel.DEPARTMENT and scope.department_id:
            from apps.academics.models import DepartmentBorrowedCourse
            borrowed_ids = DepartmentBorrowedCourse.objects.filter(
                department_id=scope.department_id
            ).values_list('course_id', flat=True)
            return queryset.filter(
                Q(department_id=scope.department_id) | Q(id__in=borrowed_ids)
            )
        if scope.level == ScopeLevel.EXAMINER:
            if not scope.assigned_course_ids:
                return queryset.none()
            return queryset.filter(pk__in=scope.assigned_course_ids)
        return queryset.none()

    if model_name == 'result':
        if scope.level == ScopeLevel.STUDENT:
            return queryset.filter(student=user)
        if scope.level == ScopeLevel.EXAMINER:
            if not scope.assigned_course_ids:
                return queryset.none()
            return queryset.filter(course_id__in=scope.assigned_course_ids)
        if scope.level == ScopeLevel.DEPARTMENT:
            if not scope.department_id:
                return queryset.none()
            from apps.academics.models import DepartmentBorrowedCourse
            borrowed_ids = DepartmentBorrowedCourse.objects.filter(
                department_id=scope.department_id
            ).values_list('course_id', flat=True)
            # Match by result dept, course dept, student dept, or borrowed catalogue courses
            return queryset.filter(
                Q(department_id=scope.department_id)
                | Q(department_id__isnull=True, course__department_id=scope.department_id)
                | Q(student__department_fk_id=scope.department_id)
                | Q(course_id__in=borrowed_ids, student__department_fk_id=scope.department_id)
                | Q(
                    department_id__isnull=True,
                    course__department_id__isnull=True,
                    student__department_fk_id=scope.department_id,
                )
            )
        if scope.level == ScopeLevel.FACULTY and scope.faculty_id:
            return queryset.filter(course__department__faculty_id=scope.faculty_id)
        return queryset.none()

    if model_name == 'resultuploadbatch':
        if scope.level == ScopeLevel.DEPARTMENT and scope.department_id:
            return queryset.filter(department_id=scope.department_id)
        if scope.level == ScopeLevel.FACULTY and scope.faculty_id:
            return queryset.filter(faculty_id=scope.faculty_id)
        if scope.level == ScopeLevel.EXAMINER:
            return queryset.none()  # Examiners don't manage upload batches
        return queryset.none()

    if model_name == 'courseassignment':
        if scope.level == ScopeLevel.EXAMINER:
            return queryset.filter(examiner=user)
        if scope.level == ScopeLevel.DEPARTMENT:
            if not scope.department_id:
                return queryset.none()
            return queryset.filter(course__department_id=scope.department_id)
        if scope.level == ScopeLevel.FACULTY and scope.faculty_id:
            return queryset.filter(course__department__faculty_id=scope.faculty_id)
        return queryset.none()

    if model_name == 'user':
        if scope.level == ScopeLevel.STUDENT:
            return queryset.filter(pk=user.pk)
        if scope.level == ScopeLevel.EXAMINER:
            return queryset.filter(pk=user.pk)
        if scope.level == ScopeLevel.DEPARTMENT:
            if not scope.department_id:
                return queryset.none()
            return queryset.filter(department_fk_id=scope.department_id) | queryset.filter(pk=user.pk)
        if scope.level == ScopeLevel.FACULTY and scope.faculty_id:
            return queryset.filter(faculty_id=scope.faculty_id) | queryset.filter(department_fk__faculty_id=scope.faculty_id) | queryset.filter(pk=user.pk)
        return queryset.none()

    if model_name == 'semestersummary':
        if scope.level == ScopeLevel.STUDENT:
            return queryset.filter(student=user)
        if scope.level == ScopeLevel.EXAMINER:
            return queryset.none()
        if scope.level == ScopeLevel.DEPARTMENT and scope.department_id:
            return queryset.filter(student__department_fk_id=scope.department_id)
        if scope.level == ScopeLevel.FACULTY and scope.faculty_id:
            return queryset.filter(student__department_fk__faculty_id=scope.faculty_id)
        return queryset.none()

    if model_name == 'gpa':
        if scope.level == ScopeLevel.STUDENT:
            return queryset.filter(student=user)
        if scope.level == ScopeLevel.EXAMINER:
            return queryset.none()
        if scope.level == ScopeLevel.DEPARTMENT and scope.department_id:
            return queryset.filter(student__department_fk_id=scope.department_id)
        if scope.level == ScopeLevel.FACULTY and scope.faculty_id:
            return queryset.filter(student__department_fk__faculty_id=scope.faculty_id)
        return queryset.none()

    # Unregistered model: no filter (caller should restrict)
    return queryset


def scope_required(level: ScopeLevel):
    """
    View decorator: require request.user's scope to be at least `level`.
    Use on Django view functions (e.g. admin views). For DRF use ScopePermission.
    """
    from functools import wraps

    def decorator(view_func):
        @wraps(view_func)
        def wrapped_view(request: HttpRequest, *args, **kwargs):
            scope = getattr(request, 'scope', None)
            if scope is None:
                from django.contrib.auth.views import redirect_to_login
                from django.shortcuts import redirect
                if not getattr(request, 'user', None) or not request.user.is_authenticated:
                    return redirect_to_login(request.get_full_path())
                return redirect('admin:login')
            if scope.level < level:
                from django.http import HttpResponseForbidden
                return HttpResponseForbidden(
                    f'Access denied. This action requires scope level {level.name} or higher.'
                )
            return view_func(request, *args, **kwargs)
        return wrapped_view
    return decorator


class ScopeMiddleware:
    """Set request.scope from request.user (role, faculty, department_fk). Must run after AuthenticationMiddleware."""
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request: HttpRequest):
        request.scope = build_scope(getattr(request, 'user', None))
        return self.get_response(request)
