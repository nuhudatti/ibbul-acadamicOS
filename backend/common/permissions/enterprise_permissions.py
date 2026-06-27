"""
Enterprise Permission Matrix — Single Source of Truth
=====================================================
Explicit, non-overlapping permission definitions for the University Result
Management System. Every role has defined permissions; HOD actions are
strictly department-scoped. Use these constants and helpers everywhere
(DRF, admin, bulk import) so the system stays consistent and auditable.
"""
from typing import FrozenSet, Optional, Set, Tuple

# ---------------------------------------------------------------------------
# ACADEMICS (Result, Course, GPA) — content type: academics.*
# ---------------------------------------------------------------------------
ACADEMICS_UPLOAD_RESULT = 'academics.upload_result'
ACADEMICS_APPROVE_RESULT = 'academics.approve_result'
ACADEMICS_VIEW_ALL_RESULTS = 'academics.view_all_results'
ACADEMICS_VIEW_OWN_RESULT = 'academics.view_own_result'
ACADEMICS_VIEW_RESULT = 'academics.view_result'
ACADEMICS_ADD_RESULT = 'academics.add_result'
ACADEMICS_CHANGE_RESULT = 'academics.change_result'
ACADEMICS_DELETE_RESULT = 'academics.delete_result'
ACADEMICS_VIEW_COURSE = 'academics.view_course'
ACADEMICS_ADD_COURSE = 'academics.add_course'
ACADEMICS_CHANGE_COURSE = 'academics.change_course'
ACADEMICS_VIEW_GPA = 'academics.view_gpa'
ACADEMICS_CALCULATE_GPA = 'academics.calculate_gpa'
ACADEMICS_CHANGE_GPA = 'academics.change_gpa'

# ---------------------------------------------------------------------------
# ACCOUNTS (User management) — content type: accounts.user
# Scoped: HOD = department only, Faculty Admin = faculty only, Super Admin = all
# ---------------------------------------------------------------------------
ACCOUNTS_VIEW_USER_SCOPED = 'accounts.view_user_scoped'
ACCOUNTS_ADD_USER_SCOPED = 'accounts.add_user_scoped'
ACCOUNTS_CHANGE_USER_SCOPED = 'accounts.change_user_scoped'
ACCOUNTS_BULK_IMPORT_USERS = 'accounts.bulk_import_users'

# All accounts permission codenames (for setup_groups)
ACCOUNTS_USER_PERMISSION_CODENAMES = (
    'view_user_scoped',
    'add_user_scoped',
    'change_user_scoped',
    'bulk_import_users',
)

# ---------------------------------------------------------------------------
# ROLE → PERMISSIONS (explicit, non-overlapping where it matters)
# ---------------------------------------------------------------------------
# Student: view own result only
ROLE_STUDENT_PERMISSIONS: FrozenSet[str] = frozenset([
    ACADEMICS_VIEW_OWN_RESULT,
    ACADEMICS_VIEW_COURSE,
    ACADEMICS_VIEW_GPA,
])

# Examiner: upload/view results, view courses, GPA (no approve, no user management)
ROLE_EXAMINER_PERMISSIONS: FrozenSet[str] = frozenset([
    ACADEMICS_UPLOAD_RESULT,
    ACADEMICS_ADD_RESULT,
    ACADEMICS_VIEW_ALL_RESULTS,
    ACADEMICS_VIEW_RESULT,
    ACADEMICS_CHANGE_RESULT,
    ACADEMICS_VIEW_COURSE,
    ACADEMICS_CALCULATE_GPA,
    ACADEMICS_VIEW_GPA,
])

# Department Admin (HOD): department-scoped result + course + user management
ROLE_DEPARTMENT_ADMIN_PERMISSIONS: FrozenSet[str] = frozenset([
    ACADEMICS_UPLOAD_RESULT,
    ACADEMICS_ADD_RESULT,
    ACADEMICS_VIEW_ALL_RESULTS,
    ACADEMICS_VIEW_RESULT,
    ACADEMICS_CHANGE_RESULT,
    ACADEMICS_APPROVE_RESULT,
    ACADEMICS_DELETE_RESULT,
    ACADEMICS_VIEW_COURSE,
    ACADEMICS_ADD_COURSE,
    ACADEMICS_CHANGE_COURSE,
    ACADEMICS_CALCULATE_GPA,
    ACADEMICS_VIEW_GPA,
    ACADEMICS_CHANGE_GPA,
    ACCOUNTS_VIEW_USER_SCOPED,
    ACCOUNTS_ADD_USER_SCOPED,
    ACCOUNTS_CHANGE_USER_SCOPED,
    ACCOUNTS_BULK_IMPORT_USERS,
])

