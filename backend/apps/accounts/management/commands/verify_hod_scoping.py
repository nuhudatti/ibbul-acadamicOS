"""
Management command to verify HOD department scoping is working correctly.
Checks that HODs have department_fk set and that users are properly scoped.
"""
from django.core.management.base import BaseCommand
from apps.accounts.models import User, UserRole
from apps.accounts.scope import is_hod, get_hod_department_id
from apps.academics.models import Department


class Command(BaseCommand):
    help = 'Verify HOD department scoping - check HODs have department_fk and users are scoped correctly'

    def add_arguments(self, parser):
        parser.add_argument(
            '--fix',
            action='store_true',
            help='Attempt to fix issues (set department_fk for HODs missing it)',
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('=== HOD Department Scoping Verification ===\n'))
        
        # Find all HOD users
        hod_users = User.objects.filter(
            role__in=(UserRole.HOD, UserRole.DEPARTMENT_ADMIN)
        ).select_related('department_fk')
        
        self.stdout.write(f'Found {hod_users.count()} HOD/Department Admin user(s)\n')
        
        issues_found = []
        
        for hod in hod_users:
            dept_id = get_hod_department_id(hod)
            dept = getattr(hod, 'department_fk', None)
            
            self.stdout.write(f'\nHOD: {hod.email} ({hod.get_full_name()})')
            self.stdout.write(f'  Role: {hod.role}')
            self.stdout.write(f'  department_fk_id: {getattr(hod, "department_fk_id", None)}')
            self.stdout.write(f'  department_fk: {dept.name if dept else "None"} ({dept.code if dept else "N/A"})')
            self.stdout.write(f'  get_hod_department_id(): {dept_id}')
            
            if dept_id is None:
                self.stdout.write(self.style.WARNING('  ⚠️  ISSUE: HOD has no department_fk set!'))
                issues_found.append({
                    'hod': hod,
                    'issue': 'no_department',
                    'fix': 'Set department_fk in Django admin'
                })
            else:
                # Count users in this HOD's department
                dept_users = User.objects.filter(
                    department_fk_id=dept_id,
                    role=UserRole.EXAMINER
                )
                total_examiners = User.objects.filter(
                    role=UserRole.EXAMINER
                ).count()
                
                self.stdout.write(f'  Users in department: {dept_users.count()}')
                self.stdout.write(f'  Total examiners/lecturers: {total_examiners}')
                
                if dept_users.count() == total_examiners and total_examiners > 0:
                    self.stdout.write(self.style.WARNING(
                        f'  ⚠️  WARNING: All {total_examiners} examiners have same department as this HOD. '
                        f'This might be correct if all users are in the same department, or it might indicate '
                        f'that users are missing department_fk assignments.'
                    ))
                
                # Check for users without department_fk
                users_no_dept = User.objects.filter(
                    role=UserRole.EXAMINER,
                    department_fk_id__isnull=True
                )
                if users_no_dept.exists():
                    self.stdout.write(self.style.WARNING(
                        f'  ⚠️  Found {users_no_dept.count()} examiner(s)/lecturer(s) without department_fk'
                    ))
                    issues_found.append({
                        'hod': hod,
                        'issue': 'users_no_dept',
                        'count': users_no_dept.count()
                    })
        
        # Summary
        self.stdout.write('\n' + '='*60)
        if issues_found:
            self.stdout.write(self.style.WARNING(f'\nFound {len(issues_found)} issue(s):'))
            for issue in issues_found:
                if issue['issue'] == 'no_department':
                    self.stdout.write(f"  - {issue['hod'].email} has no department_fk")
                elif issue['issue'] == 'users_no_dept':
                    self.stdout.write(f"  - {issue['count']} users without department_fk")
            
            if options['fix']:
                self.stdout.write('\nAttempting to fix issues...')
                # Could add auto-fix logic here if needed
                self.stdout.write('  (Auto-fix not implemented - please set department_fk manually in Django admin)')
            else:
                self.stdout.write('\nRun with --fix to attempt fixes (currently requires manual fix in Django admin)')
        else:
            self.stdout.write(self.style.SUCCESS('\n✓ No issues found! All HODs have department_fk set.'))
        
        self.stdout.write('\n' + '='*60)
        self.stdout.write('\nTo fix HOD department assignment:')
        self.stdout.write('  1. Go to Django admin → Users')
        self.stdout.write('  2. Open the HOD user')
        self.stdout.write('  3. Set "Department (department_fk)" to their department')
        self.stdout.write('  4. Save')
        self.stdout.write('\nTo fix user department assignments:')
        self.stdout.write('  - Users created by HOD via API get department_fk automatically')
        self.stdout.write('  - For existing users: Set department_fk in Django admin or use backfill command')
