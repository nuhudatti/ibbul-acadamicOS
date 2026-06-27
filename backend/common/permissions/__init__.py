from .role_permissions import IsStudent, IsExaminer, IsHOD, IsExaminerOrHOD
from .enterprise_permissions import (
    user_has_permission,
    user_can_manage_users_scoped,
    user_can_bulk_import_users,
    user_can_approve_results,
    user_can_upload_results,
    ACCOUNTS_VIEW_USER_SCOPED,
    ACCOUNTS_ADD_USER_SCOPED,
    ACCOUNTS_BULK_IMPORT_USERS,
    ACADEMICS_APPROVE_RESULT,
    ACADEMICS_UPLOAD_RESULT,
)

__all__ = [
    'IsStudent',
    'IsExaminer',
    'IsHOD',
    'IsExaminerOrHOD',
    'user_has_permission',
    'user_can_manage_users_scoped',
    'user_can_bulk_import_users',
    'user_can_approve_results',
    'user_can_upload_results',
    'ACCOUNTS_VIEW_USER_SCOPED',
    'ACCOUNTS_ADD_USER_SCOPED',
    'ACCOUNTS_BULK_IMPORT_USERS',
    'ACADEMICS_APPROVE_RESULT',
    'ACADEMICS_UPLOAD_RESULT',
]
