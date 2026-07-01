"""
Views for academic operations with group-based permissions
All views are protected by Django Groups & Permissions
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from django.shortcuts import get_object_or_404
from django.db import models, transaction

from .models import Course, Result, GPA, ResultVersion
from .serializers import (
    CourseSerializer, ResultSerializer, ResultUploadSerializer,
    ResultApprovalSerializer, GPASerializer, CSVUploadSerializer,
    ManualResultEntrySerializer, ResultSummarySerializer,
)
from .permissions import (
    CanUploadResult, CanApproveResult, CanViewAllResults,
    CanViewOwnResult, IsOwnerOrStaff, IsHOD, IsExaminer, CanDeleteResult,
)
from apps.accounts.scope import filter_by_scope, build_scope, ScopeLevel
from .services import (
    ResultUploadService, GPACalculationService, ResultSummaryService
)
from apps.accounts.models import User, UserRole
from apps.accounts.audit import log_audit
from apps.accounts.models import AuditLog
import csv
import io
from decimal import Decimal


def _format_gpa_two_dp(val):
    """Format GPA/CGPA to exactly 2 decimal places for display (as on result upload)."""
    if val is None or str(val).strip() == '':
        return ''
    try:
        return f'{float(val):.2f}'
    except (TypeError, ValueError):
        return str(val).strip()


class CourseViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Courses are READ-ONLY for all authenticated users.
    Only admins can create/update via Django admin.
    ScopeMiddleware + filter_by_scope enforce:
    - EXAMINER: only courses assigned via CourseAssignment
    - HOD / FACULTY_ADMIN: faculty/department courses
    - SUPER_ADMIN: all
    """
    serializer_class = CourseSerializer
    permission_classes = [IsAuthenticated]  # Anyone logged in can view courses

    def get_queryset(self):
        qs = Course.objects.filter(is_active=True)
        scope = getattr(self.request, 'scope', None) or build_scope(self.request.user)
        if scope and scope.level < ScopeLevel.GLOBAL:
            qs = filter_by_scope(qs, self.request.user, self.request)
        return qs

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def my_assigned(self, request):
        """
        EXAMINER: list assigned active courses only (view-only).
        GET /api/academics/courses/my_assigned/
        """
        user = request.user
        scope = getattr(request, 'scope', None) or build_scope(user)
        if scope is None or scope.level != ScopeLevel.EXAMINER:
            return Response(
                {'detail': 'This endpoint is for examiners only.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        assigned_ids = getattr(scope, 'assigned_course_ids', None) or []
        if not assigned_ids:
            courses = Course.objects.none()
        else:
            courses = Course.objects.filter(is_active=True, id__in=assigned_ids)

        try:
            log_audit(
                AuditLog.Action.RESULT_IMPORT_REPORT_DOWNLOAD,
                request=request,
                user=user,
                identifier=user.email or user.get_username(),
                extra={
                    'source': 'api_examiner_assigned_courses',
                    'assigned_course_count': courses.count(),
                },
            )
        except Exception:
            pass

        return Response(self.get_serializer(courses, many=True).data)


class ResultViewSet(viewsets.ModelViewSet):
    """
    Result management with role-based permissions:
    - Students: View own results only
    - Examiners: Upload and view all results
    - HOD: Approve, modify, and delete results
    """
    queryset = Result.objects.all()
    serializer_class = ResultSerializer
    
    def get_permissions(self):
        """Set permissions based on action"""
        if self.action == 'list':
            # Students can list (filtered to own), Staff can list all
            permission_classes = [IsAuthenticated]
        elif self.action == 'retrieve':
            # Anyone can retrieve if they own it or are staff
            permission_classes = [IsAuthenticated, IsOwnerOrStaff]
        elif self.action in ['upload_results', 'create']:
            # Only Examiners and HOD can upload
            permission_classes = [IsAuthenticated, CanUploadResult]
        elif self.action == 'approve':
            # Only HOD can approve
            permission_classes = [IsAuthenticated, CanApproveResult]
        elif self.action in ['update', 'partial_update']:
            # Only Examiners and HOD can update
            permission_classes = [IsAuthenticated, CanUploadResult]
        elif self.action == 'destroy':
            # HOD and global admins can delete unpublished results
            permission_classes = [IsAuthenticated, CanDeleteResult]
        else:
            permission_classes = [IsAuthenticated]
        
        return [permission() for permission in permission_classes]
    
    def get_queryset(self):
        """
        Filter results based on user role and scope:
        - Students: Only their own results
        - EXAMINER: Results for assigned courses only (scope-filtered)
        - HOD / FACULTY_ADMIN: Department/faculty results
        - SUPER_ADMIN: All results
        """
        user = self.request.user

        if user.role == UserRole.STUDENT:
            return Result.objects.filter(student=user, is_deleted=False).select_related(
                'student', 'course', 'department', 'uploaded_by', 'approved_by', 'locked_by', 'upload_batch',
            )

        qs = Result.objects.filter(is_deleted=False).select_related(
            'student', 'course', 'department', 'uploaded_by', 'approved_by', 'locked_by', 'upload_batch',
        )
        scope = getattr(self.request, 'scope', None) or build_scope(user)
        if scope and scope.level < ScopeLevel.GLOBAL:
            qs = filter_by_scope(qs, user, self.request)
        return qs
    
    def perform_destroy(self, instance):
        """Audit before deleting a result (API)."""
        identifier = f'{instance.student.student_id or instance.student.email} {instance.course.code} {instance.session} {instance.semester}'
        extra = {'result_id': instance.pk, 'course_code': instance.course.code, 'session': instance.session, 'semester': instance.semester, 'source': 'api'}
        log_audit(
            AuditLog.Action.RESULT_DELETED,
            request=self.request,
            user=self.request.user,
            identifier=identifier,
            extra=extra,
        )
        instance.delete()

    def list(self, request, *args, **kwargs):
        """List results with role-based filtering"""
        queryset = self.get_queryset()
        
        # Optional filters
        session = request.query_params.get('session')
        semester = request.query_params.get('semester')
        status_filter = request.query_params.get('status')
        
        if session:
            queryset = queryset.filter(session=session)
        if semester:
            queryset = queryset.filter(semester=semester)
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        # Audit: track staff/EXAMINER result views (read-only observability)
        if request.user.role != UserRole.STUDENT:
            identifier = request.user.email or request.user.get_username()
            log_audit(
                AuditLog.Action.RESULT_IMPORT_REPORT_DOWNLOAD,  # reuse as generic view/read log
                request=request,
                user=request.user,
                identifier=identifier,
                extra={
                    'source': 'api_results_list',
                    'count': queryset.count(),
                    'session': session,
                    'semester': semester,
                    'status_filter': status_filter,
                },
            )

        serializer = self.get_serializer(queryset, many=True)
        return Response({
            'count': queryset.count(),
            'results': serializer.data
        })
    
    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated, CanUploadResult])
    def upload_results(self, request):
        """
        Upload results (Examiner/HOD only)
        POST /api/academics/results/upload_results/
        
        Body: {
            "student": 1,
            "course": 1,
            "score": 85.5,
            "session": "2023/2024",
            "semester": "FIRST"
        }
        """
        serializer = ResultUploadSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(
                {'errors': serializer.errors},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Save result and set uploaded_by to current user
        result = serializer.save(
            uploaded_by=request.user,
            status='PENDING'
        )
        identifier = f'{result.student.student_id or result.student.email} {result.course.code} {result.session} {result.semester}'
        log_audit(
            AuditLog.Action.RESULT_CREATED,
            request=request,
            user=request.user,
            identifier=identifier,
            extra={'result_id': result.pk, 'course_code': result.course.code, 'session': result.session, 'semester': result.semester},
        )
        return Response(
            {
                'message': 'Result uploaded successfully',
                'result': ResultSerializer(result).data
            },
            status=status.HTTP_201_CREATED
        )
    
    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, CanApproveResult])
    def approve(self, request, pk=None):
        """
        Approve or reject a result (HOD only)
        POST /api/academics/results/{id}/approve/
        
        Body: {
            "status": "APPROVED"  // or "REJECTED"
        }
        """
        result = self.get_object()
        serializer = ResultApprovalSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(
                {'errors': serializer.errors},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Update result status
        new_status = serializer.validated_data['status']
        result.status = new_status
        result.approved_by = request.user
        result.approved_at = timezone.now()
        result.save()
        action_type = AuditLog.Action.RESULT_SINGLE_APPROVED if new_status == 'APPROVED' else AuditLog.Action.RESULT_SINGLE_REJECTED
        identifier = f'{result.student.student_id or result.student.email} {result.course.code} {result.session} {result.semester}'
        log_audit(
            action_type,
            request=request,
            user=request.user,
            identifier=identifier,
            extra={'result_id': result.pk, 'course_code': result.course.code, 'session': result.session, 'semester': result.semester},
        )
        return Response(
            {
                'message': f'Result {result.status.lower()} successfully',
                'result': ResultSerializer(result).data
            },
            status=status.HTTP_200_OK
        )

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def by_course(self, request):
        """
        List results for a given course, respecting scope.
        EXAMINER: view-only, restricted to assigned courses.
        GET /api/academics/results/by_course/?course_id=<id>
        """
        course_id = request.query_params.get('course_id')
        if not course_id:
            return Response(
                {'detail': 'course_id query parameter is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            course_id_int = int(course_id)
        except (TypeError, ValueError):
            return Response(
                {'detail': 'course_id must be an integer'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        queryset = self.get_queryset().filter(course_id=course_id_int)

        # Audit: track per-course views
        identifier = f'{request.user.email or request.user.get_username()}|course_id={course_id_int}'
        log_audit(
            AuditLog.Action.RESULT_IMPORT_REPORT_DOWNLOAD,
            request=request,
            user=request.user,
            identifier=identifier,
            extra={
                'source': 'api_results_by_course',
                'course_id': course_id_int,
                'count': queryset.count(),
            },
        )

        serializer = self.get_serializer(queryset, many=True)
        return Response({'count': queryset.count(), 'results': serializer.data})
    
    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def my_results(self, request):
        """
        Get authenticated student's own results
        GET /api/academics/results/my_results/
        """
        import logging
        logger = logging.getLogger(__name__)

        # Allow both enum and string role comparison
        role = getattr(request.user, 'role', None)
        is_student = (
            role == UserRole.STUDENT
            or (isinstance(role, str) and role.upper() == 'STUDENT')
        )
        if not is_student:
            return Response(
                {'error': 'This endpoint is for students only'},
                status=status.HTTP_403_FORBIDDEN
            )

        try:
            # Students see results that are fully approved OR locked & published
            results = Result.objects.filter(
                student=request.user,
                status__in=['APPROVED', 'LOCKED_PUBLISHED']
            ).select_related(
                'course', 'student', 'department', 'uploaded_by', 'approved_by', 'locked_by'
            ).order_by('-session', '-semester', 'course__code')
            serializer = ResultSerializer(results, many=True)
            results_data = serializer.data

            # Get semester summaries for all sessions/semesters
            from .models import SemesterSummary
            summaries = {}
            unique_sessions_semesters = set()
            for result in results:
                key = f"{result.session}_{result.semester}"
                unique_sessions_semesters.add((result.session, result.semester))

            for session, semester in unique_sessions_semesters:
                key = f"{session}_{semester}"
                try:
                    summary = SemesterSummary.objects.get(
                        student=request.user,
                        session=session,
                        semester=semester
                    )
                    summaries[key] = {
                        'le': getattr(summary, 'le', ''),
                        'nss': getattr(summary, 'nss', ''),
                        'rcu': getattr(summary, 'rcu', ''),
                        'ecu': getattr(summary, 'ecu', ''),
                        'cp': getattr(summary, 'cp', ''),
                        'gpa': _format_gpa_two_dp(getattr(summary, 'gpa', '')),
                        'trcu': getattr(summary, 'trcu', ''),
                        'tecu': getattr(summary, 'tecu', ''),
                        'tcp': getattr(summary, 'tcp', ''),
                        'pcgpa': _format_gpa_two_dp(getattr(summary, 'pcgpa', '')),
                        'cgpa': _format_gpa_two_dp(getattr(summary, 'cgpa', '')),
                        'outstanding_courses': getattr(summary, 'outstanding_courses', ''),
                        'remarks': getattr(summary, 'remarks', ''),
                        'standing': getattr(summary, 'standing', ''),
                        'raw_summary': getattr(summary, 'raw_summary', ''),
                    }
                except SemesterSummary.DoesNotExist:
                    # No calculation: show only what was uploaded. Use empty if no summary in file.
                    summaries[key] = {
                        'le': '',
                        'nss': '',
                        'rcu': '',
                        'ecu': '',
                        'cp': '',
                        'gpa': '',
                        'trcu': '',
                        'tecu': '',
                        'tcp': '',
                        'pcgpa': '',
                        'cgpa': '',
                        'outstanding_courses': '',
                        'remarks': '',
                        'standing': '',
                        'raw_summary': '',
                    }

            return Response({
                'count': len(results_data),
                'results': results_data,
                'summaries': summaries
            })
        except Exception as e:
            logger.exception('my_results failed: %s', e)
            from django.conf import settings
            err_detail = str(e) if getattr(settings, 'DEBUG', False) else 'Failed to load results.'
            return Response(
                {'error': err_detail, 'detail': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated, CanUploadResult])
    def upload_csv(self, request):
        """
        Upload results from CSV file
        POST /api/academics/results/upload_csv/
        
        Body (form-data):
        - file: CSV file
        - session: Academic session (e.g., "2023/2024")
        - semester: "FIRST" or "SECOND"
        
        CSV Format:
        matric_number, course_code, course_title, credit_unit, score, grade, semester, level
        U22/FNS/CSC/0001, CSC301, .Net Programming, 3, 75, A, FIRST, 300
        """
        if 'file' not in request.FILES:
            return Response(
                {'error': 'No CSV file provided'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        csv_file = request.FILES['file']
        session = request.data.get('session')
        semester = request.data.get('semester')
        
        if not session or not semester:
            return Response(
                {'error': 'Session and semester are required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Read CSV
        try:
            decoded_file = csv_file.read().decode('utf-8')
            io_string = io.StringIO(decoded_file)
            reader = csv.DictReader(io_string)
            
            results_data = []
            for row in reader:
                # Normalize column names (handle variations)
                data = {
                    'student_id': row.get('matric_number') or row.get('student_id'),
                    'course_code': row.get('course_code'),
                    'course_title': row.get('course_title'),
                    'credit_unit': row.get('credit_unit') or row.get('credit_units'),
                    'score': row.get('score'),
                    'session': row.get('session') or session,
                    'semester': row.get('semester') or semester,
                    'level': row.get('level'),
                }
                results_data.append(data)
            
            # Bulk create results
            log_audit(
                AuditLog.Action.RESULT_UPLOAD_STARTED,
                request=request,
                user=request.user,
                identifier=csv_file.name,
                extra={'row_count': len(results_data), 'session': session, 'semester': semester, 'source': 'api_csv'},
            )
            created_results, errors = ResultUploadService.bulk_create_results(
                results_data, request.user
            )
            log_audit(
                AuditLog.Action.RESULT_UPLOAD_COMPLETED,
                request=request,
                user=request.user,
                identifier=csv_file.name,
                extra={'success_count': len(created_results), 'error_count': len(errors), 'source': 'api_csv'},
            )
            return Response({
                'message': f'Successfully uploaded {len(created_results)} results',
                'created': len(created_results),
                'errors': errors,
                'results': ResultSerializer(created_results, many=True).data
            }, status=status.HTTP_201_CREATED if created_results else status.HTTP_400_BAD_REQUEST)
            
        except Exception as e:
            return Response(
                {'error': f'Error processing CSV: {str(e)}'},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated, CanUploadResult])
    def manual_entry(self, request):
        """
        Manual result entry (single or multiple)
        POST /api/academics/results/manual_entry/
        
        Body (single):
        {
            "student_id": "U22/FNS/CSC/0001",
            "course_code": "CSC301",
            "score": 75,
            "session": "2023/2024",
            "semester": "FIRST"
        }
        
        Body (bulk):
        {
            "results": [
                {"student_id": "...", "course_code": "...", "score": 75, ...},
                ...
            ]
        }
        """
        serializer = ManualResultEntrySerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(
                {'errors': serializer.errors},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        data = serializer.validated_data
        
        # Handle bulk entry
        if 'results' in data:
            results_data = data['results']
            created_results, errors = ResultUploadService.bulk_create_results(
                results_data, request.user
            )
            if created_results:
                log_audit(
                    AuditLog.Action.RESULT_MANUAL_ENTRY,
                    request=request,
                    user=request.user,
                    identifier='api_bulk',
                    extra={'created_count': len(created_results), 'error_count': len(errors), 'source': 'api_manual_entry'},
                )
            return Response({
                'message': f'Successfully created {len(created_results)} results',
                'created': len(created_results),
                'errors': errors,
                'results': ResultSerializer(created_results, many=True).data
            }, status=status.HTTP_201_CREATED if created_results else status.HTTP_400_BAD_REQUEST)
        
        # Handle single entry
        else:
            try:
                result = ResultUploadService.create_result(
                    student_id=data['student_id'],
                    course_code=data['course_code'],
                    score=Decimal(str(data['score'])),
                    session=data['session'],
                    semester=data['semester'],
                    uploaded_by=request.user
                )
                identifier = f'{result.student.student_id or result.student.email} {result.course.code} {result.session} {result.semester}'
                log_audit(
                    AuditLog.Action.RESULT_CREATED,
                    request=request,
                    user=request.user,
                    identifier=identifier,
                    extra={'result_id': result.pk, 'course_code': result.course.code, 'source': 'api_manual_entry'},
                )
                return Response({
                    'message': 'Result created successfully',
                    'result': ResultSerializer(result).data
                }, status=status.HTTP_201_CREATED)
                
            except ValueError as e:
                return Response(
                    {'error': str(e)},
                    status=status.HTTP_400_BAD_REQUEST
                )
    
    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def summary(self, request):
        """
        Get result summary for a student
        GET /api/academics/results/summary/?student_id=U22/FNS/CSC/0001&session=2023/2024&semester=FIRST
        
        For students: Returns their own summary
        For staff: Requires student_id parameter
        """
        user = request.user
        
        # Determine student
        if user.role == UserRole.STUDENT:
            student = user
        else:
            student_id = request.query_params.get('student_id')
            if not student_id:
                return Response(
                    {'error': 'student_id parameter required for staff users'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            try:
                student = User.objects.get(student_id=student_id, role=UserRole.STUDENT)
            except User.DoesNotExist:
                return Response(
                    {'error': f'Student {student_id} not found'},
                    status=status.HTTP_404_NOT_FOUND
                )
            from apps.accounts.scope import staff_can_access_student
            if not staff_can_access_student(user, student):
                return Response(
                    {'error': 'Student is outside your scope'},
                    status=status.HTTP_403_FORBIDDEN,
                )
        
        session = request.query_params.get('session')
        semester = request.query_params.get('semester')
        
        if not session or not semester:
            return Response(
                {'error': 'session and semester parameters are required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        from .models import SemesterSummary
        try:
            stored = SemesterSummary.objects.get(
                student=student, session=session, semester=semester
            )
            summary = {
                'semester': semester,
                'session': session,
                'le': stored.le or '',
                'nss': stored.nss or '',
                'registered_credit_units': stored.rcu or '',
                'earned_credit_units': stored.ecu or '',
                'credit_points': stored.cp or '',
                'gpa': _format_gpa_two_dp(stored.gpa) or '',
                'courses_count': 0,
                'total_registered_credit_units': stored.trcu or '',
                'total_earned_credit_units': stored.tecu or '',
                'total_credit_points': stored.tcp or '',
                'cgpa': _format_gpa_two_dp(stored.cgpa) or '',
                'academic_standing': stored.standing or '',
                'previous_cgpa': _format_gpa_two_dp(stored.pcgpa or stored.cgpa) or '',
                'outstanding_courses': getattr(stored, 'outstanding_courses', '') or '',
                'remarks': getattr(stored, 'remarks', '') or '',
                'level': student.student_id.split('/')[0] if student.student_id else 'N/A',
            }
        except SemesterSummary.DoesNotExist:
            # No calculation: only show what was uploaded. Return empty if no summary in file.
            summary = {
                'semester': semester,
                'session': session,
                'le': '',
                'nss': '',
                'registered_credit_units': '',
                'earned_credit_units': '',
                'credit_points': '',
                'gpa': '',
                'courses_count': 0,
                'total_registered_credit_units': '',
                'total_earned_credit_units': '',
                'total_credit_points': '',
                'cgpa': '',
                'academic_standing': '',
                'previous_cgpa': '',
                'outstanding_courses': '',
                'remarks': '',
                'level': student.student_id.split('/')[0] if student.student_id else 'N/A',
            }
        
        return Response({
            'student': {
                'id': student.id,
                'student_id': student.student_id,
                'full_name': f'{student.first_name} {student.last_name}',
                'email': student.email
            },
            'summary': summary
        })


class GPAViewSet(viewsets.ReadOnlyModelViewSet):
    """
    GPA records (read-only for students, full access for staff)
    """
    queryset = GPA.objects.all()
    serializer_class = GPASerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """
        Students: Only their own GPA records
        Staff: All GPA records
        """
        user = self.request.user
        
        if user.role == UserRole.STUDENT:
            return GPA.objects.filter(student=user)
        qs = GPA.objects.all()
        return filter_by_scope(qs, user, self.request)
    
    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def my_gpa(self, request):
        """
        Get authenticated student's GPA records
        GET /api/academics/gpa/my_gpa/
        """
        import logging
        logger = logging.getLogger(__name__)

        role = getattr(request.user, 'role', None)
        is_student = (
            role == UserRole.STUDENT
            or (isinstance(role, str) and role.upper() == 'STUDENT')
        )
        if not is_student:
            return Response(
                {'error': 'This endpoint is for students only'},
                status=status.HTTP_403_FORBIDDEN
            )

        try:
            gpa_records = GPA.objects.filter(student=request.user).order_by('-created_at')
            serializer = GPASerializer(gpa_records, many=True)
            records_data = serializer.data
            return Response({
                'count': len(records_data),
                'records': records_data
            })
        except Exception as e:
            logger.exception('my_gpa failed: %s', e)
            from django.conf import settings
            err_detail = str(e) if getattr(settings, 'DEBUG', False) else 'Failed to load GPA records.'
            return Response(
                {'error': err_detail, 'detail': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def check_permissions(request):
    """
    Debug endpoint to check current user's permissions
    GET /api/academics/check-permissions/
    """
    user = request.user
    
    permissions_list = [
        'academics.view_course',
        'academics.add_result',
        'academics.view_result',
        'academics.change_result',
        'academics.delete_result',
        'academics.upload_result',
        'academics.approve_result',
        'academics.view_all_results',
        'academics.view_own_result',
        'academics.calculate_gpa',
        'academics.view_gpa',
    ]
    
    user_permissions = {
        perm: user.has_perm(perm)
        for perm in permissions_list
    }
    
    groups = [group.name for group in user.groups.all()]
    
    return Response({
        'user': {
            'email': user.email,
            'student_id': user.student_id,
            'role': user.role,
            'groups': groups,
        },
        'permissions': user_permissions
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated, CanUploadResult])
def get_students_list(request):
    """
    Typeahead/list of registered students (for manual entry and combo).
    Staff only. Case-insensitive search; reg_number stored and returned in uppercase.
    GET /api/academics/students/?search=u22&limit=10
    """
    from apps.accounts.serializers import UserSerializer
    
    students = User.objects.filter(
        role=UserRole.STUDENT,
        student_id__isnull=False
    ).exclude(student_id='').order_by('student_id')
    
    search = (request.query_params.get('search') or '').strip()
    if search:
        # Case-insensitive; student_id is stored uppercase
        students = students.filter(
            models.Q(student_id__icontains=search.upper()) |
            models.Q(first_name__icontains=search) |
            models.Q(last_name__icontains=search) |
            models.Q(email__icontains=search)
        )
    
    limit = request.query_params.get('limit')
    if limit is not None:
        try:
            n = min(int(limit), 50)
            students = students[:n]
        except ValueError:
            pass
    
    serializer = UserSerializer(students, many=True)
    return Response({
        'count': len(serializer.data),
        'students': serializer.data
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def emergency_unlock_result_view(request, pk):
    """
    POST /api/academics/results/<id>/emergency_unlock/
    SUPER_ADMIN only. Unlocks a LOCKED_PUBLISHED result with mandatory reason.
    Creates a ResultVersion (audit trail) and a separate EMERGENCY_UNLOCK audit log.
    """
    user = request.user
    if user.role != UserRole.SUPER_ADMIN and not user.is_superuser:
        return Response(
            {'detail': 'Only SUPER_ADMIN can perform emergency unlock.'},
            status=status.HTTP_403_FORBIDDEN,
        )
    reason = (request.data.get('reason') or '').strip()
    if not reason:
        return Response(
            {'error': 'Reason is required for emergency unlock.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    result = get_object_or_404(Result, pk=pk)
    if result.status != 'LOCKED_PUBLISHED':
        return Response(
            {'error': f'Only LOCKED_PUBLISHED results can be unlocked. Current status: {result.status}'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    with transaction.atomic():
        max_version = ResultVersion.objects.filter(result=result).aggregate(
            max_v=models.Max('version_number')
        )['max_v'] or 0
        ResultVersion.objects.create(
            result=result,
            version_number=max_version + 1,
            score=result.score,
            grade=result.grade,
            grade_point=result.grade_point,
            remark=result.remark or '',
            status=result.status,
            changed_by=user,
            change_reason=f'Emergency unlock: {reason[:500]}',
        )
        result.status = 'HOD_REVIEW'
        result.locked_at = None
        result.locked_by = None
        result.is_editable = True
        result.save(update_fields=['status', 'locked_at', 'locked_by', 'is_editable'])
        audit_entry = log_audit(
            AuditLog.Action.EMERGENCY_UNLOCK,
            request=request,
            user=user,
            identifier=f'Result {result.id}',
            extra={
                'result_id': result.id,
                'reason': reason[:1000],
                'previous_status': 'LOCKED_PUBLISHED',
            },
        )
        if audit_entry:
            from apps.accounts.audit_forwarding import forward_audit_to_superadmin
            forward_audit_to_superadmin(audit_entry, event_type='WEBHOOK')
    from .serializers import ResultSerializer
    serializer = ResultSerializer(result)
    return Response({
        'message': 'Result unlocked. Status set to HOD_REVIEW.',
        'result': serializer.data,
    }, status=status.HTTP_200_OK)
