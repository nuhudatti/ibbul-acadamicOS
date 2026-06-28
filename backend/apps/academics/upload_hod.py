"""
HOD Upload API — validate / preview / submit using the same IBBUL parsers as the main Result Checker.
Supports university wide-format Excel (Untitled.xls style), CSV, and flat row formats.
"""
import hashlib
import json
from decimal import Decimal
from typing import List, Dict, Optional

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from django.db import transaction
from django.utils import timezone

from .models import Result, ResultUploadBatch, ResultRow, Course, Department, SemesterSummary
from .ibbul_format import MANUAL_COURSE_LINE_FORMAT, MANUAL_SUMMARY_FORMAT
from .services import ResultUploadService, get_course_for_upload, GPACalculationService
from apps.accounts.models import User, UserRole
from apps.accounts.audit import log_audit
from apps.accounts.models import AuditLog
from apps.accounts.scope import is_super_admin, is_hod, get_hod_department_id, can_manage_department_results


def _hod_department(user) -> Optional[Department]:
    dept_id = get_hod_department_id(user)
    if dept_id:
        return Department.objects.filter(pk=dept_id).first()
    return getattr(user, 'department_fk', None)


def _parse_and_validate(file, session: str, semester: str, department: Optional[Department]) -> tuple:
    """Parse with IBBUL parsers then validate. Returns (rows_data, validation_report, summaries)."""
    rows_data, summaries = ResultUploadService.parse_upload_from_uploaded_file_with_summaries(
        file, session, semester
    )
    if not rows_data:
        raise ValueError(
            'No result rows found in file. Use the official IBBUL university Excel format '
            '(MATRIC.NO column with course columns) or a CSV with student_id, course_code, score.'
        )
    dept_id = department.id if department else None
    validation_report = ResultUploadService.validate_parsed_rows(
        rows_data, session, semester, department_id=dept_id
    )
    return rows_data, validation_report, summaries


