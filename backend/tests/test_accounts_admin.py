"""
Tests for Users / Accounts admin: manual add student, one-time export, user management,
staff user management (Django Admin create/edit, CSV import with faculty/department).
"""
from django.test import TestCase, Client
from django.urls import reverse
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile

User = get_user_model()


class UsersAccountsAdminTests(TestCase):
    """Test Users/Accounts hub, add student, and one-time temp password export."""

    def setUp(self):
        self.client = Client()
        self.admin = User.objects.create_user(
            email='admin@test.ibbul.edu.ng',
            password='AdminTest123',
            role='HOD',
            first_name='Admin',
            last_name='Test',
        )
        self.admin.is_staff = True
        self.admin.is_superuser = True
        self.admin.save()
        self.client.force_login(self.admin)

    def test_users_accounts_hub_requires_staff(self):
        """Hub is staff-only."""
        self.client.logout()
        resp = self.client.get(reverse('admin_users_accounts'))
        self.assertIn(resp.status_code, (302, 403))

    def test_users_accounts_hub_ok(self):
        """Staff can access Users/Accounts hub."""
        resp = self.client.get(reverse('admin_users_accounts'))
        self.assertEqual(resp.status_code, 200)
        self.assertIn(b'Add student', resp.content)
        self.assertIn(b'Import users', resp.content)
        self.assertIn(b'User management', resp.content)

    def test_users_accounts_hub_has_users_list_link(self):
        """Hub has link to Django Admin Users (create/edit lecturers, students)."""
        resp = self.client.get(reverse('admin_users_accounts'))
        self.assertEqual(resp.status_code, 200)
        self.assertIn(b'/admin/accounts/user/', resp.content)
        self.assertIn(b'Users', resp.content)

    def test_add_student_requires_staff(self):
        """Add student page is staff-only."""
        self.client.logout()
        resp = self.client.get(reverse('admin_add_student'))
        self.assertIn(resp.status_code, (302, 403))

    def test_add_student_form_renders(self):
        """Add student form loads."""
        resp = self.client.get(reverse('admin_add_student'))
        self.assertEqual(resp.status_code, 200)
        self.assertIn(b'reg_number', resp.content)
        self.assertIn(b'Add student', resp.content)

    def test_add_student_creates_user_and_export(self):
        """POST add student creates user and shows one-time download link."""
        self.assertFalse(User.objects.filter(student_id='U22/FNS/CSC/9999').exists())
        resp = self.client.post(reverse('admin_add_student'), data={
            'reg_number': 'U22/FNS/CSC/9999',
            'first_name': 'Test',
            'last_name': 'Student',
            'department': 'CSC',
            'level': '300',
        })
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(User.objects.filter(student_id='U22/FNS/CSC/9999').exists())
        user = User.objects.get(student_id='U22/FNS/CSC/9999')
        self.assertTrue(user.is_first_login)
        self.assertEqual(user.role, 'STUDENT')
        self.assertIn(b'Download one-time CSV', resp.content)


class StaffImportTests(TestCase):
    """Acceptance tests: CSV import of staff with email (no reg_number) and faculty/department."""

    def setUp(self):
        self.client = Client()
        self.admin = User.objects.create_user(
            email='admin@test.ibbul.edu.ng',
            password='AdminTest123',
            role='SUPER_ADMIN',
            first_name='Admin',
            last_name='Test',
        )
        self.admin.is_staff = True
        self.admin.is_superuser = True
        self.admin.save()
        self.client.force_login(self.admin)
        from apps.academics.models import Faculty, Department
        self.faculty = Faculty.objects.create(code='FNS', name='Faculty of Natural Sciences')
        self.dept = Department.objects.create(
            faculty=self.faculty,
            code='CSC',
            name='Computer Science',
        )

    def test_import_staff_by_email_creates_user(self):
        """CSV row with email and role EXAMINER (no reg_number) creates staff user."""
        self.assertFalse(User.objects.filter(email='lecturer@test.ibbul.edu.ng').exists())
        csv_content = b'email,first_name,last_name,role\nlecturer@test.ibbul.edu.ng,Jane,Lecturer,EXAMINER'
        f = SimpleUploadedFile('staff.csv', csv_content, content_type='text/csv')
        resp = self.client.post(reverse('admin_import_users'), data={'file': f}, follow=True)
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(User.objects.filter(email='lecturer@test.ibbul.edu.ng').exists())
        user = User.objects.get(email='lecturer@test.ibbul.edu.ng')
        self.assertEqual(user.role, 'EXAMINER')
        self.assertTrue(user.is_first_login)

    def test_import_staff_with_faculty_department_assigns_scope(self):
        """CSV row with faculty_code and department_code assigns user.faculty and user.department_fk."""
        csv_content = (
            b'email,first_name,last_name,role,faculty_code,department_code\n'
            b'hod@test.ibbul.edu.ng,Dept,HOD,DEPARTMENT_ADMIN,FNS,CSC'
        )
        f = SimpleUploadedFile('staff.csv', csv_content, content_type='text/csv')
        resp = self.client.post(reverse('admin_import_users'), data={'file': f}, follow=True)
        self.assertEqual(resp.status_code, 200)
        user = User.objects.get(email='hod@test.ibbul.edu.ng')
        self.assertEqual(user.role, 'DEPARTMENT_ADMIN')
        self.assertEqual(user.faculty_id, self.faculty.id)
        self.assertEqual(user.department_fk_id, self.dept.id)
