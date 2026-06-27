"""
Module 2 — Unit tests for scope enforcement.
Tests: build_scope, filter_by_scope, ScopeMiddleware, ScopePermission, scope_required.
"""
from django.test import TestCase, RequestFactory
from django.contrib.auth import get_user_model
from apps.accounts.models import UserRole
from apps.accounts.scope import (
    ScopeLevel,
    ScopeContext,
    build_scope,
    filter_by_scope,
    scope_required,
    ScopeMiddleware,
)
from apps.academics.models import Faculty, Department, Course, Result, CourseAssignment

User = get_user_model()


class BuildScopeTests(TestCase):
    """build_scope returns correct ScopeContext for each role."""

    def setUp(self):
        self.faculty = Faculty.objects.create(code='FNS', name='Faculty of Natural Sciences')
        self.dept = Department.objects.create(faculty=self.faculty, code='CSC', name='Computer Science')
        self.super_admin = User.objects.create_user(
            email='admin@ibbul.edu.ng',
            password='test',
            role=UserRole.SUPER_ADMIN,
        )
        self.super_admin.is_staff = True
        self.super_admin.save()
        self.faculty_admin = User.objects.create_user(
            email='dean@ibbul.edu.ng',
            password='test',
            role=UserRole.FACULTY_ADMIN,
            faculty=self.faculty,
        )
        self.faculty_admin.is_staff = True
        self.faculty_admin.save()
        self.dept_admin = User.objects.create_user(
            email='hod@ibbul.edu.ng',
            password='test',
            role=UserRole.DEPARTMENT_ADMIN,
            faculty=self.faculty,
            department_fk=self.dept,
        )
        self.dept_admin.is_staff = True
        self.dept_admin.save()
        self.examiner = User.objects.create_user(
            email='lecturer@ibbul.edu.ng',
            password='test',
            role=UserRole.EXAMINER,
        )
        self.examiner.is_staff = True
        self.examiner.save()
        self.student = User.objects.create_user(
            email=None,
            student_id='U22/FNS/CSC/0001',
            password='test',
            role=UserRole.STUDENT,
        )

    def test_build_scope_anonymous_none(self):
        self.assertIsNone(build_scope(None))

    def test_build_scope_super_admin_global(self):
        scope = build_scope(self.super_admin)
        self.assertIsInstance(scope, ScopeContext)
        self.assertEqual(scope.level, ScopeLevel.GLOBAL)
        self.assertIsNone(scope.faculty_id)
        self.assertIsNone(scope.department_id)

    def test_build_scope_faculty_admin(self):
        scope = build_scope(self.faculty_admin)
        self.assertEqual(scope.level, ScopeLevel.FACULTY)
        self.assertEqual(scope.faculty_id, self.faculty.pk)
        self.assertIsNone(scope.department_id)

    def test_build_scope_department_admin(self):
        scope = build_scope(self.dept_admin)
        self.assertEqual(scope.level, ScopeLevel.DEPARTMENT)
        self.assertEqual(scope.faculty_id, self.faculty.pk)
        self.assertEqual(scope.department_id, self.dept.pk)

    def test_build_scope_examiner_assigned_courses(self):
        course = Course.objects.create(
            code='CSC201',
            title='Intro',
            credit_units=3,
            semester='FIRST',
            level='200',
            department=self.dept,
        )
        CourseAssignment.objects.create(examiner=self.examiner, course=course)
        scope = build_scope(self.examiner)
        self.assertEqual(scope.level, ScopeLevel.EXAMINER)
        self.assertIn(course.pk, scope.assigned_course_ids)

    def test_build_scope_student(self):
        scope = build_scope(self.student)
        self.assertEqual(scope.level, ScopeLevel.STUDENT)
        self.assertIsNone(scope.faculty_id)
        self.assertIsNone(scope.department_id)


