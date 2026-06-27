"""
Fix students whose department_fk does not match the department code in their registration number.
E.g. U22/FNS/CSC/1100 stored under GLG (Geology) -> set department to CSC (Computer Science).

Usage:
  python manage.py fix_student_department_mismatch
  python manage.py fix_student_department_mismatch --dry-run
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from apps.accounts.models import UserRole
from apps.academics.models import Department
from common.validators.student_id_validator import department_code_from_student_id

User = get_user_model()


class Command(BaseCommand):
    help = (
        'Correct department_fk for students where reg number department code does not match '
        'current department (e.g. U22/FNS/CSC/1100 under Geology -> set to Computer Science).'
    )

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
        ).exclude(student_id='').select_related('department_fk', 'department_fk__faculty')
        updated = 0
        skipped_match = 0
        skipped_no_code = 0
        skipped_no_dept = 0
        for user in students:
            reg_code = department_code_from_student_id(user.student_id or '')
            if not reg_code:
                skipped_no_code += 1
                continue
            current_code = getattr(user.department_fk, 'code', None) if user.department_fk else None
            if current_code == reg_code:
                skipped_match += 1
                continue
            dept = Department.objects.filter(code=reg_code).select_related('faculty').first()
            if not dept:
                skipped_no_dept += 1
                self.stdout.write(
                    self.style.WARNING(f'  No Department with code {reg_code} for {user.student_id}')
                )
                continue
            if dry_run:
                self.stdout.write(
                    self.style.WARNING(
                        f'  Would correct {user.student_id}: '
                        f'{current_code or "None"} -> {dept.code} ({dept.name})'
                    )
                )
            else:
                user.department_fk = dept
                user.faculty = dept.faculty
                user.department = dept.name or user.department or ''
                user.save(update_fields=['department_fk', 'faculty', 'department'])
                self.stdout.write(
                    self.style.SUCCESS(
                        f'  Corrected {user.student_id} -> {dept.code} ({dept.name})'
                    )
                )
            updated += 1
        if dry_run:
            self.stdout.write(
                self.style.WARNING(f'\nDry run: would correct {updated} student(s).')
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(f'\nCorrected {updated} student(s).')
            )
        if skipped_match or skipped_no_code or skipped_no_dept:
            self.stdout.write(
                f'  (Skipped: already correct={skipped_match}, no reg code={skipped_no_code}, '
                f'no Dept for code={skipped_no_dept})'
            )
