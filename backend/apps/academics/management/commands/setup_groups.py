"""
Management command to create groups and assign permissions
Run: python manage.py setup_groups
Enterprise: Student, Examiner, HOD (Department Admin), Faculty Admin, Admin (Super Admin).
Accounts permissions (view/add/change/bulk_import users scoped) assigned to HOD, Faculty Admin, Admin.
"""
from django.core.management.base import BaseCommand
from django.contrib.auth.models import Group, Permission
from django.contrib.contenttypes.models import ContentType
from apps.academics.models import Result, Course, GPA
from apps.accounts.models import User


def _get_accounts_user_permissions():
    """Accounts.user custom permissions: view/add/change/bulk_import scoped."""
    user_ct = ContentType.objects.get_for_model(User)
    codenames = ['view_user_scoped', 'add_user_scoped', 'change_user_scoped', 'bulk_import_users']
    return list(Permission.objects.filter(content_type=user_ct, codename__in=codenames))


class Command(BaseCommand):
    help = 'Creates user groups and assigns permissions for the Result Management System (enterprise)'

    def handle(self, *args, **kwargs):
        self.stdout.write(self.style.WARNING('Setting up Groups and Permissions (Enterprise)...'))
        self.stdout.write('=' * 60)
        
        # Create groups: Student, Examiner, HOD, Faculty Admin, Admin
        self._create_student_group()
        self._create_examiner_group()
        self._create_hod_group()
        self._create_faculty_admin_group()
        self._create_admin_group()
        
        self.stdout.write('=' * 60)
        self.stdout.write(self.style.SUCCESS('[SUCCESS] All groups and permissions configured!'))
        self.stdout.write('')
        self.stdout.write('Next steps:')
        self.stdout.write('  - Run: python manage.py migrate (if 0008_add_user_management_permissions not applied)')
        self.stdout.write('  - Users are auto-assigned to groups via signals (role -> group)')
        self.stdout.write('')
    
    def _create_student_group(self):
        """Student: VIEW-ONLY access to own results"""
        group, created = Group.objects.get_or_create(name='Student')
        
        if created:
            self.stdout.write(self.style.SUCCESS('[CREATED] Student group'))
        else:
            self.stdout.write('[EXISTS] Student group')
            group.permissions.clear()  # Clear existing permissions
        
        # Get permissions
        permissions = [
            # Can view own results only
            Permission.objects.get(codename='view_own_result', content_type__model='result'),
            # Can view courses
            Permission.objects.get(codename='view_course', content_type__model='course'),
            # Can view GPA
            Permission.objects.get(codename='view_gpa', content_type__model='gpa'),
        ]
        
        group.permissions.set(permissions)
        self.stdout.write(f'  Assigned {len(permissions)} permissions to Student group')
        for perm in permissions:
            self.stdout.write(f'    - {perm.codename}')
    
    def _create_examiner_group(self):
        """Examiner: Can upload and view results"""
        group, created = Group.objects.get_or_create(name='Examiner')
        
        if created:
            self.stdout.write(self.style.SUCCESS('[CREATED] Examiner group'))
        else:
            self.stdout.write('[EXISTS] Examiner group')
            group.permissions.clear()
        
        permissions = [
            # Can upload results
            Permission.objects.get(codename='upload_result', content_type__model='result'),
            # Can add results
            Permission.objects.get(codename='add_result', content_type__model='result'),
            # Can view all results
            Permission.objects.get(codename='view_all_results', content_type__model='result'),
            # Can view specific result
            Permission.objects.get(codename='view_result', content_type__model='result'),
            # Can change results (before approval)
            Permission.objects.get(codename='change_result', content_type__model='result'),
            # Can view courses
            Permission.objects.get(codename='view_course', content_type__model='course'),
            # Can calculate GPA
            Permission.objects.get(codename='calculate_gpa', content_type__model='gpa'),
            Permission.objects.get(codename='view_gpa', content_type__model='gpa'),
        ]
        
        group.permissions.set(permissions)
        self.stdout.write(f'  Assigned {len(permissions)} permissions to Examiner group')
        for perm in permissions:
            self.stdout.write(f'    - {perm.codename}')
    
    def _create_hod_group(self):
        """Department Admin (HOD): department-scoped result, course, user management."""
        group, created = Group.objects.get_or_create(name='HOD')
        
        if created:
            self.stdout.write(self.style.SUCCESS('[CREATED] HOD group'))
        else:
            self.stdout.write('[EXISTS] HOD group')
            group.permissions.clear()
        
        permissions = [
            # Result
            Permission.objects.get(codename='upload_result', content_type__model='result'),
            Permission.objects.get(codename='add_result', content_type__model='result'),
            Permission.objects.get(codename='view_all_results', content_type__model='result'),
            Permission.objects.get(codename='view_result', content_type__model='result'),
            Permission.objects.get(codename='change_result', content_type__model='result'),
            Permission.objects.get(codename='approve_result', content_type__model='result'),
            Permission.objects.get(codename='delete_result', content_type__model='result'),
            # Course
            Permission.objects.get(codename='view_course', content_type__model='course'),
            Permission.objects.get(codename='add_course', content_type__model='course'),
            Permission.objects.get(codename='change_course', content_type__model='course'),
            # GPA
            Permission.objects.get(codename='calculate_gpa', content_type__model='gpa'),
            Permission.objects.get(codename='view_gpa', content_type__model='gpa'),
            Permission.objects.get(codename='change_gpa', content_type__model='gpa'),
        ]
        accounts_perms = _get_accounts_user_permissions()
        if accounts_perms:
            permissions.extend(accounts_perms)
        
        group.permissions.set(permissions)
        self.stdout.write(f'  Assigned {len(permissions)} permissions to HOD group')
        for perm in permissions:
            self.stdout.write(f'    - {perm.codename}')
    
    def _create_faculty_admin_group(self):
        """Faculty Admin (Dean): faculty-scoped result, course, user management."""
        group, created = Group.objects.get_or_create(name='Faculty Admin')
        
        if created:
            self.stdout.write(self.style.SUCCESS('[CREATED] Faculty Admin group'))
        else:
            self.stdout.write('[EXISTS] Faculty Admin group')
            group.permissions.clear()
        
        # Same permission set as HOD (scope enforced in views/admin by faculty_id)
        permissions = [
            Permission.objects.get(codename='upload_result', content_type__model='result'),
            Permission.objects.get(codename='add_result', content_type__model='result'),
            Permission.objects.get(codename='view_all_results', content_type__model='result'),
            Permission.objects.get(codename='view_result', content_type__model='result'),
            Permission.objects.get(codename='change_result', content_type__model='result'),
            Permission.objects.get(codename='approve_result', content_type__model='result'),
            Permission.objects.get(codename='delete_result', content_type__model='result'),
            Permission.objects.get(codename='view_course', content_type__model='course'),
            Permission.objects.get(codename='add_course', content_type__model='course'),
            Permission.objects.get(codename='change_course', content_type__model='course'),
            Permission.objects.get(codename='calculate_gpa', content_type__model='gpa'),
            Permission.objects.get(codename='view_gpa', content_type__model='gpa'),
            Permission.objects.get(codename='change_gpa', content_type__model='gpa'),
        ]
        accounts_perms = _get_accounts_user_permissions()
        if accounts_perms:
            permissions.extend(accounts_perms)
        
        group.permissions.set(permissions)
        self.stdout.write(f'  Assigned {len(permissions)} permissions to Faculty Admin group')
        for perm in permissions:
            self.stdout.write(f'    - {perm.codename}')
    
    def _create_admin_group(self):
        """Super Admin: FULL ACCESS (result, course, GPA, accounts user management)."""
        group, created = Group.objects.get_or_create(name='Admin')
        
        if created:
            self.stdout.write(self.style.SUCCESS('[CREATED] Admin group'))
        else:
            self.stdout.write('[EXISTS] Admin group')
            group.permissions.clear()
        
        result_ct = ContentType.objects.get_for_model(Result)
        course_ct = ContentType.objects.get_for_model(Course)
        gpa_ct = ContentType.objects.get_for_model(GPA)
        user_ct = ContentType.objects.get_for_model(User)
        
        permissions = list(Permission.objects.filter(
            content_type__in=[result_ct, course_ct, gpa_ct, user_ct]
        ))
        
        group.permissions.set(permissions)
        self.stdout.write(f'  Assigned {len(permissions)} permissions (FULL ACCESS) to Admin group')
