"""
Signals to auto-assign users to groups and module_access based on their role.
"""
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.contrib.auth.models import Group
from .models import User, UserRole


def _module_access_for_role(role) -> list:
    """Return the module access list for a given role."""
    if role in (UserRole.STUDENT,):
        return ['results', 'learning']
    if role in (UserRole.EXAMINER,):
        return ['results', 'learning']
    if role in (UserRole.HOD, UserRole.DEPARTMENT_ADMIN, UserRole.FACULTY_ADMIN):
        return ['results', 'learning', 'admin']
    if role == UserRole.SUPER_ADMIN:
        return ['results', 'learning', 'admin']
    return ['results']


@receiver(post_save, sender=User)
def assign_user_to_group(sender, instance, created, **kwargs):
    """
    Automatically assign user to appropriate group based on their role.
    Also sets module_access if it is empty or role-mismatched.
    """
    # ── Group assignment ─────────────────────────────────────────────────────
    instance.groups.clear()

    role_to_group = {
        UserRole.STUDENT: 'Student',
        UserRole.EXAMINER: 'Examiner',
        UserRole.HOD: 'HOD',
        UserRole.DEPARTMENT_ADMIN: 'HOD',
        UserRole.FACULTY_ADMIN: 'Faculty Admin',
        UserRole.SUPER_ADMIN: 'Admin',
    }

    group_name = role_to_group.get(instance.role)
    if group_name:
        try:
            group = Group.objects.get(name=group_name)
            instance.groups.add(group)
            action = 'Assigned' if created else 'Reassigned'
            print(f'[GROUPS] {action} user {instance.email or instance.student_id} to group: {group_name}')
        except Group.DoesNotExist:
            print(f'[WARNING] Group "{group_name}" does not exist. Run: python manage.py setup_groups')

    if instance.is_superuser:
        try:
            admin_group = Group.objects.get(name='Admin')
            instance.groups.add(admin_group)
        except Group.DoesNotExist:
            pass

    # ── module_access: set if empty or doesn't match current role ────────────
    correct_access = _module_access_for_role(instance.role)
    if sorted(instance.module_access or []) != sorted(correct_access):
        # Use update() to avoid re-triggering post_save
        User.objects.filter(pk=instance.pk).update(module_access=correct_access)
