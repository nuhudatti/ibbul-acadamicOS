"""
Role-Based Permissions
Defines custom permission classes for Student, Examiner, and HOD roles
"""
from rest_framework import permissions
from typing import Any


class IsStudent(permissions.BasePermission):
    """Allows access only to users with Student role"""
    
    def has_permission(self, request: Any, view: Any) -> bool:
        return (
            request.user and
            request.user.is_authenticated and
            hasattr(request.user, 'role') and
            request.user.role == 'STUDENT'
        )


class IsExaminer(permissions.BasePermission):
    """Allows access only to users with Examiner role"""
    
    def has_permission(self, request: Any, view: Any) -> bool:
        return (
            request.user and
            request.user.is_authenticated and
            hasattr(request.user, 'role') and
            request.user.role == 'EXAMINER'
        )


class IsHOD(permissions.BasePermission):
    """Allows access only to users with HOD or Department Admin role"""
    
    def has_permission(self, request: Any, view: Any) -> bool:
        return (
            request.user and
            request.user.is_authenticated and
            hasattr(request.user, 'role') and
            request.user.role in ('HOD', 'DEPARTMENT_ADMIN')
        )


class IsExaminerOrHOD(permissions.BasePermission):
    """Allows access to Examiner or HOD/Department Admin roles"""
    
    def has_permission(self, request: Any, view: Any) -> bool:
        return (
            request.user and
            request.user.is_authenticated and
            hasattr(request.user, 'role') and
            request.user.role in ('EXAMINER', 'HOD', 'DEPARTMENT_ADMIN')
        )
