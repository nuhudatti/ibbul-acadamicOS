"""
Module 3 — Admin upload-results API: POST create batch + enqueue task, GET status, download report, retry.
"""
import os
from django.conf import settings
from django.http import FileResponse, Http404
from django.utils import timezone
from rest_framework import status
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ResultUploadBatch, Department
from .services import ResultUploadService
from .permissions import CanUploadResult
from apps.accounts.audit import log_audit
from apps.accounts.models import AuditLog
from apps.accounts.scope import build_scope, ScopeLevel, filter_by_scope, is_hod, get_hod_department_id, is_super_admin


def _enqueue_or_run_sync(batch_id: int):
    """Enqueue Celery task if broker configured and Celery installed, else run synchronously."""
    broker = getattr(settings, 'CELERY_BROKER_URL', '') or os.getenv('CELERY_BROKER_URL', '')
    try:
        if broker:
            from .tasks import process_upload_batch_task
            process_upload_batch_task.delay(batch_id)
            return
    except ImportError:
        pass
    # No broker or Celery not installed: run synchronously
    ResultUploadService.process_upload_batch_from_file(batch_id)
    try:
        from apps.accounts.models import AuditLog
        from apps.accounts.audit import log_audit
        batch = ResultUploadBatch.objects.get(pk=batch_id)
        log_audit(
            AuditLog.Action.RESULT_UPLOAD_COMPLETED,
            user=batch.uploaded_by,
            identifier=batch.filename,
            extra={'batch_id': batch.id, 'success_count': batch.success_count, 'error_count': batch.error_count},
        )
    except Exception:
        pass


