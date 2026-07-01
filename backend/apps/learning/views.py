"""
Learning Management DRF ViewSets.
Access control mirrors Academic Core scope rules.
Students see enrolled content only; examiners manage their own offerings.
"""
import secrets

from django.utils import timezone
from django.db import transaction
from django.db.models import Q
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from datetime import timedelta

from apps.accounts.models import UserRole
from apps.accounts.scope import filter_by_scope, build_scope, ScopeLevel
from .models import (
    LMSOffering, Module, Lesson, Quiz, QuizQuestion,
    QuizAttempt, Assignment, Submission, Enrollment, LessonProgress,
)
from .serializers import (
    LMSOfferingListSerializer, LMSOfferingDetailSerializer,
    ModuleSerializer, LessonSerializer, LessonStudentSerializer,
    QuizSerializer, QuizStudentSerializer, QuizAttemptSerializer,
    QuizSubmitSerializer, AssignmentSerializer, SubmissionSerializer,
    GradeSubmissionSerializer, EnrollmentSerializer, LessonProgressSerializer,
    QuizQuestionSerializer,
)
from .media_access import (
    can_access_lesson_media,
    lesson_media_filename,
    make_media_token,
    verify_media_token,
)
from .permissions import IsInstructor, IsOfferingInstructor

SUBMIT_GRACE_SECONDS = 30


def _assignment_offering_context(assignment):
    offering = assignment.lesson.module.offering
    course = offering.course
    dept = course.department
    return {
        'course_code': course.code,
        'course_title': course.title,
        'assignment_title': assignment.title,
        'department_name': dept.name if dept else '',
        'faculty_name': dept.faculty.name if dept and dept.faculty else '',
        'session': offering.session,
        'semester': offering.get_semester_display() if hasattr(offering, 'get_semester_display') else offering.semester,
    }


def _run_ai_suggestion(assignment, submission):
    from .services.ai_grading_service import suggest_grade
    ctx = _assignment_offering_context(assignment)
    ok, result = suggest_grade(
        course_code=ctx['course_code'],
        course_title=ctx['course_title'],
        assignment_title=ctx['assignment_title'],
        question=assignment.description or assignment.title,
        student_answer=submission.content,
        rubric=getattr(assignment, 'rubric', '') or '',
        max_score=float(assignment.max_score or 100),
    )
    if not ok:
        return False, result
    submission.ai_suggested_score = result.get('suggested_score')
    submission.ai_feedback = result.get('feedback', '')
    submission.ai_confidence_score = result.get('confidence_score')
    submission.ai_strengths = result.get('strengths') or []
    submission.ai_weaknesses = result.get('weaknesses') or []
    submission.ai_graded = True
    submission.save(update_fields=[
        'ai_suggested_score', 'ai_feedback', 'ai_confidence_score',
        'ai_strengths', 'ai_weaknesses', 'ai_graded',
    ])
    return True, result


def _finalize_quiz_attempt(
    attempt,
    quiz,
    *,
    answers,
    focus_loss_count=0,
    violations=None,
    timed_out=False,
    auto_submitted=False,
):
    """Grade and persist a quiz attempt (normal, timed out, or violation auto-submit)."""
    attempt.answers = answers or {}
    attempt.focus_loss_count = focus_loss_count
    attempt.violation_log = violations or []
    attempt.auto_submitted = auto_submitted
    attempt.submitted_at = timezone.now()
    attempt.status = 'timed_out' if timed_out else 'submitted'
    score = attempt.calculate_score()
    attempt.score = score
    attempt.passed = score >= quiz.passing_score
    attempt.save()
    if attempt.passed:
        progress, _ = LessonProgress.objects.get_or_create(
            lesson=quiz.lesson, student=attempt.student
        )
        progress.mark_complete()
    return attempt


# ─── LMS Offering ────────────────────────────────────────────────────────────

def student_catalog_queryset(user):
    """
    Published offerings a student may browse and enroll in.
    All lecturers' published offerings for the student's level (university-wide catalog).
    """
    qs = LMSOffering.objects.filter(
        is_published=True, enrollment_open=True
    ).select_related('course', 'course__department', 'instructor')
    if user.level:
        qs = qs.filter(course__level=user.level)
    return qs.order_by('-session', 'semester', 'course__code')


def generate_enrollment_pin():
    return f'{secrets.randbelow(9000) + 1000:04d}'


