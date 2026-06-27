"""
Tests for result upload: unknown reg_number and unknown course are rejected.
Students and courses are never created during upload (source of truth: existing data).
"""
from decimal import Decimal
from django.test import TestCase
from django.contrib.auth import get_user_model
from apps.academics.models import Course, Result, ResultUploadBatch, ResultRow, Faculty, Department
from apps.academics.services import ResultUploadService
from apps.accounts.models import UserRole

User = get_user_model()


class ResultUploadValidationTests(TestCase):
    """Unknown reg_number and unknown course must be rejected; no student/course creation."""

    def setUp(self):
        self.faculty = Faculty.objects.create(code='FNS', name='Faculty of Natural Sciences')
        self.dept = Department.objects.create(faculty=self.faculty, code='CSC', name='Computer Science')
        self.course = Course.objects.create(
            code='CSC301',
            title='Data Structures',
            credit_units=3,
            semester='FIRST',
            level='300',
            is_active=True,
        )
        self.student = User.objects.create_user(
            email=None,
            student_id='U22/FNS/CSC/0001',
            password='testpass',
            role=UserRole.STUDENT,
            first_name='Test',
            last_name='Student',
        )
        self.uploader = User.objects.create_user(
            email='lecturer@test.ibbul.edu.ng',
            password='testpass',
            role=UserRole.HOD,
            first_name='Lecturer',
            last_name='User',
        )
        self.uploader.is_staff = True
        self.uploader.save()

    def test_unknown_reg_number_rejected(self):
        """Row with reg_number not in students table is rejected (no student created)."""
        with self.assertRaises(ValueError) as ctx:
            ResultUploadService.get_student('U99/XXX/YYY/9999')
        self.assertIn('not found', str(ctx.exception))
        self.assertIn('student', str(ctx.exception).lower())
        self.assertEqual(User.objects.filter(student_id='U99/XXX/YYY/9999').count(), 0)

    def test_unknown_course_rejected(self):
        """Row with course_code not in catalogue is rejected (no course created)."""
        with self.assertRaises(ValueError) as ctx:
            ResultUploadService.validate_course('XYZ999')
        self.assertIn('not found', str(ctx.exception))
        self.assertIn('course', str(ctx.exception).lower())
        self.assertEqual(Course.objects.filter(code='XYZ999').count(), 0)

    def test_batch_processing_rejects_unknown_reg_number(self):
        """process_upload_batch rejects row with unknown reg_number and records error in ResultRow."""
        rows_data = [
            {
                'student_id': 'U99/XXX/YYY/9999',
                'course_code': 'CSC301',
                'score': 75,
                'session': '2023/2024',
                'semester': 'FIRST',
            },
        ]
        batch, report_failed = ResultUploadService.process_upload_batch(
            filename='test.csv',
            rows_data=rows_data,
            uploaded_by=self.uploader,
            session='2023/2024',
            semester='FIRST',
        )
        self.assertEqual(batch.success_count, 0)
        self.assertEqual(batch.error_count, 1)
        self.assertEqual(len(report_failed), 1)
        self.assertIn('not in the system', report_failed[0]['error_message'])
        error_row = ResultRow.objects.get(batch=batch, line_no=1)
        self.assertEqual(error_row.status, ResultRow.RowStatus.ERROR)
        self.assertEqual(Result.objects.count(), 0)

    def test_batch_processing_rejects_unknown_course(self):
        """process_upload_batch rejects row with unknown course_code and records error in ResultRow."""
        rows_data = [
            {
                'student_id': 'U22/FNS/CSC/0001',
                'course_code': 'XYZ999',
                'score': 75,
                'session': '2023/2024',
                'semester': 'FIRST',
            },
        ]
        batch, report_failed = ResultUploadService.process_upload_batch(
            filename='test.csv',
            rows_data=rows_data,
            uploaded_by=self.uploader,
            session='2023/2024',
            semester='FIRST',
        )
        self.assertEqual(batch.success_count, 0)
        self.assertEqual(batch.error_count, 1)
        self.assertIn('not in the catalogue', report_failed[0]['error_message'])
        error_row = ResultRow.objects.get(batch=batch, line_no=1)
        self.assertEqual(error_row.status, ResultRow.RowStatus.ERROR)
        self.assertEqual(Result.objects.count(), 0)

    def test_batch_processing_valid_row_creates_result(self):
        """Valid row creates Result and ResultRow (ATTACHED)."""
        rows_data = [
            {
                'student_id': 'U22/FNS/CSC/0001',
                'course_code': 'CSC301',
                'score': 75,
                'session': '2023/2024',
                'semester': 'FIRST',
            },
        ]
        batch, report_failed = ResultUploadService.process_upload_batch(
            filename='test.csv',
            rows_data=rows_data,
            uploaded_by=self.uploader,
            session='2023/2024',
            semester='FIRST',
        )
        self.assertEqual(batch.success_count, 1)
        self.assertEqual(batch.error_count, 0)
        self.assertEqual(len(report_failed), 0)
        result = Result.objects.get(student=self.student, course=self.course, session='2023/2024', semester='FIRST')
        self.assertEqual(result.status, 'PENDING')
        row = ResultRow.objects.get(batch=batch, line_no=1)
        self.assertEqual(row.status, ResultRow.RowStatus.ATTACHED)
        self.assertEqual(row.result_id, result.id)