class HODUploadValidateView(APIView):
    """POST /api/academics/hod/upload/validate/"""
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        user = request.user
        if not can_manage_department_results(user):
            return Response(
                {'error': 'Only HOD/Department Admin can upload results. Assign your department in profile.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        department = _hod_department(user)
        if not is_super_admin(user) and not department:
            return Response(
                {'error': 'HOD must be assigned to a department. Set Department in your profile.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        file = request.FILES.get('file')
        session = (request.data.get('session') or '').strip()
        semester = (request.data.get('semester') or '').strip()
        if not file:
            return Response({'error': 'File is required'}, status=status.HTTP_400_BAD_REQUEST)
        if not session or not semester:
            return Response({'error': 'Session and semester are required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            rows_data, validation_report, summaries = _parse_and_validate(file, session, semester, department)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        valid_count = sum(1 for r in validation_report if r.get('valid'))
        invalid_count = len(validation_report) - valid_count
        detected_session, detected_semester = ResultUploadService.detect_upload_session_semester(file)

        return Response({
            'total_rows': len(validation_report),
            'valid_rows': valid_count,
            'invalid_rows': invalid_count,
            'valid': invalid_count == 0 and valid_count > 0,
            'validation_report': validation_report,
            'file_checksum': self._checksum(file),
            'parse_format': 'ibbul_university',
            'parsed_row_count': len(rows_data),
            'detected_session': detected_session,
            'detected_semester': detected_semester,
            'session_mismatch': bool(
                detected_session and session and detected_session.strip() != session.strip()
            ),
            'semester_mismatch': bool(
                detected_semester and semester and detected_semester.strip().upper() != semester.strip().upper()
            ),
        })

    def _checksum(self, file) -> str:
        file.seek(0)
        content = file.read()
        file.seek(0)
        return hashlib.sha256(content).hexdigest()


class HODUploadPreviewView(APIView):
    """POST /api/academics/hod/upload/preview/"""
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        user = request.user
        if not can_manage_department_results(user):
            return Response({'error': 'Only HOD/Department Admin can upload results'}, status=status.HTTP_403_FORBIDDEN)

        department = _hod_department(user)
        file = request.FILES.get('file')
        session = (request.data.get('session') or '').strip()
        semester = (request.data.get('semester') or '').strip()
        if not file:
            return Response({'error': 'File is required'}, status=status.HTTP_400_BAD_REQUEST)

        validator = HODUploadValidateView()
        try:
            rows_data, validation_report, _ = _parse_and_validate(file, session, semester, department)
            preview_report = validation_report[:10]
            return Response({
                'preview_rows': [r.get('_parsed', {}) for r in preview_report],
                'validation_report': preview_report,
                'total_rows': len(validation_report),
                'preview_count': len(preview_report),
            })
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class HODUploadSubmitView(APIView):
    """POST /api/academics/hod/upload/submit/"""
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        user = request.user
        if not can_manage_department_results(user):
            return Response({'error': 'Only HOD/Department Admin can upload results'}, status=status.HTTP_403_FORBIDDEN)

        department = _hod_department(user)
        if not is_super_admin(user) and not department:
            return Response(
                {'error': 'HOD must be assigned to a department.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        file = request.FILES.get('file')
        session = (request.data.get('session') or '').strip()
        semester = (request.data.get('semester') or '').strip()
        if not file or not session or not semester:
            return Response({'error': 'File, session, and semester are required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            rows_data, validation_report, summaries = _parse_and_validate(file, session, semester, department)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        valid_rows = [r for r in validation_report if r.get('valid')]
        invalid_rows = [r for r in validation_report if not r.get('valid')]

        if not valid_rows:
            return Response(
                {'error': 'No valid rows to submit', 'validation_report': validation_report},
                status=status.HTTP_400_BAD_REQUEST,
            )

        file_checksum = HODUploadValidateView()._checksum(file)
        dept_id = department.id if department else None

        with transaction.atomic():
            batch = ResultUploadBatch.objects.create(
                filename=file.name,
                uploaded_by=user,
                department=department,
                faculty=department.faculty if department else None,
                status=ResultUploadBatch.Status.COMPLETED,
                session=session,
                semester=semester,
                success_count=0,
                error_count=len(invalid_rows),
                completed_at=timezone.now(),
            )

            created_results: List[int] = []
            submit_errors: List[str] = []
            for row_data in valid_rows:
                parsed = row_data.get('_parsed') or {}
                matric_no = row_data['matric_no']
                course_code = row_data['course_code']
                score = Decimal(str(row_data['score']))
                session_val = session.strip()
                semester_val = semester.strip().upper()
                grade = (parsed.get('grade') or row_data.get('grade') or '').strip().upper()
                if grade not in ('A', 'B', 'C', 'D', 'E', 'F'):
                    grade = ''

                try:
                    student = ResultUploadService.get_student(matric_no)
                    course = get_course_for_upload(course_code, department_id=dept_id)
                    if not course:
                        submit_errors.append(f'{matric_no}/{course_code}: course not found')
                        continue

                    if department and not course.department_id:
                        course.department = department
                        course.save(update_fields=['department'])

                    result, created = Result.objects.get_or_create(
                        student=student,
                        course=course,
                        session=session_val,
                        semester=semester_val,
                        defaults={
                            'score': score,
                            'status': 'HOD_REVIEW',
                            'uploaded_by': user,
                            'department': department,
                            'upload_batch': batch,
                            'checksum': self._result_checksum(student, course, score, session_val, semester_val),
                            **({'grade': grade} if grade else {}),
                        },
                    )
                    if not created:
                        if result.is_deleted:
                            result.is_deleted = False
                            result.deleted_at = None
                            result.deleted_by = None
                        result.score = score
                        result.status = 'HOD_REVIEW'
                        result.uploaded_by = user
                        result.upload_batch = batch
                        result.checksum = self._result_checksum(student, course, score, session_val, semester_val)
                        if grade:
                            result.grade = grade
                        result.save()

                    created_results.append(result.id)
                except Exception as exc:
                    submit_errors.append(f'{matric_no}/{course_code}: {exc}')
                    continue

            summaries_saved = ResultUploadService.save_semester_summaries_from_file(
                summaries, session, semester, upload_batch=batch
            )

            batch.success_count = len(created_results)
            batch.save(update_fields=['success_count'])

            report_failed: List[Dict] = []
            for row in invalid_rows:
                parsed = row.get('_parsed') or {}
                errs = row.get('errors') or []
                report_failed.append({
                    'line_no': row.get('row_number') or '',
                    'reg_number': row.get('matric_no') or parsed.get('student_id') or '',
                    'course_code': row.get('course_code') or parsed.get('course_code') or '',
                    'error_message': '; '.join(errs) if errs else 'Validation failed',
                })
                ResultRow.objects.create(
                    batch=batch,
                    line_no=int(row.get('row_number') or 0) or 0,
                    reg_number=row.get('matric_no') or '',
                    course_code=row.get('course_code') or '',
                    status=ResultRow.RowStatus.ERROR,
                    error_message='; '.join(errs)[:500] if errs else 'Validation failed',
                    session=session,
                    semester=semester,
                )
            for err_msg in submit_errors:
                parts = err_msg.split(':', 1)
                key = parts[0] if parts else err_msg
                matric, course = (key.split('/', 1) + [''])[:2] if '/' in key else (key, '')
                report_failed.append({
                    'line_no': '',
                    'reg_number': matric,
                    'course_code': course,
                    'error_message': parts[1].strip() if len(parts) > 1 else err_msg,
                })
            if report_failed:
                ResultUploadService._write_error_report_csv(batch, report_failed)

            log_audit(
                AuditLog.Action.RESULT_UPLOAD_COMPLETED,
                request=request,
                user=user,
                identifier=f'Upload batch {batch.id}',
                extra={
                    'batch_id': batch.id,
                    'filename': file.name,
                    'session': session,
                    'semester': semester,
                    'success_count': len(created_results),
                    'error_count': len(invalid_rows),
                    'summaries_saved': summaries_saved,
                    'file_checksum': file_checksum,
                },
            )

        return Response({
            'message': 'Upload submitted successfully',
            'batch_id': batch.id,
            'created_count': len(created_results),
            'success_count': len(created_results),
            'error_count': len(invalid_rows),
            'summaries_saved': summaries_saved,
            'submit_errors': submit_errors[:20],
            'validation_report': validation_report,
        })

    def _result_checksum(self, student, course, score, session, semester) -> str:
        data = {
            'student_id': student.student_id,
            'course_id': course.id,
            'score': str(score),
            'session': session,
            'semester': semester,
        }
        return hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()


def _parse_course_line(course_line: str, line_num: int) -> tuple:
    """Parse one manual course line: course_code, credit_unit, grade, score, remark."""
    parts = [p.strip() for p in course_line.split(',')]
    if len(parts) < 4:
        raise ValueError(
            f'Line {line_num}: Invalid format. Use: {MANUAL_COURSE_LINE_FORMAT} '
            f'(e.g. CSC301, 3, A, 75, Excellent).'
        )
    course_code = parts[0].strip().replace(' ', '').upper()
    credit_unit = parts[1].strip() if len(parts) > 1 else ''
    grade = parts[2].strip().upper() if len(parts) > 2 else ''
    score_str = parts[3].strip() if len(parts) > 3 else ''
    remark = parts[4].strip() if len(parts) > 4 else ''
    if not score_str:
        raise ValueError(f'Line {line_num}: Score is required for {course_code or "course"}.')
    cleaned_score = ''.join(c for c in score_str if c.isdigit() or c == '.')
    if not cleaned_score:
        raise ValueError(f'Line {line_num}: Invalid score "{score_str}".')
    score = Decimal(cleaned_score)
    if score < 0 or score > 100:
        raise ValueError(f'Line {line_num}: Score must be between 0 and 100.')
    cu = int(credit_unit) if credit_unit and credit_unit.isdigit() else None
    if grade and grade not in ('A', 'B', 'C', 'D', 'E', 'F'):
        grade = ''
    return course_code, cu, grade, score, remark


def _save_manual_summary(student_id: str, session: str, semester: str, summary) -> bool:
    """Save semester summary from comma string or dict. Returns True if saved."""
    if not summary:
        return False
    if isinstance(summary, dict):
        fields = {
            'le': str(summary.get('le', '')),
            'nss': str(summary.get('nss', '')),
            'rcu': str(summary.get('rcu', '')),
            'ecu': str(summary.get('ecu', '')),
            'cp': str(summary.get('cp', '')),
            'gpa': str(summary.get('gpa', '')),
            'trcu': str(summary.get('trcu', '')),
            'tecu': str(summary.get('tecu', '')),
            'tcp': str(summary.get('tcp', '')),
            'pcgpa': str(summary.get('pcgpa', '')),
            'cgpa': str(summary.get('cgpa', '')),
            'outstanding_courses': str(summary.get('outstanding_courses', '')),
            'remarks': str(summary.get('remarks', '')),
            'standing': str(summary.get('standing', '')),
            'raw_summary': '',
        }
    else:
        summary_str = str(summary).strip()
        if not summary_str:
            return False
        parts = [p.strip() for p in summary_str.split(',')]
        if len(parts) < 13:
            raise ValueError(
                f'Summary needs 13 comma-separated values: {MANUAL_SUMMARY_FORMAT}.'
            )
        fields = {
            'le': parts[0],
            'nss': parts[1],
            'rcu': parts[2],
            'ecu': parts[3],
            'cp': parts[4],
            'gpa': parts[5],
            'trcu': parts[6],
            'tecu': parts[7],
            'tcp': parts[8],
            'pcgpa': parts[9],
            'cgpa': parts[10],
            'outstanding_courses': parts[11],
            'remarks': parts[12],
            'standing': '',
            'raw_summary': summary_str,
        }
    student = User.objects.filter(student_id=student_id).first()
    if not student:
        raise ValueError(f'Student {student_id} not found.')
    SemesterSummary.objects.update_or_create(
        student=student,
        session=session,
        semester=semester,
        defaults=fields,
    )
    return True


class HODManualStudentEntryView(APIView):
    """
    POST /api/academics/hod/manual-entry/
    Full semester manual entry — same format as Django admin manual upload.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        if not user.is_staff or not (is_super_admin(user) or is_hod(user)):
            return Response({'error': 'Only HOD/Department Admin can enter results'}, status=status.HTTP_403_FORBIDDEN)

        department = _hod_department(user)
        if not is_super_admin(user) and not department:
            return Response(
                {'error': 'HOD must be assigned to a department.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        student_id = (request.data.get('student_id') or '').strip().upper()
        session = (request.data.get('session') or '').strip()
        semester = (request.data.get('semester') or '').strip().upper()
        course_entries = (request.data.get('course_entries') or '').strip()
        course_lines = request.data.get('course_lines')
        summary = request.data.get('summary')

        if not student_id:
            return Response({'error': 'Student ID (matric) is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not session:
            return Response({'error': 'Session is required (e.g. 2023/2024).'}, status=status.HTTP_400_BAD_REQUEST)
        if semester not in ('FIRST', 'SECOND'):
            return Response({'error': 'Semester must be FIRST or SECOND.'}, status=status.HTTP_400_BAD_REQUEST)

        lines: List[str] = []
        if isinstance(course_lines, list):
            lines = [str(l).strip() for l in course_lines if str(l).strip()]
        elif course_entries:
            lines = [l.strip() for l in course_entries.split('\n') if l.strip()]

        if not lines and not summary:
            return Response(
                {'error': 'Enter at least one course line or a semester summary.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            ResultUploadService.get_student(student_id)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        if department and not is_super_admin(user):
            from apps.accounts.models import User as AccountUser
            student_user = AccountUser.objects.filter(student_id=student_id).first()
            if student_user:
                student_dept_id = getattr(student_user, 'department_fk_id', None)
                if student_dept_id is not None and student_dept_id != department.pk:
                    return Response(
                        {
                            'error': (
                                f'Student {student_id} is not in your department. '
                                'Assign them to your department in User management first.'
                            )
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

        created_count = 0
        errors = []
        created_results = []

        for line_num, course_line in enumerate(lines, 1):
            course_code = ''
            score_str = ''
            try:
                course_code, credit_unit, grade, score, remark = _parse_course_line(course_line, line_num)
                result = ResultUploadService.create_result(
                    student_id=student_id,
                    course_code=course_code,
                    score=score,
                    session=session,
                    semester=semester,
                    uploaded_by=user,
                    credit_unit=credit_unit,
                    remark=remark or None,
                    department=department,
                )
                if grade:
                    gp = GPACalculationService.GRADE_POINTS.get(grade)
                    result.grade = grade
                    if gp is not None:
                        result.grade_point = gp
                    result.save(update_fields=['grade', 'grade_point'])
                created_count += 1
                created_results.append(result)
            except ValueError as e:
                errors.append({
                    'line_no': line_num,
                    'course_code': course_code,
                    'score': score_str,
                    'error_message': str(e),
                })
            except Exception as e:
                errors.append({
                    'line_no': line_num,
                    'course_code': course_code,
                    'score': score_str,
                    'error_message': str(e),
                })

        summary_saved = False
        summary_error = None
        if summary:
            try:
                summary_saved = _save_manual_summary(student_id, session, semester, summary)
            except ValueError as e:
                summary_error = str(e)
            except Exception as e:
                summary_error = str(e)

        if created_count > 0:
            log_audit(
                AuditLog.Action.RESULT_MANUAL_ENTRY,
                request=request,
                user=user,
                identifier=student_id,
                extra={
                    'created_count': created_count,
                    'error_count': len(errors),
                    'session': session,
                    'semester': semester,
                    'summary_saved': summary_saved,
                },
            )

        from .serializers import ResultSerializer
        return Response({
            'message': f'Created {created_count} result(s) for {student_id}',
            'created_count': created_count,
            'error_count': len(errors),
            'errors': errors,
            'summary_saved': summary_saved,
            'summary_error': summary_error,
            'results': ResultSerializer(created_results, many=True).data,
            'manual_course_line_format': MANUAL_COURSE_LINE_FORMAT,
            'manual_summary_format': MANUAL_SUMMARY_FORMAT,
        }, status=status.HTTP_201_CREATED if created_count or summary_saved else status.HTTP_400_BAD_REQUEST)
