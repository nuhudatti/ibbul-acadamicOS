"""
Reset all staff users (email-based: Super Admin, Faculty Admin, HOD, Examiner) to a known password.
Use this if Django admin or API login fails (e.g. after seed_hod set a different temp password).

Usage:
  python manage.py reset_staff_passwords
  python manage.py reset_staff_passwords --password "MyNewPass@123"
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from apps.accounts.models import UserRole

User = get_user_model()
DEFAULT_PASSWORD = 'Demo@123'


class Command(BaseCommand):
    help = 'Reset all staff users (non-STUDENT) to a given password so you can log in to admin/API.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--password',
            type=str,
            default=DEFAULT_PASSWORD,
            help=f'Password to set (default: {DEFAULT_PASSWORD})',
        )

    def handle(self, *args, **options):
        password = options.get('password') or DEFAULT_PASSWORD
        staff_roles = [
            UserRole.SUPER_ADMIN,
            UserRole.FACULTY_ADMIN,
            UserRole.DEPARTMENT_ADMIN,
            UserRole.HOD,
            UserRole.EXAMINER,
        ]
        users = User.objects.filter(role__in=staff_roles, email__isnull=False).exclude(email='')
        count = 0
        for user in users:
            user.set_password(password)
            user.save(update_fields=['password'])
            count += 1
            self.stdout.write(
                self.style.SUCCESS(f'  Reset password for: {user.email} ({user.role})')
            )
        self.stdout.write(
            self.style.SUCCESS(f'\nDone. Reset password for {count} staff user(s). Use: {password}')
        )
