"""
Backfill department_fk_id for existing students from their reg number (e.g. U22/FNS/CSC/0001 -> CSC).
Makes student logins show in HOD department-scoped audit.

Usage:
  python manage.py backfill_student_departments
  python manage.py backfill_student_departments --dry-run
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from apps.accounts.models import UserRole
from apps.academics.models import Department
from common.validators.student_id_validator import department_code_from_student_id

User = get_user_model()


class Command(BaseCommand):
    help = 'Set department_fk_id for students who have none, using reg number (e.g. U22/FNS/CSC/0001 -> CSC).'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Only report what would be updated, do not save.',
        )

    def handle(self, *args, **options):
        dry_run = options.get('dry_run', False)
        students = User.objects.filter(role=UserRole.STUDENT).filter(
            student_id__isnull=False
        ).exclude(student_id='')
        updated = 0
        skipped_no_dept = 0
        skipped_no_match = 0
        for user in students:
            if getattr(user, 'department_fk_id', None) is not None:
                skipped_no_dept += 1
                continue
            code = department_code_from_student_id(user.student_id or '')
            if not code:
                continue
            dept = Department.objects.select_related('faculty').filter(code=code).first()
            if not dept:
                skipped_no_match += 1
                continue
            if dry_run:
                self.stdout.write(
                    self.style.WARNING(f'  Would set {user.student_id} -> department {dept.code} ({dept.name})')
                )
            else:
                user.department_fk = dept
                user.faculty = dept.faculty
                user.department = dept.name or user.department or ''
                user.save(update_fields=['department_fk', 'faculty', 'department'])
                self.stdout.write(
                    self.style.SUCCESS(f'  Set {user.student_id} -> {dept.code} ({dept.name})')
                )
            updated += 1
        if dry_run:
            self.stdout.write(
                self.style.WARNING(f'\nDry run: would update {updated} student(s).'))
        else:
            self.stdout.write(
                self.style.SUCCESS(f'\nUpdated {updated} student(s).'))
        if skipped_no_dept or skipped_no_match:
            self.stdout.write(
                f'  (Skipped: already had dept={skipped_no_dept}, no Dept match for code={skipped_no_match})')
