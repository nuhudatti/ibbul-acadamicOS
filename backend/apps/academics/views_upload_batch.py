"""
Result Upload Batch API — Enterprise batch-centric view.
Scoped: HOD sees department batches, Faculty Admin faculty, Super Admin all.
List with filters (session, semester, department, faculty, status, approval_status).
Detail returns batch + all results in batch. Approve/Reject actions.
"""
import csv
import io
import os

from django.conf import settings
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import ResultUploadBatch, Result, ResultRow
from .serializers import (
    UploadBatchListSerializer,
    UploadBatchDetailSerializer,
    BatchRejectSerializer,
)
from apps.accounts.scope import filter_by_scope
from apps.accounts.audit import log_audit
from apps.accounts.models import AuditLog
from .services import BatchApprovalService


def _can_manage_batches(user) -> bool:
    """Staff HOD, Faculty Admin, or Super Admin can list/manage batches."""
    if not getattr(user, 'is_staff', False):
        return False
    role = str(getattr(user, 'role', '') or '').upper()
    return role in ('HOD', 'DEPARTMENT_ADMIN', 'FACULTY_ADMIN', 'SUPER_ADMIN')


class UploadBatchViewSet(viewsets.ReadOnlyModelViewSet):
    """
    List and retrieve result upload batches (scoped by role).
    HOD: department batches only. Faculty Admin: faculty batches. Super Admin: all.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = UploadBatchListSerializer
    lookup_url_kwarg = 'id'

    def get_queryset(self):
        request = self.request
        if not request.user.is_authenticated or not _can_manage_batches(request.user):
            return ResultUploadBatch.objects.none()
        qs = ResultUploadBatch.objects.select_related(
            'uploaded_by', 'department', 'faculty', 'approved_by'
        ).order_by('-created_at')
        return filter_by_scope(qs, request.user, request)

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return UploadBatchDetailSerializer
        return UploadBatchListSerializer

    def retrieve(self, request, *args, **kwargs):
        """Return batch with all results in this batch."""
        instance = self.get_object()
        results = Result.objects.filter(upload_batch=instance).select_related(
            'student', 'course', 'uploaded_by', 'approved_by', 'department'
        ).order_by('student__student_id', 'course__code')
        serializer = UploadBatchDetailSerializer(instance)
        data = serializer.data
        data['results'] = [
            {
                'id': r.id,
                'student': r.student_id,
                'student_info': {
                    'student_id': r.student.student_id if r.student else None,
                    'first_name': r.student.first_name if r.student else '',
                    'last_name': r.student.last_name if r.student else '',
                },
                'course': r.course_id,
                'course_info': {
                    'code': r.course.code if r.course else None,
                    'title': r.course.title if r.course else None,
                    'credit_units': r.course.credit_units if r.course else None,
                },
                'score': r.get_score_display() if r.score is not None else None,
                'grade': r.grade or '',
                'grade_point': str(r.grade_point) if r.grade_point is not None else None,
                'status': r.status,
                'session': r.session,
                'semester': r.semester,
                'department_name': r.department.name if r.department else None,
            }
            for r in results
        ]
        return Response(data)

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        session = request.query_params.get('session', '').strip()
        if session:
            queryset = queryset.filter(session=session)
        semester = request.query_params.get('semester', '').strip()
        if semester:
            queryset = queryset.filter(semester=semester)
        approval_status = request.query_params.get('approval_status', '').strip()
        if approval_status:
            queryset = queryset.filter(approval_status=approval_status)
        batch_status = request.query_params.get('status', '').strip()
        if batch_status:
            queryset = queryset.filter(status=batch_status)
        department_id = request.query_params.get('department_id', '').strip()
        if department_id:
            try:
                queryset = queryset.filter(department_id=int(department_id))
            except ValueError:
                pass
        faculty_id = request.query_params.get('faculty_id', '').strip()
        if faculty_id:
            try:
                queryset = queryset.filter(faculty_id=int(faculty_id))
            except ValueError:
                pass
        search = request.query_params.get('search', '').strip()
        if search:
            queryset = queryset.filter(filename__icontains=search)
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='approve')
    def approve_batch(self, request, id=None):
        batch = get_object_or_404(self.get_queryset(), pk=id)
        try:
            updated = BatchApprovalService.approve_batch(batch, request.user)
            log_audit(
                AuditLog.Action.RESULT_BATCH_APPROVED,
                request=request,
                user=request.user,
                identifier=batch.filename,
                extra={'batch_id': batch.id, 'results_updated': updated},
            )
            return Response({
                'message': f'Batch approved. {updated} result(s) updated.',
                'batch_id': batch.id,
                'results_updated': updated,
            }, status=status.HTTP_200_OK)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='reject')
    def reject_batch(self, request, id=None):
        batch = get_object_or_404(self.get_queryset(), pk=id)
        ser = BatchRejectSerializer(data=request.data or {})
        ser.is_valid(raise_exception=True)
        reason = (ser.validated_data.get('reason') or '')[:2000]
        try:
            updated = BatchApprovalService.reject_batch(batch, request.user, reason=reason)
            log_audit(
                AuditLog.Action.RESULT_BATCH_REJECTED,
                request=request,
                user=request.user,
                identifier=batch.filename,
                extra={'batch_id': batch.id, 'results_updated': updated, 'reason': reason[:200]},
            )
            return Response({
                'message': f'Batch rejected. {updated} result(s) updated.',
                'batch_id': batch.id,
                'results_updated': updated,
            }, status=status.HTTP_200_OK)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get'], url_path='error-report')
    def error_report(self, request, id=None):
        """Download CSV of failed rows for this batch (from stored rows or report file)."""
        batch = get_object_or_404(self.get_queryset(), pk=id)
        error_rows = batch.rows.filter(status=ResultRow.RowStatus.ERROR).order_by('line_no')

        if error_rows.exists():
            buffer = io.StringIO()
            writer = csv.writer(buffer)
            writer.writerow(['line_no', 'reg_number', 'course_code', 'error_message'])
            for row in error_rows:
                writer.writerow([
                    row.line_no,
                    row.reg_number,
                    row.course_code,
                    row.error_message or 'Error',
                ])
            response = HttpResponse(buffer.getvalue(), content_type='text/csv; charset=utf-8')
            response['Content-Disposition'] = (
                f'attachment; filename="batch_{batch.id}_errors.csv"'
            )
            return response

        media_root = getattr(settings, 'MEDIA_ROOT', None) or os.path.join(settings.BASE_DIR, 'media')
        report_path = os.path.join(media_root, 'reports', f'{batch.id}_errors.csv')
        if os.path.isfile(report_path):
            with open(report_path, 'r', encoding='utf-8') as fh:
                content = fh.read()
            response = HttpResponse(content, content_type='text/csv; charset=utf-8')
            response['Content-Disposition'] = (
                f'attachment; filename="batch_{batch.id}_errors.csv"'
            )
            return response

        if batch.error_count and batch.error_count > 0:
            buffer = io.StringIO()
            writer = csv.writer(buffer)
            writer.writerow(['line_no', 'reg_number', 'course_code', 'error_message'])
            writer.writerow([
                '',
                '',
                '',
                (
                    f'This batch recorded {batch.error_count} error(s) before row-level error logs were stored. '
                    'Re-upload the file via Add Results to generate a detailed error report.'
                ),
            ])
            response = HttpResponse(buffer.getvalue(), content_type='text/csv; charset=utf-8')
            response['Content-Disposition'] = (
                f'attachment; filename="batch_{batch.id}_errors.csv"'
            )
            return response

        return Response(
            {'error': 'No error rows recorded for this batch.'},
            status=status.HTTP_404_NOT_FOUND,
        )
