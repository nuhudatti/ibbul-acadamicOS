"""
Academic Core permission classes.
"""
from rest_framework.permissions import BasePermission, SAFE_METHODS


class IsStaffOrReadOnly(BasePermission):
    """Allow staff full access; others read-only."""
    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return request.user and request.user.is_authenticated
        return request.user and request.user.is_staff


class IsAdminOrHOD(BasePermission):
    """Only Super Admin, Faculty Admin, or HOD can write."""
    WRITE_ROLES = {'SUPER_ADMIN', 'FACULTY_ADMIN', 'HOD', 'DEPARTMENT_ADMIN'}

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        return str(request.user.role) in self.WRITE_ROLES


class IsSuperAdmin(BasePermission):
    """Only Super Admin can perform institutional structure writes."""

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and str(request.user.role) == 'SUPER_ADMIN'
        )


class IsSuperOrFacultyAdmin(BasePermission):
    """Super Admin or Faculty Admin can manage faculty-level structure."""

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and str(request.user.role) in ('SUPER_ADMIN', 'FACULTY_ADMIN')
        )