class FilterByScopeTests(TestCase):
    """filter_by_scope restricts querysets by user scope."""

    def setUp(self):
        self.faculty = Faculty.objects.create(code='FNS', name='Faculty of Natural Sciences')
        self.dept = Department.objects.create(faculty=self.faculty, code='CSC', name='Computer Science')
        self.faculty2 = Faculty.objects.create(code='FES', name='Faculty of Engineering')
        self.dept2 = Department.objects.create(faculty=self.faculty2, code='EEE', name='Electrical Eng')
        self.faculty_admin = User.objects.create_user(
            email='dean@ibbul.edu.ng',
            password='test',
            role=UserRole.FACULTY_ADMIN,
            faculty=self.faculty,
        )
        self.faculty_admin.is_staff = True
        self.faculty_admin.save()
        self.dept_admin = User.objects.create_user(
            email='hod@ibbul.edu.ng',
            password='test',
            role=UserRole.DEPARTMENT_ADMIN,
            faculty=self.faculty,
            department_fk=self.dept,
        )
        self.dept_admin.is_staff = True
        self.dept_admin.save()
        self.student = User.objects.create_user(
            email=None,
            student_id='U22/FNS/CSC/0001',
            password='test',
            role=UserRole.STUDENT,
        )
        self.course = Course.objects.create(
            code='CSC201',
            title='Intro',
            credit_units=3,
            semester='FIRST',
            level='200',
            department=self.dept,
        )
        self.examiner = User.objects.create_user(
            email='lecturer@ibbul.edu.ng',
            password='test',
            role=UserRole.EXAMINER,
        )
        self.examiner.is_staff = True
        self.examiner.save()
        CourseAssignment.objects.create(examiner=self.examiner, course=self.course)

    def test_filter_faculty_global_sees_all(self):
        super_user = User.objects.create_user(email='super@ibbul.edu.ng', password='x', role=UserRole.SUPER_ADMIN)
        super_user.is_staff = True
        super_user.save()
        qs = Faculty.objects.all()
        filtered = filter_by_scope(qs, super_user)
        self.assertEqual(filtered.count(), 2)

    def test_filter_faculty_faculty_admin_sees_own(self):
        qs = Faculty.objects.all()
        filtered = filter_by_scope(qs, self.faculty_admin)
        self.assertEqual(filtered.count(), 1)
        self.assertEqual(filtered.get().pk, self.faculty.pk)

    def test_filter_department_department_admin_sees_own(self):
        qs = Department.objects.all()
        filtered = filter_by_scope(qs, self.dept_admin)
        self.assertEqual(filtered.count(), 1)
        self.assertEqual(filtered.get().pk, self.dept.pk)

    def test_filter_course_examiner_sees_assigned_only(self):
        course2 = Course.objects.create(
            code='CSC301',
            title='DS',
            credit_units=3,
            semester='FIRST',
            level='300',
            department=self.dept,
        )
        qs = Course.objects.all()
        filtered = filter_by_scope(qs, self.examiner)
        self.assertEqual(filtered.count(), 1)
        self.assertEqual(filtered.get().pk, self.course.pk)

    def test_filter_result_student_sees_own_only(self):
        Result.objects.create(
            student=self.student,
            course=self.course,
            score=75,
            grade='B',
            grade_point=4.0,
            session='2023/2024',
            semester='FIRST',
            status='PENDING',
        )
        other_student = User.objects.create_user(
            email=None,
            student_id='U22/FNS/CSC/0002',
            password='test',
            role=UserRole.STUDENT,
        )
        Result.objects.create(
            student=other_student,
            course=self.course,
            score=80,
            grade='A',
            grade_point=5.0,
            session='2023/2024',
            semester='FIRST',
            status='PENDING',
        )
        qs = Result.objects.all()
        filtered = filter_by_scope(qs, self.student)
        self.assertEqual(filtered.count(), 1)
        self.assertEqual(filtered.get().student_id, self.student.pk)


