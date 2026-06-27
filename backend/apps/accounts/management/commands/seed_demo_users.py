"""
Create demo student and admin accounts for local testing.
Usage: python manage.py seed_demo_users
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from apps.accounts.models import UserRole

User = get_user_model()


class Command(BaseCommand):
    help = 'Create one demo student and one demo admin with known passwords for testing.'

    def handle(self, *args, **options):
        student_id = 'U22/FNS/CSC/0001'
        student_email = 'student.demo@placeholder.ibbul.edu.ng'
        student_password = 'Student@123'
        admin_email = 'admin@ibbul.edu.ng'
        admin_password = 'Admin@123'

        # Create or update student
        student, created = User.objects.update_or_create(
            student_id=student_id,
            defaults={
                'email': student_email,
                'first_name': 'Demo',
                'last_name': 'Student',
                'role': UserRole.STUDENT,
                'is_active': True,
                'is_first_login': False,
            },
        )
        student.set_password(student_password)
        student.save()
        if created:
            self.stdout.write(self.style.SUCCESS(f'Created student: {student_id}'))
        else:
            self.stdout.write(self.style.WARNING(f'Updated student: {student_id}'))

        # Create or update admin (superuser)
        if User.objects.filter(email__iexact=admin_email).exists():
            admin = User.objects.get(email__iexact=admin_email)
            admin.set_password(admin_password)
            admin.is_staff = True
            admin.is_superuser = True
            admin.role = UserRole.SUPER_ADMIN
            admin.first_name = admin.first_name or 'Admin'
            admin.last_name = admin.last_name or 'User'
            admin.is_first_login = False
            admin.save()
            self.stdout.write(self.style.WARNING(f'Updated admin: {admin_email}'))
        else:
            admin = User.objects.create_superuser(
                email=admin_email,
                password=admin_password,
                first_name='Admin',
                last_name='User',
            )
            admin.is_first_login = False
            admin.save()
            self.stdout.write(self.style.SUCCESS(f'Created admin: {admin_email}'))

        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('=== Demo login credentials ==='))
        self.stdout.write(f'  Student: {student_id} / {student_password}')
        self.stdout.write(f'  Admin:   {admin_email} / {admin_password}')
        self.stdout.write('  Use these on: http://localhost:3000/login')
        self.stdout.write('  Django admin: http://127.0.0.1:8000/admin/ (use admin email + password)')
