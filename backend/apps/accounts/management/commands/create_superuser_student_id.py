"""
Management command to create superuser with student ID
Usage: python manage.py create_superuser_student_id
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from getpass import getpass

User = get_user_model()


class Command(BaseCommand):
    help = 'Create a superuser with student ID format'

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('Creating superuser with Student ID...'))
        
        student_id = input('Student ID (U22/FNS/CSC/XXXX): ')
        password = getpass('Password: ')
        password_confirm = getpass('Password (again): ')
        
        if password != password_confirm:
            self.stdout.write(self.style.ERROR('Passwords do not match!'))
            return
        
        try:
            user = User.objects.create_superuser(
                student_id=student_id,
                password=password
            )
            self.stdout.write(
                self.style.SUCCESS(f'Successfully created superuser: {user.student_id}')
            )
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Error: {str(e)}'))
