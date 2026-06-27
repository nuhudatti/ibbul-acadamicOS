"""
Ensure super admin exists (emergency CLI only — production uses /setup wizard).

Do NOT use demo credentials in production. After enterprise setup, this command
requires --force to modify the existing Super Admin.
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from apps.accounts.models import UserRole
from apps.core.setup_service import is_setup_required

User = get_user_model()


class Command(BaseCommand):
    help = 'Emergency: ensure a Super Admin exists (use /setup wizard for fresh installs).'

    def add_arguments(self, parser):
        parser.add_argument('--email', type=str, required=True, help='Super Admin email')
        parser.add_argument('--password', type=str, required=True, help='Password (min 8 chars)')
        parser.add_argument(
            '--force',
            action='store_true',
            help='Update existing Super Admin password (required if setup already complete)',
        )

    def handle(self, *args, **options):
        email = (options.get('email') or '').strip().lower()
        password = options.get('password') or ''
        force = options.get('force', False)

        if len(password) < 8:
            self.stderr.write(self.style.ERROR('Password must be at least 8 characters.'))
            return

        if not is_setup_required() and not force:
            self.stderr.write(self.style.ERROR(
                'Setup already complete. Use --force to reset an existing Super Admin, '
                'or sign in at /login and use Forgot password.'
            ))
            return

        user = User.objects.filter(email__iexact=email).first()
        if user:
            user.set_password(password)
            user.is_staff = True
            user.is_superuser = True
            user.is_active = True
            user.role = UserRole.SUPER_ADMIN
            user.save(update_fields=['password', 'is_staff', 'is_superuser', 'is_active', 'role'])
            self.stdout.write(self.style.SUCCESS(f'Super Admin updated: {email}'))
        else:
            User.objects.create_user(
                email=email,
                password=password,
                role=UserRole.SUPER_ADMIN,
                first_name='Super',
                last_name='Admin',
                is_staff=True,
                is_superuser=True,
                is_active=True,
            )
            self.stdout.write(self.style.SUCCESS(f'Super Admin created: {email}'))
