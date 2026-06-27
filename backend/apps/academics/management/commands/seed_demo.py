"""
Enterprise seed: 2 faculties, 3 departments, sample courses, SUPER_ADMIN, FACULTY_ADMIN,
DEPARTMENT_ADMIN, 2 EXAMINERs, 10 students.
Usage: python manage.py seed_demo
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from apps.accounts.models import UserRole
from apps.academics.models import Faculty, Department, Course, CourseAssignment

User = get_user_model()

DEFAULT_PASSWORD = 'Demo@123'


class Command(BaseCommand):
    help = 'Seed 2 faculties, 3 departments, courses, and enterprise users (SUPER_ADMIN, FACULTY_ADMIN, DEPARTMENT_ADMIN, 2 EXAMINERs, 10 students)'

    def handle(self, *args, **options):
        self.stdout.write(self.style.WARNING('Seeding enterprise demo data...'))
        self.stdout.write('=' * 60)

        # 1. Faculties
        fns, _ = Faculty.objects.get_or_create(code='FNS', defaults={'name': 'Faculty of Natural Sciences', 'is_active': True})
        fes, _ = Faculty.objects.get_or_create(code='FES', defaults={'name': 'Faculty of Engineering & Tech', 'is_active': True})
        self.stdout.write(self.style.SUCCESS('[OK] Faculties: FNS, FES'))

        # 2. Departments (2 under FNS, 1 under FES)
        csc, _ = Department.objects.get_or_create(faculty=fns, code='CSC', defaults={'name': 'Computer Science', 'is_active': True})
        mth, _ = Department.objects.get_or_create(faculty=fns, code='MTH', defaults={'name': 'Mathematics', 'is_active': True})
        eee, _ = Department.objects.get_or_create(faculty=fes, code='EEE', defaults={'name': 'Electrical/Electronic Eng.', 'is_active': True})
        self.stdout.write(self.style.SUCCESS('[OK] Departments: CSC, MTH, EEE'))

        # 3. Sample courses (per department)
        courses_data = [
            ('CSC201', 'Intro to Programming', 3, 'FIRST', '200', csc),
            ('CSC301', 'Data Structures', 3, 'FIRST', '300', csc),
            ('CSC302', 'Database Systems', 3, 'FIRST', '300', csc),
            ('MTH101', 'Calculus I', 3, 'FIRST', '100', mth),
            ('MTH201', 'Linear Algebra', 3, 'FIRST', '200', mth),
            ('EEE201', 'Circuit Analysis', 3, 'FIRST', '200', eee),
        ]
        for code, title, units, sem, level, dept in courses_data:
            Course.objects.get_or_create(
                code=code,
                defaults={
                    'title': title,
                    'credit_units': units,
                    'semester': sem,
                    'level': level,
                    'department': dept,
                    'is_active': True,
                },
            )
        self.stdout.write(self.style.SUCCESS('[OK] Courses: CSC201, CSC301, CSC302, MTH101, MTH201, EEE201'))

        # 4. SUPER_ADMIN (1)
        super_admin, created = User.objects.update_or_create(
            email='admin@ibbul.edu.ng',
            defaults={
                'first_name': 'Super',
                'last_name': 'Admin',
                'role': UserRole.SUPER_ADMIN,
                'is_staff': True,
                'is_superuser': True,
                'is_active': True,
                'is_first_login': False,
                'faculty': None,
                'department_fk': None,
            },
        )
        super_admin.set_password(DEFAULT_PASSWORD)
        super_admin.save()
        self.stdout.write(self.style.SUCCESS(f'[OK] SUPER_ADMIN: admin@ibbul.edu.ng (created={created})'))

        # 5. FACULTY_ADMIN (1) – FNS
        faculty_admin, created = User.objects.update_or_create(
            email='dean.fns@ibbul.edu.ng',
            defaults={
                'first_name': 'Dean',
                'last_name': 'FNS',
                'role': UserRole.FACULTY_ADMIN,
                'is_staff': True,
                'is_active': True,
                'is_first_login': False,
                'faculty': fns,
                'department_fk': None,
            },
        )
        faculty_admin.set_password(DEFAULT_PASSWORD)
        faculty_admin.save()
        self.stdout.write(self.style.SUCCESS(f'[OK] FACULTY_ADMIN: dean.fns@ibbul.edu.ng (created={created})'))

        # 6. DEPARTMENT_ADMIN (1) – CSC HOD
        hod, created = User.objects.update_or_create(
            email='hod.csc@ibbul.edu.ng',
            defaults={
                'first_name': 'HOD',
                'last_name': 'CSC',
                'role': UserRole.DEPARTMENT_ADMIN,
                'is_staff': True,
                'is_active': True,
                'is_first_login': False,
                'faculty': fns,
                'department_fk': csc,
                'department': 'Computer Science',
            },
        )
        hod.set_password(DEFAULT_PASSWORD)
        hod.save()
        self.stdout.write(self.style.SUCCESS(f'[OK] DEPARTMENT_ADMIN: hod.csc@ibbul.edu.ng (created={created})'))

        # 7. EXAMINERs (2) – assign to courses
        examiners_data = [
            ('lecturer1@ibbul.edu.ng', 'Lecturer', 'One', ['CSC301', 'CSC302']),
            ('lecturer2@ibbul.edu.ng', 'Lecturer', 'Two', ['MTH101']),
        ]
        for email, fn, ln, course_codes in examiners_data:
            ex, created = User.objects.update_or_create(
                email=email,
                defaults={
                    'first_name': fn,
                    'last_name': ln,
                    'role': UserRole.EXAMINER,
                    'is_staff': True,
                    'is_active': True,
                    'is_first_login': False,
                },
            )
            ex.set_password(DEFAULT_PASSWORD)
            ex.save()
            for code in course_codes:
                course = Course.objects.get(code=code)
                CourseAssignment.objects.get_or_create(examiner=ex, course=course)
            self.stdout.write(self.style.SUCCESS(f'[OK] EXAMINER: {email} (created={created})'))

        # 8. Students (10) – U22/FNS/CSC/0001–0010
        for i in range(1, 11):
            sid = f'U22/FNS/CSC/{i:04d}'
            user, created = User.objects.update_or_create(
                student_id=sid,
                defaults={
                    'email': None,
                    'first_name': f'Student',
                    'last_name': f'{i}',
                    'role': UserRole.STUDENT,
                    'department': 'Computer Science',
                    'department_fk': csc,
                    'level': '300',
                    'is_active': True,
                    'is_first_login': False,
                },
            )
            user.set_password(DEFAULT_PASSWORD)
            user.save()
        self.stdout.write(self.style.SUCCESS('[OK] Students: U22/FNS/CSC/0001–0010'))

        self.stdout.write('=' * 60)
        self.stdout.write(self.style.SUCCESS('Seed complete.'))
        self.stdout.write('')
        self.stdout.write('Login (password for all): ' + DEFAULT_PASSWORD)
        self.stdout.write('  SUPER_ADMIN:     admin@ibbul.edu.ng')
        self.stdout.write('  FACULTY_ADMIN:   dean.fns@ibbul.edu.ng')
        self.stdout.write('  DEPARTMENT_ADMIN: hod.csc@ibbul.edu.ng')
        self.stdout.write('  EXAMINER:        lecturer1@ibbul.edu.ng, lecturer2@ibbul.edu.ng')
        self.stdout.write('  STUDENT:         U22/FNS/CSC/0001 (or 0002–0010)')
