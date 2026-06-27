"""
HOD (Department Admin) API Views
Enterprise-grade: Department-scoped result management, approval workflow, audit logging
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.pagination import PageNumberPagination
from django.db.models import Q, Count, Avg, Max
from django.db import models
from django.utils import timezone
from django.db import transaction
from datetime import timedelta

from .models import Result, ResultVersion, Course, Department
from apps.accounts.models import User, UserRole
from apps.accounts.audit import log_audit
from apps.accounts.models import AuditLog
from apps.accounts.scope import (
    filter_by_scope, build_scope, is_super_admin, is_hod,
    can_view_staff_results, can_manage_department_results,
)
from .permissions import CanDeleteResult
from .serializers import ResultSerializer


def _reject_reason_from_request(request) -> str:
    return (request.data.get('reason') or request.data.get('rejection_reason') or '').strip()


def _ensure_result_grade_fields(result: Result) -> None:
    """Fill grade / grade_point from score when missing (so students see complete rows)."""
    if result.score is None:
        return
    if not result.grade:
        from .parsers.ibbul_wide import _score_to_grade
        result.grade = _score_to_grade(float(result.score))
    if result.grade_point is None and result.grade:
        from .services import GPACalculationService
        gp = GPACalculationService.GRADE_POINTS.get(result.grade)
        if gp is not None:
            result.grade_point = gp


def _approve_result_record(result: Result, user, change_reason: str) -> None:
    _ensure_result_grade_fields(result)
    result.status = 'LOCKED_PUBLISHED'
    result.approved_by = user
    result.approved_at = timezone.now()
    result.locked_by = user
    result.locked_at = timezone.now()
    result.is_editable = False
    result.save()
    max_version = ResultVersion.objects.filter(result=result).aggregate(
        max_v=Max('version_number')
    )['max_v'] or 0
    ResultVersion.objects.create(
        result=result,
        version_number=max_version + 1,
        score=result.score,
        grade=result.grade,
        grade_point=result.grade_point,
        remark=result.remark,
        status=result.status,
        changed_by=user,
        change_reason=change_reason,
    )


def _unapprove_result_record(result: Result) -> bool:
    """Reset approved/rejected/published result to pending HOD review."""
    if result.is_deleted:
        return False
    if result.status in ('HOD_REVIEW', 'SUBMITTED', 'DRAFT', 'PENDING', 'RETURNED'):
        return False
    result.status = 'HOD_REVIEW'
    result.approved_by = None
    result.approved_at = None
    result.locked_by = None
    result.locked_at = None
    result.rejection_reason = ''
    result.is_editable = True
    result.save(update_fields=[
        'status', 'approved_by', 'approved_at', 'locked_by', 'locked_at',
        'rejection_reason', 'is_editable', 'updated_at',
    ])
    return True


def _soft_delete_result(result: Result, user) -> bool:
    if result.is_deleted:
        return False
    result.is_deleted = True
    result.deleted_at = timezone.now()
    result.deleted_by = user
    result.save(update_fields=['is_deleted', 'deleted_at', 'deleted_by', 'updated_at'])
    return True


class HODResultPagination(PageNumberPagination):
    """HOD results list — allow large page_size so the UI can group by student accurately."""
    page_size = 100
    page_size_query_param = 'page_size'
    max_page_size = 1000


class HODResultViewSet(viewsets.ModelViewSet):
    """
    HOD-scoped result management.
    Department Admin can only view/manage results within their department.
    """
    serializer_class = ResultSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = HODResultPagination

    def get_permissions(self):
        if self.action == 'destroy':
            return [IsAuthenticated(), CanDeleteResult()]
        return super().get_permissions()

    def perform_destroy(self, instance):
        """Soft-delete (HOD). Published rows are removed from active views."""
        if not can_manage_department_results(self.request.user):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only Department Admin (HOD) can delete results.')
        identifier = (
            f'{instance.student.student_id or instance.student.email} '
            f'{instance.course.code} {instance.session} {instance.semester}'
        )
        log_audit(
            AuditLog.Action.RESULT_DELETED,
            request=self.request,
            user=self.request.user,
            identifier=identifier,
            extra={
                'result_id': instance.pk,
                'course_code': instance.course.code,
                'session': instance.session,
                'semester': instance.semester,
                'source': 'hod_api',
                'soft_delete': True,
            },
        )
        _soft_delete_result(instance, self.request.user)

    def get_queryset(self):
        """Filter results by role scope: HOD=department, Dean=faculty, Super Admin=all."""
        user = self.request.user
        if not can_view_staff_results(user):
            return Result.objects.none()

        qs = Result.objects.select_related(
            'student', 'course', 'uploaded_by', 'approved_by', 'locked_by', 'department', 'upload_batch'
        ).prefetch_related('versions')

        show_deleted = self.request.query_params.get('include_deleted', '').strip().lower() in ('1', 'true', 'yes')
        if not show_deleted:
            qs = qs.filter(is_deleted=False)

        if is_super_admin(user):
            return qs
        return filter_by_scope(qs, user)

    def list(self, request, *args, **kwargs):
        """List results with scoped filters and search. All filters apply within HOD's department."""
        queryset = self.get_queryset()
        
        # Filters (all scoped by get_queryset)
        status_filter = request.query_params.get('status', '').strip()
        pending = request.query_params.get('pending', '').strip().lower()
        if pending in ('1', 'true', 'yes'):
            queryset = queryset.filter(status__in=('SUBMITTED', 'HOD_REVIEW', 'DRAFT', 'PENDING'))
        elif status_filter:
            queryset = queryset.filter(status=status_filter)
        
        session = request.query_params.get('session', '').strip()
        if session:
            queryset = queryset.filter(session=session)
        
        semester = request.query_params.get('semester', '').strip()
        if semester:
            queryset = queryset.filter(semester=semester)
        
        course_id = request.query_params.get('course_id', '').strip()
        if course_id:
            try:
                queryset = queryset.filter(course_id=int(course_id))
            except ValueError:
                pass
        
        grade = request.query_params.get('grade', '').strip()
        if grade:
            queryset = queryset.filter(grade=grade)
        
        # Exact student_id (registration number) filter
        student_id = request.query_params.get('student_id', '').strip().upper()
        if student_id:
            queryset = queryset.filter(student__student_id__iexact=student_id)
        
        department_id = request.query_params.get('department_id', '').strip()
        if department_id and is_super_admin(request.user):
            try:
                queryset = queryset.filter(
                    Q(department_id=int(department_id))
                    | Q(department_id__isnull=True, course__department_id=int(department_id))
                    | Q(
                        department_id__isnull=True,
                        course__department_id__isnull=True,
                        student__department_fk_id=int(department_id),
                    )
                )
            except ValueError:
                pass
        
        created_after = request.query_params.get('created_after', '').strip()
        if created_after:
            queryset = queryset.filter(created_at__gte=created_after)
        
        created_before = request.query_params.get('created_before', '').strip()
        if created_before:
            queryset = queryset.filter(created_at__lte=created_before)
        
        # Search: student_id, name, course code/title (scoped)
        search = request.query_params.get('search', '').strip()
        if search:
            queryset = queryset.filter(
                Q(student__student_id__icontains=search) |
                Q(student__first_name__icontains=search) |
                Q(student__last_name__icontains=search) |
                Q(course__code__icontains=search) |
                Q(course__title__icontains=search)
            )
        
        # Default ordering: newest first
        queryset = queryset.order_by('-created_at')
        
        # Pagination (always return { results, count } for frontend)
        base_qs = self.get_queryset()
        available_sessions = sorted(
            {s for s in base_qs.values_list('session', flat=True) if s},
            reverse=True,
        )

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            resp = self.get_paginated_response(serializer.data)
            resp.data['available_sessions'] = available_sessions
            resp.data['total_unfiltered'] = base_qs.count()
            return resp
        
        serializer = self.get_serializer(queryset, many=True)
        return Response({
            'results': serializer.data,
            'count': queryset.count(),
            'available_sessions': available_sessions,
            'total_unfiltered': base_qs.count(),
        })

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve a single result. Moves to APPROVED → LOCKED_PUBLISHED."""
        if not can_manage_department_results(request.user):
            return Response(
                {'error': 'Only Department Admin (HOD) can approve results'},
                status=status.HTTP_403_FORBIDDEN,
            )
        result = self.get_object()
        user = request.user
        
        # Validate transition
        if result.status not in ('HOD_REVIEW', 'SUBMITTED', 'DRAFT', 'PENDING'):
            return Response(
                {'error': f'Cannot approve result with status {result.status}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if result.status == 'LOCKED_PUBLISHED':
            return Response(
                {'error': 'Result is locked and cannot be modified'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        with transaction.atomic():
            _approve_result_record(result, user, 'Approved and locked by HOD')
            
            # Audit log
            audit_entry = log_audit(
                AuditLog.Action.RESULT_BATCH_APPROVED,
                request=request,
                user=user,
                identifier=f'Result {result.id}',
                extra={
                    'result_id': result.id,
                    'student_id': result.student.student_id if result.student.student_id else '',
                    'course_code': result.course.code,
                    'status': result.status,
                }
            )
            
            # Forward to SuperAdmin
            if audit_entry:
                from apps.accounts.audit_forwarding import forward_audit_to_superadmin
                forward_audit_to_superadmin(audit_entry, event_type='WEBHOOK')
        
        serializer = self.get_serializer(result)
        return Response({
            'message': 'Result approved and locked',
            'result': serializer.data
        })

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Reject a result. Requires reason."""
        if not can_manage_department_results(request.user):
            return Response(
                {'error': 'Only Department Admin (HOD) can reject results'},
                status=status.HTTP_403_FORBIDDEN,
            )
        result = self.get_object()
        user = request.user
        reason = _reject_reason_from_request(request)
        
        if not reason:
            return Response(
                {'error': 'Rejection reason is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if result.status == 'LOCKED_PUBLISHED':
            return Response(
                {'error': 'Result is locked and cannot be modified'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        with transaction.atomic():
            result.status = 'REJECTED'
            result.rejection_reason = reason
            result.save()
            
            # Audit log
            audit_entry = log_audit(
                AuditLog.Action.RESULT_BATCH_REJECTED,
                request=request,
                user=user,
                identifier=f'Result {result.id}',
                extra={
                    'result_id': result.id,
                    'student_id': result.student.student_id if result.student.student_id else '',
                    'course_code': result.course.code,
                    'reason': reason,
                }
            )
            
            # Forward to SuperAdmin
            if audit_entry:
                from apps.accounts.audit_forwarding import forward_audit_to_superadmin
                forward_audit_to_superadmin(audit_entry, event_type='WEBHOOK')
        
        serializer = self.get_serializer(result)
        return Response({
            'message': 'Result rejected',
            'result': serializer.data
        })

    @action(detail=False, methods=['post'])
    def bulk_approve(self, request):
        """Bulk approve multiple results."""
        if not can_manage_department_results(request.user):
            return Response(
                {'error': 'Only Department Admin (HOD) can approve results'},
                status=status.HTTP_403_FORBIDDEN,
            )
        result_ids = request.data.get('result_ids', [])
        if not result_ids:
            return Response(
                {'error': 'result_ids array is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        results = self.get_queryset().filter(id__in=result_ids, status__in=('HOD_REVIEW', 'SUBMITTED', 'DRAFT', 'PENDING'))
        approved_count = 0
        
        with transaction.atomic():
            for result in results:
                if result.status == 'LOCKED_PUBLISHED':
                    continue
                _approve_result_record(result, request.user, 'Bulk approved by HOD')
                approved_count += 1
            
            # Audit log
            log_audit(
                AuditLog.Action.RESULT_BATCH_APPROVED,
                request=request,
                user=request.user,
                identifier=f'Bulk approve {approved_count} results',
                extra={
                    'result_ids': result_ids,
                    'approved_count': approved_count,
                }
            )
        
        return Response({
            'message': f'{approved_count} results approved and locked',
            'approved_count': approved_count
        })

    @action(detail=False, methods=['post'])
    def bulk_reject(self, request):
        """Bulk reject multiple results. Requires reason."""
        if not can_manage_department_results(request.user):
            return Response(
                {'error': 'Only Department Admin (HOD) can reject results'},
                status=status.HTTP_403_FORBIDDEN,
            )
        result_ids = request.data.get('result_ids', [])
        reason = _reject_reason_from_request(request)
        
        if not result_ids:
            return Response(
                {'error': 'result_ids array is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if not reason:
            return Response(
                {'error': 'Rejection reason is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        results = self.get_queryset().filter(id__in=result_ids).exclude(status='LOCKED_PUBLISHED')
        rejected_count = 0
        
        with transaction.atomic():
            for result in results:
                result.status = 'REJECTED'
                result.rejection_reason = reason
                result.save()
                rejected_count += 1
            
            # Audit log
            log_audit(
                AuditLog.Action.RESULT_BATCH_REJECTED,
                request=request,
                user=request.user,
                identifier=f'Bulk reject {rejected_count} results',
                extra={
                    'result_ids': result_ids,
                    'rejected_count': rejected_count,
                    'reason': reason,
                }
            )
        
        return Response({
            'message': f'{rejected_count} results rejected',
            'rejected_count': rejected_count
        })

    @action(detail=True, methods=['post'])
    def unapprove(self, request, pk=None):
        """Reset a result to pending HOD review (unapprove / restore)."""
        if not can_manage_department_results(request.user):
            return Response(
                {'error': 'Only Department Admin (HOD) can unapprove results'},
                status=status.HTTP_403_FORBIDDEN,
            )
        result = self.get_object()
        if result.is_deleted:
            return Response({'error': 'Result is deleted'}, status=status.HTTP_400_BAD_REQUEST)
        if not _unapprove_result_record(result):
            return Response(
                {'error': f'Result is already pending (status: {result.status})'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        log_audit(
            AuditLog.Action.ADMIN_ACTION,
            request=request,
            user=request.user,
            identifier=f'Unapprove result {result.id}',
            extra={'result_id': result.id, 'action': 'RESULT_UNAPPROVED'},
        )
        return Response({
            'message': 'Result moved back to pending review',
            'result': self.get_serializer(result).data,
        })

    @action(detail=False, methods=['post'])
    def bulk_unapprove(self, request):
        """Bulk reset results to pending HOD review."""
        if not can_manage_department_results(request.user):
            return Response(
                {'error': 'Only Department Admin (HOD) can unapprove results'},
                status=status.HTTP_403_FORBIDDEN,
            )
        result_ids = request.data.get('result_ids', [])
        if not result_ids:
            return Response({'error': 'result_ids array is required'}, status=status.HTTP_400_BAD_REQUEST)

        results = self.get_queryset().filter(id__in=result_ids, is_deleted=False)
        count = 0
        skipped = []
        with transaction.atomic():
            for result in results:
                if _unapprove_result_record(result):
                    count += 1
                else:
                    skipped.append(result.id)

        log_audit(
            AuditLog.Action.ADMIN_ACTION,
            request=request,
            user=request.user,
            identifier=f'Bulk unapprove {count} results',
            extra={'result_ids': result_ids, 'unapproved_count': count, 'skipped_ids': skipped},
        )
        return Response({
            'message': f'{count} result(s) moved to pending review',
            'unapproved_count': count,
            'skipped_count': len(skipped),
            'skipped_ids': skipped,
        })

    @action(detail=False, methods=['post'])
    def bulk_delete(self, request):
        """Bulk soft-delete results (department scope)."""
        if not can_manage_department_results(request.user):
            return Response(
                {'error': 'Only Department Admin (HOD) can delete results'},
                status=status.HTTP_403_FORBIDDEN,
            )
        result_ids = request.data.get('result_ids', [])
        if not result_ids:
            return Response({'error': 'result_ids array is required'}, status=status.HTTP_400_BAD_REQUEST)

        results = self.get_queryset().filter(id__in=result_ids, is_deleted=False)
        deleted_count = 0
        skipped = []
        with transaction.atomic():
            for result in results:
                if _soft_delete_result(result, request.user):
                    deleted_count += 1
                else:
                    skipped.append(result.id)

        log_audit(
            AuditLog.Action.RESULT_DELETED,
            request=request,
            user=request.user,
            identifier=f'Bulk delete {deleted_count} results',
            extra={
                'result_ids': result_ids,
                'deleted_count': deleted_count,
                'skipped_ids': skipped,
                'soft_delete': True,
            },
        )
        return Response({
            'message': f'{deleted_count} result(s) deleted',
            'deleted_count': deleted_count,
            'skipped_count': len(skipped),
            'skipped_ids': skipped,
        })

    @action(detail=True, methods=['get'])
    def versions(self, request, pk=None):
        """Get version history for a result."""
        result = self.get_object()
        versions = ResultVersion.objects.filter(result=result).order_by('-version_number')
        
        version_data = []
        for version in versions:
            version_data.append({
                'version_number': version.version_number,
                'score': str(version.score),
                'grade': version.grade,
                'grade_point': str(version.grade_point) if version.grade_point else None,
                'remark': version.remark,
                'status': version.status,
                'changed_by': {
                    'id': version.changed_by.id,
                    'email': version.changed_by.email,
                    'name': version.changed_by.get_full_name(),
                } if version.changed_by else None,
                'change_reason': version.change_reason,
                'checksum': version.checksum,
                'created_at': version.created_at.isoformat(),
            })
        
        return Response({
            'result_id': result.id,
            'versions': version_data
        })

    @action(detail=False, methods=['get'])
    def summary_stats(self, request):
        """Get dashboard summary statistics."""
        queryset = self.get_queryset()
        
        now = timezone.now()
        start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        
        stats = {
            'pending_approvals': queryset.filter(
                status__in=('HOD_REVIEW', 'SUBMITTED', 'DRAFT', 'PENDING')
            ).count(),
            'approved': queryset.filter(status__in=('LOCKED_PUBLISHED', 'APPROVED')).count(),
            'rejected': queryset.filter(status='REJECTED').count(),
            'uploads_this_month': queryset.filter(created_at__gte=start_of_month).count(),
            'total_results': queryset.count(),
            'available_sessions': sorted(
                {s for s in queryset.values_list('session', flat=True) if s},
                reverse=True,
            ),
        }
        
        return Response(stats)
