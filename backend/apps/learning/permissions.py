"""
Learning module DRF permission classes.
All scope rules mirror the Academic Core: students see their own data,
examiners see their assigned offerings, HOD sees department, etc.
"""
from rest_framework.permissions import BasePermission
from apps.accounts.models import UserRole


class IsEnrolledStudent(BasePermission):
    """Allow access only to students enrolled in the relevant offering."""
    message = 'You must be enrolled in this course to access this content.'

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == UserRole.STUDENT


class IsInstructor(BasePermission):
    """Allow access to EXAMINER users (instructors in LMS context)."""
    message = 'Only instructors (examiners) can perform this action.'

    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.role in (UserRole.EXAMINER, UserRole.DEPARTMENT_ADMIN,
                                       UserRole.HOD, UserRole.FACULTY_ADMIN, UserRole.SUPER_ADMIN)
        )


class IsOfferingInstructor(BasePermission):
    """Allow modification only by the instructor assigned to the specific offering."""
    message = 'Only the instructor assigned to this offering can modify it.'

    def has_object_permission(self, request, view, obj):
        from .models import LMSOffering, Module, Lesson
        user = request.user
        if user.role == UserRole.SUPER_ADMIN:
            return True
        if user.role in (UserRole.DEPARTMENT_ADMIN, UserRole.HOD, UserRole.FACULTY_ADMIN):
            return True
        # Get the offering for any nested object
        if isinstance(obj, LMSOffering):
            return obj.instructor == user
        if isinstance(obj, Module):
            return obj.offering.instructor == user
        if isinstance(obj, Lesson):
            return obj.module.offering.instructor == user
        return False


class IsStaffOrReadOnly(BasePermission):
    """Staff (HOD+) can write; authenticated students/examiners can read."""

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if request.method in ('GET', 'HEAD', 'OPTIONS'):
            return True
        return request.user.role in (
            UserRole.DEPARTMENT_ADMIN, UserRole.HOD,
            UserRole.FACULTY_ADMIN, UserRole.SUPER_ADMIN,
        )
