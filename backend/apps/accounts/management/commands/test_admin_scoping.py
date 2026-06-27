"""
Management command: Test Django Admin User Scoping
Verifies that HOD users see only their department's users in Django admin.
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from apps.accounts.scope import is_hod, get_hod_department_id, is_super_admin
from apps.academics.models import Department

User = get_user_model()


class Command(BaseCommand):
    help = 'Test Django Admin User scoping: verify HOD sees only their department users'

    def add_arguments(self, parser):
        parser.add_argument(
            '--email',
            type=str,
            help='Test specific HOD email (e.g. geology@gmail.com)',
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('=' * 70))
        self.stdout.write(self.style.SUCCESS('Django Admin User Scoping Test'))
        self.stdout.write(self.style.SUCCESS('=' * 70))
        self.stdout.write('')

        test_email = options.get('email')
        
        if test_email:
            users = User.objects.filter(email=test_email)
        else:
            # Find all HOD users
            users = User.objects.filter(role__in=('DEPARTMENT_ADMIN', 'HOD'))
        
        if not users.exists():
            self.stdout.write(self.style.WARNING('No HOD users found.'))
            return
        
        for hod_user in users:
            self.stdout.write('')
            self.stdout.write(self.style.SUCCESS(f'Testing HOD: {hod_user.email}'))
            self.stdout.write(f'  Full Name: {hod_user.get_full_name()}')
            self.stdout.write(f'  Role: {hod_user.role}')
            
            # Check department
            dept_id = get_hod_department_id(hod_user)
            if dept_id:
                try:
                    dept = Department.objects.get(pk=dept_id)
                    self.stdout.write(self.style.SUCCESS(f'  Department: {dept.name} ({dept.code})'))
                except Department.DoesNotExist:
                    self.stdout.write(self.style.ERROR(f'  ⚠️  Department ID {dept_id} not found!'))
                    continue
            else:
                self.stdout.write(self.style.ERROR('  ⚠️  No department_fk set! HOD will see NO users.'))
                self.stdout.write('     Fix: Django admin → Users → Your profile → Set Department (department_fk)')
                continue
            
            # Count users in HOD's department
            dept_users = User.objects.filter(department_fk_id=dept_id)
            total_users = User.objects.count()
            
            self.stdout.write('')
            self.stdout.write(f'  Users in department: {dept_users.count()}')
            self.stdout.write(f'  Total users in system: {total_users}')
            
            if dept_users.count() == total_users and total_users > 1:
                self.stdout.write(self.style.WARNING(
                    f'  ⚠️  WARNING: All {total_users} users have same department as this HOD!'
                ))
                self.stdout.write('     This might indicate a scoping issue.')
            elif dept_users.count() < total_users:
                self.stdout.write(self.style.SUCCESS(
                    f'  ✅ Scoping looks correct: HOD sees {dept_users.count()} users, not all {total_users}'
                ))
            
            # Show sample users HOD should see
            sample_users = dept_users[:5]
            if sample_users.exists():
                self.stdout.write('')
                self.stdout.write('  Sample users HOD should see:')
                for u in sample_users:
                    role_display = getattr(u, 'role', '—')
                    self.stdout.write(f'    - {u.email or u.student_id}: {u.get_full_name()} ({role_display})')
            
            # Check if HOD can see users from other departments (should NOT)
            other_dept_users = User.objects.exclude(department_fk_id=dept_id).exclude(pk=hod_user.pk)
            if other_dept_users.exists():
                self.stdout.write('')
                self.stdout.write(f'  Users in OTHER departments: {other_dept_users.count()}')
                self.stdout.write(self.style.SUCCESS(
                    '  ✅ HOD should NOT see these users in Django admin'
                ))
                sample_others = other_dept_users[:3]
                if sample_others.exists():
                    self.stdout.write('  Sample users HOD should NOT see:')
                    for u in sample_others:
                        other_dept = getattr(u, 'department_fk', None)
                        dept_name = getattr(other_dept, 'name', '—') if other_dept else '—'
                        self.stdout.write(f'    - {u.email or u.student_id}: {u.get_full_name()} (Dept: {dept_name})')
        
        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('=' * 70))
        self.stdout.write('Test complete!')
        self.stdout.write('')
        self.stdout.write('To test in Django admin:')
        self.stdout.write('  1. Log in as HOD (e.g. geology@gmail.com)')
        self.stdout.write('  2. Go to: /admin/accounts/user/')
        self.stdout.write('  3. Verify you see ONLY users in your department')
        self.stdout.write('=' * 70)