class UploadResultsCreateView(APIView):
    """POST /api/admin/upload-results/ — create ResultUploadBatch, save file, enqueue task."""
    permission_classes = [IsAuthenticated, CanUploadResult]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        file_obj = request.FILES.get('file')
        session = (request.data.get('session') or request.POST.get('session') or '').strip()
        semester = (request.data.get('semester') or request.POST.get('semester') or '').strip()
        client_department_id = request.data.get('department_id') or request.POST.get('department_id')
        client_faculty_id = request.data.get('faculty_id') or request.POST.get('faculty_id')
        if not file_obj:
            return Response({'error': 'No file provided.'}, status=status.HTTP_400_BAD_REQUEST)
        if not session or not semester:
            return Response({'error': 'session and semester are required.'}, status=status.HTTP_400_BAD_REQUEST)
        name = file_obj.name
        ext = os.path.splitext(name)[1].lower()
        if ext not in ('.csv', '.xlsx', '.xls'):
            return Response({'error': 'Only .csv, .xlsx, .xls are allowed.'}, status=status.HTTP_400_BAD_REQUEST)

        # ENTERPRISE: Force scope — HOD can only upload for their department; reject other department
        user = request.user
        department_id = None
        faculty_id = None
        if is_hod(user) and not is_super_admin(user):
            dept_id = get_hod_department_id(user)
            if not dept_id:
                return Response(
                    {'error': 'You must be assigned to a department to upload results. Set Department in your profile.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            # HOD: ignore client department_id; force own department
            if client_department_id and int(client_department_id) != dept_id:
                return Response(
                    {'error': 'You can only upload results for your own department. Other department uploads are not allowed.'},
                    status=status.HTTP_403_FORBIDDEN
                )
            department_id = dept_id
            dept = Department.objects.filter(pk=dept_id).select_related('faculty').first()
            if dept and dept.faculty_id:
                faculty_id = dept.faculty_id
        elif getattr(user, 'role', None) in ('FACULTY_ADMIN',) and getattr(user, 'faculty_id', None) and not is_super_admin(user):
            # Faculty Admin: force faculty_id; department_id only if in their faculty
            faculty_id = user.faculty_id
            if client_department_id:
                dept = Department.objects.filter(pk=int(client_department_id), faculty_id=faculty_id).first()
                if dept:
                    department_id = dept.pk
                # else leave department_id None or only faculty scope
        else:
            # Super Admin: allow client choice
            department_id = int(client_department_id) if client_department_id else None
            faculty_id = int(client_faculty_id) if client_faculty_id else None

        # Create batch (status PROCESSING) with enforced scope
        batch = ResultUploadBatch.objects.create(
            filename=name,
            uploaded_by=request.user,
            department_id=department_id,
            faculty_id=faculty_id,
            status=ResultUploadBatch.Status.PROCESSING,
            session=session,
            semester=semester,
        )
        # Save file to media/upload_batches/<batch_id>_<sanitized_name>
        media_root = getattr(settings, 'MEDIA_ROOT', None) or os.path.join(settings.BASE_DIR, 'media')
        upload_dir = os.path.join(media_root, 'upload_batches')
        os.makedirs(upload_dir, exist_ok=True)
        safe_name = "".join(c for c in name if c.isalnum() or c in '._- ').strip()[:200]
        file_path = os.path.join(upload_dir, f'{batch.id}_{safe_name}')
        with open(file_path, 'wb') as f:
            for chunk in file_obj.chunks():
                f.write(chunk)
        batch.upload_file_path = file_path
        batch.save(update_fields=['upload_file_path'])

        log_audit(
            AuditLog.Action.RESULT_UPLOAD_STARTED,
            request=request,
            user=request.user,
            identifier=name,
            extra={'batch_id': batch.id, 'session': session, 'semester': semester},
        )
        _enqueue_or_run_sync(batch.id)

        return Response(
            {
                'batch_id': batch.id,
                'status': batch.status,
                'message': 'Upload queued. Poll GET /api/admin/upload-results/{id}/ for progress.',
            },
            status=status.HTTP_201_CREATED,
        )


class UploadResultsDetailView(APIView):
    """GET /api/admin/upload-results/<id>/ — batch status, progress, error_report_download_url."""
    permission_classes = [IsAuthenticated, CanUploadResult]

    def get(self, request, batch_id):
        scope = getattr(request, 'scope', None) or build_scope(request.user)
        qs = ResultUploadBatch.objects.filter(pk=batch_id)
        if scope and scope.level < ScopeLevel.GLOBAL:
            qs = filter_by_scope(qs, request.user, request)
        batch = qs.first()
        if not batch:
            return Response({'error': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        base_url = request.build_absolute_uri('/').rstrip('/')
        report_url = None
        if batch.report_download_token and batch.report_download_expires_at and batch.report_download_expires_at > timezone.now():
            report_url = f"{base_url}api/admin/upload-results/{batch.id}/download-report/?token={batch.report_download_token}"
        return Response({
            'id': batch.id,
            'filename': batch.filename,
            'status': batch.status,
            'progress': batch.progress,
            'success_count': batch.success_count,
            'error_count': batch.error_count,
            'error_report_download_url': report_url,
            'created_at': batch.created_at.isoformat() if batch.created_at else None,
            'completed_at': batch.completed_at.isoformat() if batch.completed_at else None,
        })


class UploadResultsDownloadReportView(APIView):
    """GET /api/admin/upload-results/<id>/download-report/?token=xxx — one-time download; invalidates token. No auth required when token is valid."""
    permission_classes = []  # Allow one-time link without login
    authentication_classes = []  # No JWT required when token in URL is valid

    def get(self, request, batch_id):
        token = request.query_params.get('token')
        if not token:
            return Response({'error': 'token required.'}, status=status.HTTP_400_BAD_REQUEST)
        batch = ResultUploadBatch.objects.filter(pk=batch_id, report_download_token=token).first()
        if not batch or not batch.report_download_expires_at or batch.report_download_expires_at < timezone.now():
            return Response({'error': 'Invalid or expired link.'}, status=status.HTTP_404_NOT_FOUND)
        media_root = getattr(settings, 'MEDIA_ROOT', None) or os.path.join(settings.BASE_DIR, 'media')
        report_path = os.path.join(media_root, 'reports', f'{batch_id}_errors.csv')
        if not os.path.isfile(report_path):
            return Response({'error': 'Report file not found.'}, status=status.HTTP_404_NOT_FOUND)
        batch.report_download_token = None
        batch.report_download_expires_at = None
        batch.save(update_fields=['report_download_token', 'report_download_expires_at'])
        fh = open(report_path, 'rb')
        response = FileResponse(fh, as_attachment=True, filename=f'upload_errors_{batch_id}.csv')
        return response


class UploadResultsRetryView(APIView):
    """POST /api/admin/upload-results/<id>/retry/ — re-enqueue task for same file."""
    permission_classes = [IsAuthenticated, CanUploadResult]

    def post(self, request, batch_id):
        scope = getattr(request, 'scope', None) or build_scope(request.user)
        qs = ResultUploadBatch.objects.filter(pk=batch_id)
        if scope and scope.level < ScopeLevel.GLOBAL:
            qs = filter_by_scope(qs, request.user, request)
        batch = qs.first()
        if not batch:
            return Response({'error': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        if not batch.upload_file_path or not os.path.isfile(batch.upload_file_path):
            return Response({'error': 'Original file no longer available.'}, status=status.HTTP_400_BAD_REQUEST)
        # Reset batch for re-run: delete Results created by this batch, then ResultRows, then re-enqueue
        from .models import ResultRow, Result
        result_ids = list(ResultRow.objects.filter(batch=batch, result_id__isnull=False).values_list('result_id', flat=True))
        Result.objects.filter(pk__in=result_ids).delete()
        ResultRow.objects.filter(batch=batch).delete()
        batch.status = ResultUploadBatch.Status.PROCESSING
        batch.progress = 0
        batch.success_count = 0
        batch.error_count = 0
        batch.completed_at = None
        batch.report_download_token = None
        batch.report_download_expires_at = None
        batch.save()
        _enqueue_or_run_sync(batch.id)
        return Response({'batch_id': batch.id, 'status': batch.status, 'message': 'Retry queued.'})


class UploadScopeView(APIView):
    """
    GET /api/admin/upload-results/scope/
    Returns scoped upload context: department_id, department_name, can_choose_department, departments (for Super Admin).
    Use this to lock department dropdown for HOD (only their department) and show only allowed departments for Faculty Admin.
    """
    permission_classes = [IsAuthenticated, CanUploadResult]

    def get(self, request):
        user = request.user
        role_str = str(getattr(user, 'role', '')).upper()
        # HOD: single department only; cannot choose another
        if is_hod(user) and not is_super_admin(user):
            dept_id = get_hod_department_id(user)
            if not dept_id:
                return Response({
                    'department_id': None,
                    'department_name': None,
                    'department_code': None,
                    'can_choose_department': False,
                    'departments': [],
                    'message': 'Assign a department to your profile to upload results.',
                })
            dept = Department.objects.filter(pk=dept_id).first()
            return Response({
                'department_id': dept_id,
                'department_name': getattr(dept, 'name', None) if dept else None,
                'department_code': getattr(dept, 'code', None) if dept else None,
                'can_choose_department': False,
                'departments': [{'id': dept_id, 'name': getattr(dept, 'name', ''), 'code': getattr(dept, 'code', '')}] if dept else [],
                'message': 'You can only upload results for your department.',
            })
        # Faculty Admin: list departments in their faculty
        if role_str == 'FACULTY_ADMIN' and getattr(user, 'faculty_id', None):
            depts = list(Department.objects.filter(faculty_id=user.faculty_id).values('id', 'name', 'code'))
            return Response({
                'department_id': None,
                'department_name': None,
                'department_code': None,
                'can_choose_department': True,
                'departments': depts,
                'message': 'Select a department within your faculty.',
            })
        # Super Admin: all departments
        depts = list(Department.objects.select_related('faculty').order_by('faculty__name', 'code').values('id', 'name', 'code', 'faculty_id'))
        return Response({
            'department_id': None,
            'department_name': None,
            'department_code': None,
            'can_choose_department': True,
            'departments': depts,
            'message': None,
        })
