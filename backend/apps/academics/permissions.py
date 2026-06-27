"""
Custom permission classes for Result Management System
Uses Django Groups and Permissions for authorization.
Module 2: ScopePermission enforces faculty/department/examiner scope on DRF views.
"""
from rest_framework import permissions
from apps.accounts.models import UserRole
from apps.accounts.scope import ScopeLevel, build_scope

# HOD-equivalent roles (Department Admin + legacy HOD)
HOD_ROLES = (UserRole.HOD, UserRole.DEPARTMENT_ADMIN)
# Staff roles that can upload/view results (Examiner + HOD-equivalent + Faculty/Super admin)
STAFF_RESULT_ROLES = (UserRole.EXAMINER, UserRole.HOD, UserRole.DEPARTMENT_ADMIN, UserRole.FACULTY_ADMIN, UserRole.SUPER_ADMIN)


class ScopePermission(permissions.BasePermission):
    """
    DRF permission: require request.scope (set by ScopeMiddleware) to be at least `scope_level`.
    Optionally filter queryset in get_queryset using filter_by_scope(queryset, request.user).
    """
    scope_level = ScopeLevel.STUDENT  # Override on view: permission_classes = [ScopePermission]; scope_level = ScopeLevel.DEPARTMENT
    message = 'You do not have sufficient scope to access this resource.'

    def get_scope_level(self, view):
        return getattr(view, 'scope_level', self.scope_level)

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        scope = getattr(request, 'scope', None)
        if scope is None:
            scope = build_scope(request.user)
        if scope is None:
            return False
        required = self.get_scope_level(view)
        return scope.level >= required

    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False
        scope = getattr(request, 'scope', None)
        if scope is None:
            scope = build_scope(request.user)
        if scope is None:
            return False
        if scope.level >= ScopeLevel.GLOBAL:
            return True
        # Object-level: check obj is within scope (faculty/department/course/student)
        if hasattr(obj, 'student') and obj.student is not None:
            if obj.student_id == request.user.pk:
                return True
            if scope.level >= ScopeLevel.EXAMINER:
                if scope.level == ScopeLevel.EXAMINER and hasattr(obj, 'course_id'):
                    return scope.can_access_course(obj.course_id)
                return True
            return False
        if hasattr(obj, 'faculty_id') and obj.faculty_id is not None:
            return scope.can_access_faculty(obj.faculty_id)
        if hasattr(obj, 'department_id') and obj.department_id is not None:
            return scope.can_access_department(obj.department_id)
        if hasattr(obj, 'course_id') and obj.course_id is not None:
            return scope.can_access_course(obj.course_id)
        return True


class IsStudent(permissions.BasePermission):
    """Only allows access to users in the Student group"""
    message = 'Only students can access this resource'
    
    def has_permission(self, request, view):
        return (
            request.user 
            and request.user.is_authenticated 
            and request.user.role == UserRole.STUDENT
        )


class IsExaminer(permissions.BasePermission):
    """Only allows access to users in the Examiner group"""
    message = 'Only examiners can access this resource'
    
    def has_permission(self, request, view):
        return (
            request.user 
            and request.user.is_authenticated 
            and request.user.role == UserRole.EXAMINER
        )


class IsHOD(permissions.BasePermission):
    """Only allows access to Department Admin (HOD) or legacy HOD"""
    message = 'Only HOD/Department Admin can access this resource'
    
    def has_permission(self, request, view):
        return (
            request.user 
            and request.user.is_authenticated 
            and request.user.role in HOD_ROLES
        )


class IsStaffOrHOD(permissions.BasePermission):
    """Allows access to Examiners and HOD/Department Admin"""
    message = 'Only examiners and HOD can access this resource'
    
    def has_permission(self, request, view):
        return (
            request.user 
            and request.user.is_authenticated 
            and request.user.role in [UserRole.EXAMINER] + list(HOD_ROLES)
        )


class CanUploadResult(permissions.BasePermission):
    """Check if user has permission to upload results"""
    message = 'You do not have permission to upload results'
    
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        # EXAMINER is strictly view-only in production system
        if request.user.role == UserRole.EXAMINER:
            return False
        # Check Django permission (HOD / FACULTY_ADMIN / SUPER_ADMIN, or delegated roles)
        return request.user.has_perm('academics.upload_result')


class CanApproveResult(permissions.BasePermission):
    """Check if user has permission to approve results (HOD/Faculty Admin/Super Admin)."""
    message = 'Only HOD/Faculty Admin/Super Admin can approve results'
    
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return request.user.has_perm('academics.approve_result')


class CanDeleteResult(permissions.BasePermission):
    """HOD, Faculty Admin, and Super Admin may delete non-published results."""
    message = 'You do not have permission to delete results'

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return request.user.role in (
            *HOD_ROLES,
            UserRole.FACULTY_ADMIN,
            UserRole.SUPER_ADMIN,
        )

    def has_object_permission(self, request, view, obj):
        if getattr(obj, 'is_deleted', False):
            return False
        return True


class CanBulkImportUsers(permissions.BasePermission):
    """Check if user has permission to bulk import users (HOD/Faculty Admin/Super Admin)."""
    message = 'You do not have permission to bulk import users.'
    
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return request.user.has_perm('accounts.bulk_import_users')


class CanViewAllResults(permissions.BasePermission):
    """Check if user can view all students' results"""
    message = 'You can only view your own results'
    
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        
        # Check Django permission
        return request.user.has_perm('academics.view_all_results')


class CanViewOwnResult(permissions.BasePermission):
    """Students can only view their own results"""
    message = 'You can only view your own results'
    
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        
        return request.user.has_perm('academics.view_own_result')
    
    def has_object_permission(self, request, view, obj):
        """Check if user owns this result"""
        # Students can only access their own results
        if request.user.role == UserRole.STUDENT:
            return obj.student == request.user
        
        # Staff can access any result
        return request.user.role in [UserRole.EXAMINER] + list(HOD_ROLES) + [UserRole.FACULTY_ADMIN, UserRole.SUPER_ADMIN]


class IsOwnerOrStaff(permissions.BasePermission):
    """
    Students can only view their own data
    Staff (Examiner/HOD) can view any data
    """
    message = 'You can only access your own data'
    
    def has_object_permission(self, request, view, obj):
        # Staff can access any object
        if request.user.role in list(STAFF_RESULT_ROLES):
            return True
        
        # Students can only access their own objects
        if hasattr(obj, 'student'):
            return obj.student == request.user
        
        return False


class ReadOnly(permissions.BasePermission):
    """Read-only permission for GET requests"""
    
    def has_permission(self, request, view):
        return request.method in permissions.SAFE_METHODS