class LMSOfferingViewSet(viewsets.ModelViewSet):
    """
    Course offerings (LMS layer over Academic Core courses).
    - Students: see published offerings for their level/department
    - Examiners: see their own offerings
    - HOD+: see all offerings in scope
    """
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action in ('retrieve', 'create', 'update', 'partial_update'):
            return LMSOfferingDetailSerializer
        return LMSOfferingListSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        output = LMSOfferingDetailSerializer(
            serializer.instance, context={'request': request}
        )
        return Response(output.data, status=status.HTTP_201_CREATED)

    def get_queryset(self):
        user = self.request.user
        qs = LMSOffering.objects.select_related('course', 'course__department', 'instructor')

        if user.role == UserRole.STUDENT:
            enrolled_ids = Enrollment.objects.filter(
                student=user, is_active=True
            ).values_list('offering_id', flat=True)
            if self.action == 'retrieve':
                # Enrolled courses + catalog preview for discovery / enroll flow
                catalog_ids = student_catalog_queryset(user).values_list('id', flat=True)
                qs = qs.filter(is_published=True).filter(
                    Q(id__in=enrolled_ids) | Q(id__in=catalog_ids)
                )
            else:
                qs = qs.filter(is_published=True).filter(id__in=enrolled_ids)
        elif user.role == UserRole.EXAMINER:
            # Examiners see only their own offerings
            qs = qs.filter(instructor=user)
        else:
            # HOD / Faculty Admin / Super Admin: scoped
            scope = getattr(self.request, 'scope', None) or build_scope(user)
            if scope and scope.level < ScopeLevel.GLOBAL:
                if scope.level >= ScopeLevel.FACULTY and scope.faculty_id:
                    qs = qs.filter(course__department__faculty_id=scope.faculty_id)
                elif scope.department_id:
                    qs = qs.filter(course__department_id=scope.department_id)

        return qs.order_by('-session', 'semester', 'course__code')

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [IsAuthenticated(), IsInstructor()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        user = self.request.user
        pin = generate_enrollment_pin()
        if user.role == UserRole.EXAMINER:
            serializer.save(instructor=user, enrollment_pin=pin)
        else:
            serializer.save(enrollment_pin=pin)

    @action(detail=False, methods=['get'])
    def catalog(self, request):
        """
        Public course catalog — all published offerings for the student's level
        (all lecturers, university-wide).
        GET /api/learning/offerings/catalog/
        """
        user = request.user
        if user.role != UserRole.STUDENT:
            return Response(
                {'detail': 'Catalog is for students only.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        qs = student_catalog_queryset(user)
        serializer = LMSOfferingListSerializer(
            qs, many=True, context={'request': request}
        )
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def my_offerings(self, request):
        """
        Examiner: list offerings where I am the instructor.
        GET /api/learning/offerings/my_offerings/
        """
        if request.user.role != UserRole.EXAMINER:
            return Response(
                {'detail': 'This endpoint is for instructors only.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        offerings = LMSOffering.objects.filter(
            instructor=request.user
        ).select_related('course', 'course__department')
        serializer = LMSOfferingDetailSerializer(
            offerings, many=True, context={'request': request}
        )
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def students(self, request, pk=None):
        """
        List students for an offering: LMS enrollments + official course registrations
        + students with published results for this course/session/semester.
        GET /api/learning/offerings/{id}/students/
        """
        from apps.core.models import AcademicSession, StudentCourseRegistration
        from apps.academics.models import Result

        offering = self.get_object()
        user = request.user
        if user.role not in (
            UserRole.EXAMINER, UserRole.DEPARTMENT_ADMIN, UserRole.HOD,
            UserRole.FACULTY_ADMIN, UserRole.SUPER_ADMIN,
        ):
            return Response(status=status.HTTP_403_FORBIDDEN)

        total_lessons = Lesson.objects.filter(
            module__offering=offering, is_published=True
        ).count()

        def _progress_for(student):
            completed = LessonProgress.objects.filter(
                lesson__module__offering=offering,
                student=student,
                completed=True,
            ).count()
            return (
                round((completed / total_lessons) * 100, 1) if total_lessons else 0,
                completed,
            )

        def _row(student, *, source, enrolled_at=None):
            pct, completed = _progress_for(student)
            return {
                'user_id': student.id,
                'student_id': student.student_id or '',
                'full_name': student.get_full_name(),
                'email': student.email or '',
                'enrolled_at': enrolled_at,
                'source': source,
                'progress_percent': pct,
                'lessons_completed': completed,
                'total_lessons': total_lessons,
            }

        seen: set[int] = set()
        data = []

        for enr in offering.enrollments.filter(is_active=True).select_related('student'):
            if enr.student_id in seen:
                continue
            seen.add(enr.student_id)
            data.append(_row(enr.student, source='lms', enrolled_at=enr.enrolled_at))

        session_obj = AcademicSession.objects.filter(name=offering.session).first()
        if session_obj:
            regs = StudentCourseRegistration.objects.filter(
                course=offering.course,
                session=session_obj,
                semester=offering.semester,
                status='registered',
            ).select_related('student')
            for reg in regs:
                if reg.student_id in seen:
                    continue
                seen.add(reg.student_id)
                data.append(_row(reg.student, source='registration', enrolled_at=reg.registered_at))

        published_statuses = ['APPROVED', 'LOCKED_PUBLISHED']
        result_student_ids = (
            Result.objects.filter(
                course=offering.course,
                session=offering.session,
                semester=offering.semester,
                status__in=published_statuses,
                is_deleted=False,
            )
            .values_list('student_id', flat=True)
            .distinct()
        )
        if result_student_ids:
            from apps.accounts.models import User
            for st in User.objects.filter(id__in=result_student_ids, role=UserRole.STUDENT):
                if st.id in seen:
                    continue
                seen.add(st.id)
                data.append(_row(st, source='results'))

        data.sort(key=lambda x: (x['student_id'] or x['full_name'] or '').lower())
        return Response({'count': len(data), 'students': data})


# ─── Enrollment ──────────────────────────────────────────────────────────────

class EnrollmentViewSet(viewsets.GenericViewSet):
    """Student enrollment management."""
    permission_classes = [IsAuthenticated]
    serializer_class = EnrollmentSerializer

    def get_queryset(self):
        user = self.request.user
        if user.role == UserRole.STUDENT:
            return Enrollment.objects.filter(
                student=user
            ).select_related('offering__course', 'offering__instructor')
        # Staff: see all enrollments in scope
        return Enrollment.objects.select_related(
            'offering__course', 'student'
        ).all()

    @action(detail=False, methods=['get'])
    def my_enrollments(self, request):
        """GET /api/learning/enrollments/my_enrollments/"""
        if request.user.role != UserRole.STUDENT:
            return Response(
                {'detail': 'This endpoint is for students only.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        enrollments = Enrollment.objects.filter(
            student=request.user, is_active=True
        ).select_related('offering__course', 'offering__instructor')
        serializer = EnrollmentSerializer(
            enrollments, many=True, context={'request': request}
        )
        return Response(serializer.data)

    @action(detail=False, methods=['post'])
    def enroll(self, request):
        """
        Enroll the authenticated student in an offering.
        POST /api/learning/enrollments/enroll/
        Body: { "offering_id": <int> }
        """
        if request.user.role != UserRole.STUDENT:
            return Response(
                {'detail': 'Only students can enroll.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        offering_id = request.data.get('offering_id')
        if not offering_id:
            return Response(
                {'detail': 'offering_id is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            offering = LMSOffering.objects.get(pk=offering_id, is_published=True)
        except LMSOffering.DoesNotExist:
            return Response(
                {'detail': 'Offering not found or not available.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not offering.enrollment_open:
            return Response(
                {'detail': 'Enrollment is closed for this offering.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Eligibility — must appear in catalog for this student
        if not student_catalog_queryset(request.user).filter(pk=offering.pk).exists():
            return Response(
                {'detail': 'This course is not available for your level.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        if offering.enrollment_pin:
            submitted_pin = str(request.data.get('pin', '')).strip()
            if submitted_pin != offering.enrollment_pin:
                return Response(
                    {'detail': 'Incorrect enrollment PIN. Ask your lecturer for the 4-digit code.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
        enrollment, created = Enrollment.objects.get_or_create(
            offering=offering, student=request.user,
            defaults={'is_active': True},
        )
        if not created and not enrollment.is_active:
            enrollment.is_active = True
            enrollment.save(update_fields=['is_active'])
        serializer = EnrollmentSerializer(enrollment, context={'request': request})
        return Response(
            serializer.data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @action(detail=False, methods=['post'])
    def unenroll(self, request):
        """POST /api/learning/enrollments/unenroll/ — Body: {offering_id}"""
        if request.user.role != UserRole.STUDENT:
            return Response(status=status.HTTP_403_FORBIDDEN)
        offering_id = request.data.get('offering_id')
        updated = Enrollment.objects.filter(
            offering_id=offering_id, student=request.user
        ).update(is_active=False)
        if not updated:
            return Response(
                {'detail': 'Enrollment not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response({'detail': 'Unenrolled successfully.'})


# ─── Module ViewSet ───────────────────────────────────────────────────────────

class ModuleViewSet(viewsets.ModelViewSet):
    """Modules within an LMS Offering. Write access: instructor / HOD+."""
    permission_classes = [IsAuthenticated]
    serializer_class = ModuleSerializer

    def get_queryset(self):
        offering_id = self.kwargs.get('offering_pk') or self.request.query_params.get('offering')
        qs = Module.objects.select_related('offering__course').prefetch_related(
            'lessons__quiz__questions', 'lessons__assignment'
        )
        if offering_id:
            qs = qs.filter(offering_id=offering_id)
        user = self.request.user
        if user.role == UserRole.STUDENT:
            qs = qs.filter(is_published=True)
        elif user.role == UserRole.EXAMINER:
            qs = qs.filter(offering__instructor=user)
        return qs.order_by('order')

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [IsAuthenticated(), IsInstructor()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        offering = serializer.validated_data['offering']
        user = self.request.user
        if user.role == UserRole.EXAMINER and offering.instructor_id != user.id:
            raise PermissionDenied('You can only add modules to your own offerings.')
        serializer.save()


# ─── Lesson ViewSet ───────────────────────────────────────────────────────────

class LessonViewSet(viewsets.ModelViewSet):
    """Lessons within a Module."""
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        user = self.request.user
        if user.role == UserRole.STUDENT:
            return LessonStudentSerializer
        return LessonSerializer

    def get_queryset(self):
        module_id = self.kwargs.get('module_pk') or self.request.query_params.get('module')
        qs = Lesson.objects.select_related('module__offering').prefetch_related(
            'quiz__questions', 'assignment'
        )
        if module_id:
            qs = qs.filter(module_id=module_id)
        user = self.request.user
        if user.role == UserRole.STUDENT:
            qs = qs.filter(is_published=True)
        elif user.role == UserRole.EXAMINER:
            qs = qs.filter(module__offering__instructor=user)
        return qs.order_by('order')

    def get_permissions(self):
        if self.action == 'media_file':
            return [AllowAny()]
        if self.action in (
            'create', 'update', 'partial_update', 'destroy',
            'upload_media', 'upload_signature', 'confirm_media',
        ):
            return [IsAuthenticated(), IsInstructor()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        module = serializer.validated_data['module']
        user = self.request.user
        if user.role == UserRole.EXAMINER and module.offering.instructor_id != user.id:
            raise PermissionDenied('You can only add lessons to your own offerings.')
        serializer.save()

    @action(detail=True, methods=['post'])
    def mark_complete(self, request, pk=None):
        """
        Student marks a lesson as complete.
        POST /api/learning/lessons/{id}/mark_complete/
        """
        if request.user.role != UserRole.STUDENT:
            return Response(status=status.HTTP_403_FORBIDDEN)
        lesson = self.get_object()
        progress, _ = LessonProgress.objects.get_or_create(
            lesson=lesson, student=request.user
        )
        progress.mark_complete()
        return Response({'completed': True, 'completed_at': progress.completed_at})

    @action(detail=True, methods=['get'], url_path='media/access')
    def media_access(self, request, pk=None):
        """Return proxy-safe media URLs (with short-lived token) for preview/download."""
        lesson = self.get_object()
        if not can_access_lesson_media(lesson, request.user):
            return Response(status=status.HTTP_403_FORBIDDEN)

        ext = (lesson.external_url or '').strip()
        if ext and not (lesson.file_key or '').strip():
            filename = lesson_media_filename(lesson)
            return Response({
                'has_media': True,
                'view_url': ext,
                'download_url': ext,
                'filename': filename,
                'external': True,
            })

        if not (lesson.file_key or '').strip():
            return Response({'has_media': False})

        token = make_media_token(lesson.id, request.user.id)
        path = f'learning/lessons/{lesson.id}/media/file/'
        qs = f'?token={token}'
        filename = lesson_media_filename(lesson)
        return Response({
            'has_media': True,
            'view_url': f'{path}{qs}&disposition=inline',
            'download_url': f'{path}{qs}&disposition=attachment',
            'filename': filename,
            'external': False,
        })

    @action(detail=True, methods=['get'], url_path='media/file')
    def media_file(self, request, pk=None):
        """Stream lesson media via redirect (Cloudinary) or FileResponse (local dev)."""
        import os

        from django.conf import settings
        from django.http import FileResponse, HttpResponseRedirect

        from apps.accounts.models import User
        from common.storage.cloudinary_service import cloudinary_delivery_url

        lesson = Lesson.objects.select_related('module__offering').filter(pk=pk).first()
        if not lesson:
            return Response(status=status.HTTP_404_NOT_FOUND)

        user = request.user if request.user.is_authenticated else None
        token = request.query_params.get('token')
        if token:
            uid = verify_media_token(token, int(pk))
            if uid is None:
                return Response(
                    {'detail': 'Invalid or expired media link.'},
                    status=status.HTTP_401_UNAUTHORIZED,
                )
            user = User.objects.filter(pk=uid).first()

        if not user:
            return Response(status=status.HTTP_401_UNAUTHORIZED)
        if not can_access_lesson_media(lesson, user):
            return Response(status=status.HTTP_403_FORBIDDEN)

        key = (lesson.file_key or '').strip()
        if not key:
            return Response({'detail': 'No media attached.'}, status=status.HTTP_404_NOT_FOUND)

        disposition = request.query_params.get('disposition', 'inline')
        filename = lesson_media_filename(lesson)

        if key.startswith('http://') or key.startswith('https://'):
            url = cloudinary_delivery_url(key, disposition=disposition, filename=filename)
            return HttpResponseRedirect(url)

        abs_path = os.path.join(settings.MEDIA_ROOT, key)
        if not os.path.isfile(abs_path):
            return Response({'detail': 'Media file not found.'}, status=status.HTTP_404_NOT_FOUND)

        content_types = {
            'pdf': 'application/pdf',
            'video': 'video/mp4',
        }
        response = FileResponse(open(abs_path, 'rb'))
        disp = 'attachment' if disposition == 'attachment' else 'inline'
        response['Content-Disposition'] = f'{disp}; filename="{filename}"'
        response['Content-Type'] = content_types.get(lesson.content_type, 'application/octet-stream')
        return response

    _LEARNING_UPLOAD_EXTENSIONS = (
        '.mp4', '.webm', '.mov', '.pdf',
        '.png', '.jpg', '.jpeg', '.gif', '.webp', '.zip',
    )

    def _lesson_upload_folder(self, lesson):
        from django.conf import settings
        return f"{getattr(settings, 'CLOUDINARY_LEARNING_FOLDER', 'ibbul/learning')}/lessons/{lesson.id}"

    def _assert_can_upload_lesson(self, user, lesson):
        if user.role == UserRole.EXAMINER and lesson.module.offering.instructor_id != user.id:
            raise PermissionDenied('Not your offering.')
        if user.role not in (UserRole.EXAMINER, UserRole.DEPARTMENT_ADMIN, UserRole.HOD,
                             UserRole.FACULTY_ADMIN, UserRole.SUPER_ADMIN):
            return False
        return True

    @action(detail=True, methods=['get'], url_path='upload-signature')
    def upload_signature(self, request, pk=None):
        """Return signed Cloudinary upload params — browser uploads directly to Cloudinary."""
        import os

        from django.conf import settings
        from common.storage.cloudinary_service import generate_signed_upload_params, is_configured

        lesson = self.get_object()
        if not self._assert_can_upload_lesson(request.user, lesson):
            return Response(status=status.HTTP_403_FORBIDDEN)

        filename = (request.query_params.get('filename') or 'file').strip()
        ext = os.path.splitext(filename)[1].lower()
        if ext not in self._LEARNING_UPLOAD_EXTENSIONS:
            return Response(
                {'detail': 'Allowed: MP4, WebM, MOV, PDF, PNG, JPG, GIF, WEBP, ZIP'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not getattr(settings, 'MEDIA_USE_CLOUDINARY', True) or not is_configured():
            return Response(
                {'detail': 'Cloudinary not configured.', 'use_proxy_upload': True},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        params = generate_signed_upload_params(
            folder=self._lesson_upload_folder(lesson),
            filename=filename,
        )
        return Response(params)

    @action(detail=True, methods=['post'], url_path='confirm-media')
    def confirm_media(self, request, pk=None):
        """Persist Cloudinary metadata after a direct browser upload."""
        from common.storage.cloudinary_service import delete_by_url

        lesson = self.get_object()
        if not self._assert_can_upload_lesson(request.user, lesson):
            return Response(status=status.HTTP_403_FORBIDDEN)

        secure_url = (request.data.get('secure_url') or '').strip()
        public_id = (request.data.get('public_id') or '').strip()
        resource_type = (request.data.get('resource_type') or 'raw').strip()
        original_filename = (request.data.get('original_filename') or '').strip()

        if not secure_url or not public_id:
            return Response(
                {'detail': 'secure_url and public_id are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        expected_prefix = self._lesson_upload_folder(lesson)
        if not public_id.startswith(expected_prefix):
            return Response({'detail': 'Upload folder mismatch.'}, status=status.HTTP_400_BAD_REQUEST)

        old_key = (lesson.file_key or '').strip()
        if old_key.startswith('http'):
            delete_by_url(old_key)

        lesson.file_key = secure_url
        lower = original_filename.lower()
        if lower.endswith('.pdf'):
            lesson.content_type = 'pdf'
        elif resource_type == 'video' or lower.endswith(('.mp4', '.webm', '.mov')):
            lesson.content_type = 'video'
        lesson.save(update_fields=['file_key', 'content_type', 'updated_at'])

        return Response({
            'file_key': lesson_media_filename(lesson),
            'content_type': lesson.content_type,
            'has_media': True,
            'public_id': public_id,
            'resource_type': resource_type,
            'bytes': request.data.get('bytes'),
            'format': request.data.get('format'),
            'original_filename': original_filename or lesson_media_filename(lesson),
        })

    @action(
        detail=True,
        methods=['post'],
        url_path='upload-media',
        parser_classes=[MultiPartParser, FormParser],
    )
    def upload_media(self, request, pk=None):
        """Upload video/PDF for a lesson — stored on Cloudinary (production) or local dev fallback."""
        from django.conf import settings
        from common.storage.cloudinary_service import is_configured, upload_file

        lesson = self.get_object()
        if not self._assert_can_upload_lesson(request.user, lesson):
            return Response(status=status.HTTP_403_FORBIDDEN)

        upload = request.FILES.get('file')
        if not upload:
            return Response({'detail': 'No file provided.'}, status=status.HTTP_400_BAD_REQUEST)

        allowed = self._LEARNING_UPLOAD_EXTENSIONS
        name = upload.name or 'file'
        if not any(name.lower().endswith(ext) for ext in allowed):
            return Response(
                {'detail': 'Allowed: MP4, WebM, MOV, PDF, PNG, JPG, GIF, WEBP, ZIP'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        safe_name = name.replace(' ', '_').replace('..', '')
        use_cloudinary = getattr(settings, 'MEDIA_USE_CLOUDINARY', True) and is_configured()

        if use_cloudinary:
            folder = f"{getattr(settings, 'CLOUDINARY_LEARNING_FOLDER', 'ibbul/learning')}/lessons/{lesson.id}"
            try:
                url, _pid = upload_file(upload, folder=folder, filename=safe_name)
            except RuntimeError as exc:
                return Response(
                    {'detail': 'Video storage not configured. Set CLOUDINARY_* on the server.'},
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )
            except Exception as exc:
                return Response({'detail': str(exc)[:300]}, status=status.HTTP_502_BAD_GATEWAY)
            lesson.file_key = url
        else:
            import os
            rel_dir = f'learning/lessons/{lesson.id}'
            abs_dir = os.path.join(settings.MEDIA_ROOT, rel_dir)
            os.makedirs(abs_dir, exist_ok=True)
            rel_path = f'{rel_dir}/{safe_name}'
            abs_path = os.path.join(settings.MEDIA_ROOT, rel_path)
            with open(abs_path, 'wb+') as dest:
                for chunk in upload.chunks():
                    dest.write(chunk)
            lesson.file_key = rel_path

        if name.lower().endswith('.pdf'):
            lesson.content_type = 'pdf'
        elif lesson.content_type not in ('video', 'pdf'):
            lesson.content_type = 'video'
        lesson.save(update_fields=['file_key', 'content_type', 'updated_at'])

        return Response({
            'file_key': lesson_media_filename(lesson),
            'content_type': lesson.content_type,
            'has_media': True,
        })


# ─── Quiz ViewSet ─────────────────────────────────────────────────────────────

class QuizViewSet(viewsets.ModelViewSet):
    """Quizzes. Instructors can CRUD; students start/submit attempts."""
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.request.user.role == UserRole.STUDENT:
            return QuizStudentSerializer
        return QuizSerializer

    def get_queryset(self):
        lesson_id = self.request.query_params.get('lesson')
        qs = Quiz.objects.prefetch_related('questions')
        if lesson_id:
            qs = qs.filter(lesson_id=lesson_id)
        if self.request.user.role == UserRole.EXAMINER:
            qs = qs.filter(lesson__module__offering__instructor=self.request.user)
        return qs

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [IsAuthenticated(), IsInstructor()]
        return [IsAuthenticated()]

    @action(detail=True, methods=['post'])
    def start(self, request, pk=None):
        """
        Student starts a quiz attempt.
        POST /api/learning/quizzes/{id}/start/
        """
        if request.user.role != UserRole.STUDENT:
            return Response(status=status.HTTP_403_FORBIDDEN)
        quiz = self.get_object()

        # Check attempt limit
        existing_attempts = QuizAttempt.objects.filter(
            quiz=quiz, student=request.user
        ).count()
        if existing_attempts >= quiz.max_attempts:
            return Response(
                {'detail': f'Maximum attempts ({quiz.max_attempts}) reached.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check for an in-progress attempt
        in_progress = QuizAttempt.objects.filter(
            quiz=quiz, student=request.user, status='in_progress'
        ).first()
        if in_progress:
            if in_progress.expires_at:
                grace_end = in_progress.expires_at + timedelta(seconds=SUBMIT_GRACE_SECONDS)
                if timezone.now() > grace_end:
                    _finalize_quiz_attempt(
                        in_progress,
                        quiz,
                        answers=in_progress.answers or {},
                        focus_loss_count=in_progress.focus_loss_count,
                        violations=in_progress.violation_log or [],
                        timed_out=True,
                        auto_submitted=True,
                    )
                else:
                    serializer = QuizAttemptSerializer(in_progress)
                    return Response(serializer.data)
            else:
                serializer = QuizAttemptSerializer(in_progress)
                return Response(serializer.data)

        expires_at = None
        if quiz.time_limit_minutes:
            expires_at = timezone.now() + timedelta(minutes=quiz.time_limit_minutes)

        attempt = QuizAttempt.objects.create(
            quiz=quiz,
            student=request.user,
            attempt_number=existing_attempts + 1,
            expires_at=expires_at,
        )
        serializer = QuizAttemptSerializer(attempt)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        """
        Student submits quiz answers.
        POST /api/learning/quizzes/{id}/submit/
        Body: { answers: {question_id: index}, focus_loss_count: int }
        """
        if request.user.role != UserRole.STUDENT:
            return Response(status=status.HTTP_403_FORBIDDEN)
        quiz = self.get_object()

        attempt = QuizAttempt.objects.filter(
            quiz=quiz, student=request.user, status='in_progress'
        ).first()
        if not attempt:
            return Response(
                {'detail': 'No active quiz attempt found.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = QuizSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data
        answers = payload['answers']
        violations = payload.get('violations') or []
        focus_loss = max(int(payload.get('focus_loss_count', 0)), len(violations))
        timed_out_flag = bool(payload.get('timed_out', False))
        auto_submitted = bool(payload.get('auto_submitted', False))

        expired = bool(attempt.expires_at and timezone.now() > attempt.expires_at)
        within_grace = bool(
            attempt.expires_at
            and timezone.now() <= attempt.expires_at + timedelta(seconds=SUBMIT_GRACE_SECONDS)
        )

        max_violations = getattr(quiz, 'max_violations', 3) or 3
        if getattr(quiz, 'auto_submit_on_violations', True) and focus_loss >= max_violations:
            auto_submitted = True

        is_timeout = timed_out_flag or (expired and within_grace)

        if expired and not within_grace and not timed_out_flag:
            _finalize_quiz_attempt(
                attempt,
                quiz,
                answers=answers,
                focus_loss_count=focus_loss,
                violations=violations,
                timed_out=True,
                auto_submitted=True,
            )
            return Response({
                'status': 'timed_out',
                'score': float(attempt.score or 0),
                'passed': bool(attempt.passed),
                'passing_score': quiz.passing_score,
                'auto_submitted': True,
                'detail': 'Quiz time expired. Partial answers were graded.',
            })

        _finalize_quiz_attempt(
            attempt,
            quiz,
            answers=answers,
            focus_loss_count=focus_loss,
            violations=violations,
            timed_out=is_timeout,
            auto_submitted=auto_submitted,
        )

        return Response({
            'status': attempt.status,
            'score': float(attempt.score or 0),
            'passed': bool(attempt.passed),
            'passing_score': quiz.passing_score,
            'auto_submitted': auto_submitted,
            'timed_out': is_timeout,
        })

    @action(detail=True, methods=['get'])
    def my_attempts(self, request, pk=None):
        """GET /api/learning/quizzes/{id}/my_attempts/"""
        quiz = self.get_object()
        attempts = QuizAttempt.objects.filter(
            quiz=quiz, student=request.user
        ).order_by('-started_at')
        serializer = QuizAttemptSerializer(attempts, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def log_violation(self, request, pk=None):
        """
        POST /api/learning/quizzes/{id}/log_violation/
        Body: { event_type, metadata }
        """
        if request.user.role != UserRole.STUDENT:
            return Response(status=status.HTTP_403_FORBIDDEN)
        quiz = self.get_object()
        attempt = QuizAttempt.objects.filter(
            quiz=quiz, student=request.user, status='in_progress'
        ).first()
        if not attempt:
            return Response(
                {'detail': 'No active quiz attempt found.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        event = {
            'type': request.data.get('event_type', 'unknown'),
            'timestamp': timezone.now().isoformat(),
            'metadata': request.data.get('metadata') or {},
        }
        log = list(attempt.violation_log or [])
        log.append(event)
        attempt.violation_log = log
        attempt.focus_loss_count = len(log)
        attempt.save(update_fields=['violation_log', 'focus_loss_count'])

        max_v = getattr(quiz, 'max_violations', 3) or 3
        auto_submit = bool(
            getattr(quiz, 'auto_submit_on_violations', True) and len(log) >= max_v
        )
        return Response({
            'violation_count': len(log),
            'max_violations': max_v,
            'auto_submit': auto_submit,
        })


# ─── Assignment ViewSet ───────────────────────────────────────────────────────

class AssignmentViewSet(viewsets.ModelViewSet):
    """Assignments. Instructors create; students submit."""
    permission_classes = [IsAuthenticated]
    serializer_class = AssignmentSerializer

    def get_queryset(self):
        lesson_id = self.request.query_params.get('lesson')
        qs = Assignment.objects.select_related('lesson__module__offering')
        if lesson_id:
            qs = qs.filter(lesson_id=lesson_id)
        if self.request.user.role == UserRole.EXAMINER:
            qs = qs.filter(lesson__module__offering__instructor=self.request.user)
        return qs

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [IsAuthenticated(), IsInstructor()]
        return [IsAuthenticated()]

    @action(
        detail=True,
        methods=['post'],
        url_path='upload-submission',
        parser_classes=[MultiPartParser, FormParser],
    )
    def upload_submission(self, request, pk=None):
        """Student uploads a file for a file-upload assignment; returns file_key URL."""
        from django.conf import settings
        from common.storage.cloudinary_service import is_configured, upload_file

        if request.user.role != UserRole.STUDENT:
            return Response(status=status.HTTP_403_FORBIDDEN)

        assignment = self.get_object()
        upload = request.FILES.get('file')
        if not upload:
            return Response({'detail': 'No file provided.'}, status=status.HTTP_400_BAD_REQUEST)

        max_mb = getattr(assignment, 'max_file_size_mb', 10) or 10
        if upload.size > max_mb * 1024 * 1024:
            return Response(
                {'detail': f'File exceeds maximum size of {max_mb} MB.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        name = upload.name or 'file'
        ext = name.rsplit('.', 1)[-1].lower() if '.' in name else ''
        allowed = getattr(assignment, 'allowed_file_types', None) or []
        if allowed and ext not in [t.lower().lstrip('.') for t in allowed]:
            return Response(
                {'detail': f'Allowed file types: {", ".join(allowed)}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        safe_name = name.replace(' ', '_').replace('..', '')
        use_cloudinary = getattr(settings, 'MEDIA_USE_CLOUDINARY', True) and is_configured()

        if use_cloudinary:
            folder = f"{getattr(settings, 'CLOUDINARY_LEARNING_FOLDER', 'ibbul/learning')}/assignments/{assignment.id}/submissions"
            try:
                url, _pid = upload_file(upload, folder=folder, filename=safe_name)
            except RuntimeError:
                return Response(
                    {'detail': 'File storage not configured.'},
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )
            except Exception as exc:
                return Response({'detail': str(exc)[:300]}, status=status.HTTP_502_BAD_GATEWAY)
            file_key = url
        else:
            import os
            rel_dir = f'learning/assignments/{assignment.id}/submissions/{request.user.id}'
            abs_dir = os.path.join(settings.MEDIA_ROOT, rel_dir)
            os.makedirs(abs_dir, exist_ok=True)
            rel_path = f'{rel_dir}/{safe_name}'
            abs_path = os.path.join(settings.MEDIA_ROOT, rel_path)
            with open(abs_path, 'wb+') as dest:
                for chunk in upload.chunks():
                    dest.write(chunk)
            file_key = rel_path

        return Response({'file_key': file_key, 'filename': name})

    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        """
        Student submits an assignment.
        POST /api/learning/assignments/{assignmentId}/submit/
        Body: { content, file_key (optional), focus_loss_count }
        """
        if request.user.role != UserRole.STUDENT:
            return Response(status=status.HTTP_403_FORBIDDEN)
        assignment = self.get_object()

        existing = Submission.objects.filter(
            assignment=assignment, student=request.user
        ).first()
        if existing and not getattr(assignment, 'allow_resubmission', False):
            return Response(
                {'detail': 'You have already submitted this assignment.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        content = request.data.get('content', '')
        file_key = request.data.get('file_key', '')
        violations = request.data.get('violations') or []
        focus_loss = int(request.data.get('focus_loss_count', 0))
        was_resubmit = False

        if existing and getattr(assignment, 'allow_resubmission', False):
            was_resubmit = True
            existing.content = content
            existing.file_key = file_key
            existing.focus_loss_count = focus_loss
            existing.violation_log = violations
            existing.submitted_at = timezone.now()
            existing.is_late = (
                assignment.due_at and timezone.now() > assignment.due_at
                and not assignment.allow_late_submission
            )
            existing.score = None
            existing.graded_at = None
            existing.graded_by = None
            existing.feedback = ''
            existing.save()
            submission = existing
        else:
            submission = Submission.objects.create(
                assignment=assignment,
                student=request.user,
                content=content,
                file_key=file_key,
                focus_loss_count=focus_loss,
                violation_log=violations,
            )

        if getattr(assignment, 'similarity_check_enabled', True):
            from .services.plagiarism_engine import check_against_corpus
            others = Submission.objects.filter(assignment=assignment).exclude(pk=submission.pk)
            corpus = [
                {
                    'id': s.student_id,
                    'label': s.student.get_full_name() or str(s.student_id),
                    'text': s.content,
                }
                for s in others if s.content
            ]
            report = check_against_corpus(submission.content, corpus)
            submission.similarity_score = report['highest_score']
            submission.similarity_report = report
            submission.save(update_fields=['similarity_score', 'similarity_report'])

        serializer = SubmissionSerializer(submission)
        status_code = status.HTTP_200_OK if was_resubmit else status.HTTP_201_CREATED
        return Response(serializer.data, status=status_code)

    @action(detail=True, methods=['post'])
    def grade(self, request, pk=None):
        """
        Instructor grades a submission.
        POST /api/learning/assignments/{id}/grade/
        Body: { student_id: int, score, feedback }
        """
        if request.user.role not in (
            UserRole.EXAMINER, UserRole.DEPARTMENT_ADMIN, UserRole.HOD,
            UserRole.FACULTY_ADMIN, UserRole.SUPER_ADMIN,
        ):
            return Response(status=status.HTTP_403_FORBIDDEN)

        assignment = self.get_object()
        student_id = request.data.get('student_id')
        try:
            submission = Submission.objects.get(
                assignment=assignment, student_id=student_id
            )
        except Submission.DoesNotExist:
            return Response(
                {'detail': 'Submission not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        grade_serializer = GradeSubmissionSerializer(data=request.data)
        grade_serializer.is_valid(raise_exception=True)
        submission.score = grade_serializer.validated_data['score']
        submission.feedback = grade_serializer.validated_data.get('feedback', '')
        submission.graded_at = timezone.now()
        submission.graded_by = request.user
        submission.save(update_fields=['score', 'feedback', 'graded_at', 'graded_by'])

        serializer = SubmissionSerializer(submission)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='ai-suggest-grade')
    def ai_suggest_grade(self, request, pk=None):
        """
        POST /api/learning/assignments/{id}/ai-suggest-grade/
        Body: { student_id }
        Lecturer-only AI grading suggestion (must approve final score separately).
        """
        if request.user.role not in (
            UserRole.EXAMINER, UserRole.DEPARTMENT_ADMIN, UserRole.HOD,
            UserRole.FACULTY_ADMIN, UserRole.SUPER_ADMIN,
        ):
            return Response(status=status.HTTP_403_FORBIDDEN)

        assignment = self.get_object()
        if assignment.lesson.module.offering.instructor_id != request.user.id and request.user.role == UserRole.EXAMINER:
            return Response(status=status.HTTP_403_FORBIDDEN)

        student_id = request.data.get('student_id')
        try:
            submission = Submission.objects.get(
                assignment=assignment, student_id=student_id
            )
        except Submission.DoesNotExist:
            return Response(
                {'detail': 'Submission not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        ok, result = _run_ai_suggestion(assignment, submission)
        if not ok:
            return Response(result, status=status.HTTP_502_BAD_GATEWAY)

        return Response({
            **result,
            'submission_id': submission.id,
            'student_id': submission.student_id,
            'note': 'AI suggestion only — lecturer must approve the final grade.',
        })

    @action(detail=True, methods=['post'], url_path='ai-suggest-grade-bulk')
    def ai_suggest_grade_bulk(self, request, pk=None):
        """Run AI grading suggestions for all ungraded submissions on this assignment."""
        if request.user.role not in (
            UserRole.EXAMINER, UserRole.DEPARTMENT_ADMIN, UserRole.HOD,
            UserRole.FACULTY_ADMIN, UserRole.SUPER_ADMIN,
        ):
            return Response(status=status.HTTP_403_FORBIDDEN)

        assignment = self.get_object()
        if assignment.lesson.module.offering.instructor_id != request.user.id and request.user.role == UserRole.EXAMINER:
            return Response(status=status.HTTP_403_FORBIDDEN)

        subs = assignment.submissions.filter(score__isnull=True).exclude(content='')
        processed = 0
        errors = []
        for sub in subs:
            ok, result = _run_ai_suggestion(assignment, sub)
            if ok:
                processed += 1
            else:
                errors.append({'student_id': sub.student_id, 'error': result.get('error', 'failed')})

        return Response({
            'processed': processed,
            'total_pending': subs.count(),
            'errors': errors,
            'note': 'Review AI suggestions and save final grades individually or in bulk.',
        })

    @action(detail=True, methods=['get'])
    def submissions(self, request, pk=None):
        """Instructor view: all submissions for an assignment."""
        if request.user.role not in (
            UserRole.EXAMINER, UserRole.DEPARTMENT_ADMIN, UserRole.HOD,
            UserRole.FACULTY_ADMIN, UserRole.SUPER_ADMIN,
        ):
            return Response(status=status.HTTP_403_FORBIDDEN)
        assignment = self.get_object()
        subs = assignment.submissions.select_related('student').order_by('-submitted_at')
        serializer = SubmissionSerializer(subs, many=True)
        return Response({'count': subs.count(), 'submissions': serializer.data})

    @action(detail=True, methods=['get'])
    def my_submission(self, request, pk=None):
        """Student view: my submission for this assignment."""
        if request.user.role != UserRole.STUDENT:
            return Response(status=status.HTTP_403_FORBIDDEN)
        assignment = self.get_object()
        submission = Submission.objects.filter(
            assignment=assignment, student=request.user
        ).first()
        if not submission:
            return Response({'submitted': False, 'submission': None})
        serializer = SubmissionSerializer(submission)
        return Response({'submitted': True, 'submission': serializer.data})


# ─── Quiz Question ViewSet ────────────────────────────────────────────────────

class QuizQuestionViewSet(viewsets.ModelViewSet):
    """Quiz questions. Instructors only."""
    permission_classes = [IsAuthenticated, IsInstructor]
    serializer_class = QuizQuestionSerializer

    def get_queryset(self):
        quiz_id = self.kwargs.get('quiz_pk') or self.request.query_params.get('quiz')
        qs = QuizQuestion.objects.select_related('quiz')
        if quiz_id:
            qs = qs.filter(quiz_id=quiz_id)
        if self.request.user.role == UserRole.EXAMINER:
            qs = qs.filter(quiz__lesson__module__offering__instructor=self.request.user)
        return qs.order_by('order')


# ─── Dashboard stats ─────────────────────────────────────────────────────────

from rest_framework.decorators import api_view, permission_classes as drf_permission_classes
from rest_framework.permissions import IsAuthenticated as DRFIsAuthenticated


@api_view(['GET'])
@drf_permission_classes([DRFIsAuthenticated])
def learning_dashboard_stats(request):
    """
    Returns dashboard statistics for the current user's learning context.
    GET /api/learning/dashboard-stats/
    """
    user = request.user

    if user.role == UserRole.STUDENT:
        enrollments = Enrollment.objects.filter(student=user, is_active=True)
        total_lessons = Lesson.objects.filter(
            module__offering__in=enrollments.values_list('offering', flat=True),
            is_published=True,
        ).count()
        completed_lessons = LessonProgress.objects.filter(
            student=user, completed=True
        ).count()
        pending_quizzes = Quiz.objects.filter(
            lesson__module__offering__in=enrollments.values_list('offering', flat=True),
        ).exclude(
            attempts__student=user, attempts__status='submitted'
        ).count()
        pending_assignments = Assignment.objects.filter(
            lesson__module__offering__in=enrollments.values_list('offering', flat=True),
        ).exclude(
            submissions__student=user
        ).count()

        return Response({
            'enrolled_courses': enrollments.count(),
            'total_lessons': total_lessons,
            'completed_lessons': completed_lessons,
            'overall_progress': round((completed_lessons / total_lessons) * 100, 1) if total_lessons else 0,
            'pending_quizzes': pending_quizzes,
            'pending_assignments': pending_assignments,
        })

    elif user.role == UserRole.EXAMINER:
        offerings = LMSOffering.objects.filter(instructor=user)
        return Response({
            'total_offerings': offerings.count(),
            'published_offerings': offerings.filter(is_published=True).count(),
            'total_enrolled': Enrollment.objects.filter(
                offering__in=offerings, is_active=True
            ).count(),
            'pending_submissions': Submission.objects.filter(
                assignment__lesson__module__offering__in=offerings,
                graded_at__isnull=True,
            ).count(),
        })

    else:
        # HOD / Faculty Admin / Super Admin
        scope = getattr(request, 'scope', None) or build_scope(user)
        qs = LMSOffering.objects.all()
        if scope and scope.level < ScopeLevel.GLOBAL:
            if hasattr(scope, 'department_id') and scope.department_id:
                qs = qs.filter(course__department_id=scope.department_id)

        return Response({
            'total_offerings': qs.count(),
            'published_offerings': qs.filter(is_published=True).count(),
            'total_enrolled': Enrollment.objects.filter(
                offering__in=qs, is_active=True
            ).count(),
            'total_students': Enrollment.objects.filter(
                offering__in=qs, is_active=True
            ).values('student').distinct().count(),
        })
