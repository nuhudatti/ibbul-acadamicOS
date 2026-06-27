"""
Seed HOD (Department Admin) accounts from CSV or JSON.
Creates Faculty/Department if missing, then creates or updates HOD user linked to department.
Example row: hod_email, hod_name, role, faculty_code, faculty_name, department_code, department_name

Usage:
  python manage.py seed_hod
  python manage.py seed_hod --file=hod_seed.csv
  python manage.py seed_hod --file=hod_seed.json
  python manage.py seed_hod --dry-run

CSV format (header row required):
  hod_email,hod_name,role,faculty_code,faculty_name,department_code,department_name

JSON format:
  [{"hod_email": "hod.csc@ibbul.edu.ng", "hod_name": "HOD CSC", "role": "Department Admin (HOD)",
    "faculty": "FNS - Faculty of Natural Sciences", "department_code": "CSC", "department_name": "Computer Science"}]
"""
import csv
import json
import os
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from apps.accounts.models import UserRole
from apps.academics.models import Faculty, Department

User = get_user_model()
DEFAULT_PASSWORD = os.environ.get('HOD_SEED_DEFAULT_PASSWORD', 'TempPass@Change1')


def parse_faculty_code_and_name(s: str):
    """Parse 'FNS - Faculty of Natural Sciences' -> ('FNS', 'Faculty of Natural Sciences')."""
    s = (s or '').strip()
    if not s:
        return None, None
    if ' - ' in s:
        code, name = s.split(' - ', 1)
        return code.strip().upper()[:20], name.strip()[:200]
    if len(s) <= 10 and s.isupper():
        return s[:20], s
    return s[:20].upper(), s[:200]


class Command(BaseCommand):
    help = 'Seed HOD accounts from CSV or JSON. Creates Faculty/Department if missing.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--file',
            type=str,
            default=None,
            help='Path to CSV or JSON file. If omitted, seeds example HOD (hod.csc@ibbul.edu.ng → CSC, FNS).',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Do not create or update; only report what would be done.',
        )

    def handle(self, *args, **options):
        file_path = options.get('file')
        dry_run = options.get('dry_run', False)
        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN — no changes will be saved.'))

        if file_path:
            if not os.path.isfile(file_path):
                self.stdout.write(self.style.ERROR(f'File not found: {file_path}'))
                return
            rows = self._load_from_file(file_path)
        else:
            rows = [{
                'hod_email': 'hod.csc@ibbul.edu.ng',
                'hod_name': 'HOD CSC',
                'role': 'Department Admin (HOD)',
                'faculty': 'FNS - Faculty of Natural Sciences',
                'department_code': 'CSC',
                'department_name': 'Computer Science',
            }]

        for row in rows:
            self._process_row(row, dry_run)

        self.stdout.write(self.style.SUCCESS('Seed HOD complete.'))

    def _load_from_file(self, path: str) -> list:
        ext = path.lower().split('.')[-1]
        with open(path, 'r', encoding='utf-8') as f:
            if ext == 'json':
                data = json.load(f)
                return data if isinstance(data, list) else [data]
            reader = csv.DictReader(f)
            rows = list(reader)
            if not rows:
                return []
            out = []
            for r in rows:
                row = {}
                for k, v in r.items():
                    row[k.strip().lower().replace(' ', '_')] = v.strip() if isinstance(v, str) else v
                # Map CSV columns
                if 'hod_email' not in row and 'hodemail' in row:
                    row['hod_email'] = row['hodemail']
                if 'hod_name' not in row and 'hodname' in row:
                    row['hod_name'] = row['hodname']
                if 'faculty' not in row and 'faculty_code' in row:
                    fc, fn = row.get('faculty_code'), row.get('faculty_name', '')
                    row['faculty'] = f"{fc} - {fn}" if fn else fc
                if 'department_code' not in row and 'departmentcode' in row:
                    row['department_code'] = row['departmentcode']
                if 'department_name' not in row and 'departmentname' in row:
                    row['department_name'] = row['departmentname']
                out.append(row)
            return out

    def _process_row(self, row: dict, dry_run: bool):
        hod_email = (row.get('hod_email') or row.get('email') or '').strip()
        if not hod_email:
            self.stdout.write(self.style.WARNING('Skipping row: missing hod_email'))
            return
        hod_name = (row.get('hod_name') or row.get('hod_name') or 'HOD').strip()
        parts = hod_name.split(None, 1)
        first_name = parts[0] if parts else 'HOD'
        last_name = parts[1] if len(parts) > 1 else 'Admin'

        faculty_str = (row.get('faculty') or '').strip() or (row.get('faculty_code') or '')
        faculty_code, faculty_name = parse_faculty_code_and_name(faculty_str)
        if not faculty_code:
            faculty_code = 'FNS'
            faculty_name = faculty_name or 'Faculty of Natural Sciences'

        dept_code = (row.get('department_code') or '').strip().upper()[:20]
        dept_name = (row.get('department_name') or '').strip()[:200]
        if not dept_code:
            self.stdout.write(self.style.WARNING(f'Skipping {hod_email}: missing department_code'))
            return

        if dry_run:
            self.stdout.write(
                f'[DRY RUN] Would create/update: Faculty {faculty_code}, Dept {dept_code}, HOD {hod_email}'
            )
            return

        faculty, _ = Faculty.objects.get_or_create(
            code=faculty_code,
            defaults={'name': faculty_name, 'is_active': True},
        )
        department, _ = Department.objects.get_or_create(
            faculty=faculty,
            code=dept_code,
            defaults={'name': dept_name, 'is_active': True},
        )

        user, created = User.objects.update_or_create(
            email=hod_email,
            defaults={
                'first_name': first_name,
                'last_name': last_name,
                'role': UserRole.DEPARTMENT_ADMIN,
                'is_staff': True,
                'is_active': True,
                'is_first_login': True,
                'faculty': faculty,
                'department_fk': department,
                'department': dept_name,
            },
        )
        user.set_password(DEFAULT_PASSWORD)
        user.save()
        self.stdout.write(
            self.style.SUCCESS(
                f'[OK] HOD: {hod_email} -> {department.code} ({department.name}), Faculty {faculty.code} (created={created})'
            )
        )