class ScopeMiddlewareTests(TestCase):
    """ScopeMiddleware sets request.scope for authenticated user."""

    def setUp(self):
        self.factory = RequestFactory()
        self.user = User.objects.create_user(
            email='admin@ibbul.edu.ng',
            password='test',
            role=UserRole.SUPER_ADMIN,
        )
        self.user.is_staff = True
        self.user.save()

    def test_middleware_sets_scope_authenticated(self):
        request = self.factory.get('/')
        request.user = self.user
        middleware = ScopeMiddleware(lambda r: r)
        response = middleware(request)
        self.assertTrue(hasattr(request, 'scope'))
        self.assertIsNotNone(request.scope)
        self.assertEqual(request.scope.level, ScopeLevel.GLOBAL)

    def test_middleware_scope_none_anonymous(self):
        request = self.factory.get('/')
        request.user = type('User', (), {'is_authenticated': False})()
        middleware = ScopeMiddleware(lambda r: r)
        middleware(request)
        self.assertTrue(hasattr(request, 'scope'))
        self.assertIsNone(request.scope)


class ScopePermissionTests(TestCase):
    """DRF ScopePermission: has_permission and has_object_permission."""

    def setUp(self):
        from apps.academics.permissions import ScopePermission
        self.ScopePermission = ScopePermission
        self.permission = ScopePermission()
        self.factory = RequestFactory()
        self.faculty = Faculty.objects.create(code='FNS', name='Faculty of Natural Sciences')
        self.dept = Department.objects.create(faculty=self.faculty, code='CSC', name='Computer Science')
        self.course = Course.objects.create(
            code='CSC201',
            title='Intro',
            credit_units=3,
            semester='FIRST',
            level='200',
            department=self.dept,
        )
        self.student = User.objects.create_user(
            email=None,
            student_id='U22/FNS/CSC/0001',
            password='test',
            role=UserRole.STUDENT,
        )
        self.result = Result.objects.create(
            student=self.student,
            course=self.course,
            score=75,
            grade='B',
            grade_point=4.0,
            session='2023/2024',
            semester='FIRST',
            status='PENDING',
        )
        self.examiner = User.objects.create_user(
            email='lecturer@ibbul.edu.ng',
            password='test',
            role=UserRole.EXAMINER,
        )
        self.examiner.is_staff = True
        self.examiner.save()
        CourseAssignment.objects.create(examiner=self.examiner, course=self.course)

    def test_has_permission_requires_authenticated(self):
        request = self.factory.get('/')
        request.user = type('User', (), {'is_authenticated': False})()
        request.scope = None
        view = type('View', (), {'scope_level': ScopeLevel.DEPARTMENT})()
        self.assertFalse(self.permission.has_permission(request, view))

    def test_has_permission_scope_level_ok(self):
        request = self.factory.get('/')
        request.user = self.examiner
        request.scope = build_scope(self.examiner)
        view = type('View', (), {'scope_level': ScopeLevel.EXAMINER})()
        self.assertTrue(self.permission.has_permission(request, view))

    def test_has_object_permission_student_own_result(self):
        request = self.factory.get('/')
        request.user = self.student
        request.scope = build_scope(self.student)
        view = type('View', (), {})()
        self.assertTrue(self.permission.has_object_permission(request, view, self.result))

    def test_has_object_permission_student_other_result_denied(self):
        other_student = User.objects.create_user(
            email=None,
            student_id='U22/FNS/CSC/0002',
            password='test',
            role=UserRole.STUDENT,
        )
        other_result = Result.objects.create(
            student=other_student,
            course=self.course,
            score=80,
            grade='A',
            grade_point=5.0,
            session='2023/2024',
            semester='FIRST',
            status='PENDING',
        )
        request = self.factory.get('/')
        request.user = self.student
        request.scope = build_scope(self.student)
        view = type('View', (), {})()
        self.assertFalse(self.permission.has_object_permission(request, view, other_result))