# Faculty Admin (Dean): faculty-scoped (broader than HOD, still scoped)
ROLE_FACULTY_ADMIN_PERMISSIONS: FrozenSet[str] = frozenset([
    ACADEMICS_UPLOAD_RESULT,
    ACADEMICS_ADD_RESULT,
    ACADEMICS_VIEW_ALL_RESULTS,
    ACADEMICS_VIEW_RESULT,
    ACADEMICS_CHANGE_RESULT,
    ACADEMICS_APPROVE_RESULT,
    ACADEMICS_DELETE_RESULT,
    ACADEMICS_VIEW_COURSE,
    ACADEMICS_ADD_COURSE,
    ACADEMICS_CHANGE_COURSE,
    ACADEMICS_CALCULATE_GPA,
    ACADEMICS_VIEW_GPA,
    ACADEMICS_CHANGE_GPA,
    ACCOUNTS_VIEW_USER_SCOPED,
    ACCOUNTS_ADD_USER_SCOPED,
    ACCOUNTS_CHANGE_USER_SCOPED,
    ACCOUNTS_BULK_IMPORT_USERS,
])

# Super Admin: all permissions (no scope)
ROLE_SUPER_ADMIN_PERMISSIONS: FrozenSet[str] = frozenset([
    ACADEMICS_UPLOAD_RESULT,
    ACADEMICS_APPROVE_RESULT,
    ACADEMICS_VIEW_ALL_RESULTS,
    ACADEMICS_VIEW_OWN_RESULT,
    ACADEMICS_VIEW_RESULT,
    ACADEMICS_ADD_RESULT,
    ACADEMICS_CHANGE_RESULT,
    ACADEMICS_DELETE_RESULT,
    ACADEMICS_VIEW_COURSE,
    ACADEMICS_ADD_COURSE,
    ACADEMICS_CHANGE_COURSE,
    ACADEMICS_VIEW_GPA,
    ACADEMICS_CALCULATE_GPA,
    ACADEMICS_CHANGE_GPA,
    ACCOUNTS_VIEW_USER_SCOPED,
    ACCOUNTS_ADD_USER_SCOPED,
    ACCOUNTS_CHANGE_USER_SCOPED,
    ACCOUNTS_BULK_IMPORT_USERS,
])

ROLE_TO_PERMISSIONS = {
    'STUDENT': ROLE_STUDENT_PERMISSIONS,
    'EXAMINER': ROLE_EXAMINER_PERMISSIONS,
    'DEPARTMENT_ADMIN': ROLE_DEPARTMENT_ADMIN_PERMISSIONS,
    'HOD': ROLE_DEPARTMENT_ADMIN_PERMISSIONS,  # legacy alias
    'FACULTY_ADMIN': ROLE_FACULTY_ADMIN_PERMISSIONS,
    'SUPER_ADMIN': ROLE_SUPER_ADMIN_PERMISSIONS,
}


def user_has_permission(user, permission_codename: str) -> bool:
    """
    Check if user has the given permission (by full codename e.g. 'academics.upload_result').
    Respects Django permission system (user + groups). Superuser has all.
    """
    if user is None or not getattr(user, 'is_authenticated', False):
        return False
    if getattr(user, 'is_superuser', False):
        return True
    return user.has_perm(permission_codename)


def user_can_manage_users_scoped(user) -> bool:
    """True if user can view/add/change users within their scope (HOD/Faculty Admin/Super Admin)."""
    return user_has_permission(user, ACCOUNTS_VIEW_USER_SCOPED)


def user_can_bulk_import_users(user) -> bool:
    """True if user is allowed to bulk import users (HOD/Faculty Admin/Super Admin)."""
    return user_has_permission(user, ACCOUNTS_BULK_IMPORT_USERS)


def user_can_approve_results(user) -> bool:
    """True if user can approve results (HOD/Faculty Admin/Super Admin)."""
    return user_has_permission(user, ACADEMICS_APPROVE_RESULT)


def user_can_upload_results(user) -> bool:
    """True if user can upload results (Examiner/HOD/Faculty Admin/Super Admin)."""
    return user_has_permission(user, ACADEMICS_UPLOAD_RESULT)
