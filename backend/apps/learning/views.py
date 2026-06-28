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
from rest_framework.permissions import IsAuthenticated
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
from .permissions import IsInstructor, IsOfferingInstructor


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
        if self.action in ('create', 'update', 'partial_update', 'destroy', 'upload_media'):
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
        user = request.user
        if user.role == UserRole.EXAMINER and lesson.module.offering.instructor_id != user.id:
            raise PermissionDenied('Not your offering.')
        if user.role not in (UserRole.EXAMINER, UserRole.DEPARTMENT_ADMIN, UserRole.HOD,
                             UserRole.FACULTY_ADMIN, UserRole.SUPER_ADMIN):
            return Response(status=status.HTTP_403_FORBIDDEN)

        upload = request.FILES.get('file')
        if not upload:
            return Response({'detail': 'No file provided.'}, status=status.HTTP_400_BAD_REQUEST)

        allowed = ('.mp4', '.webm', '.mov', '.pdf', '.MP4', '.WEBM', '.MOV', '.PDF')
        name = upload.name
        if not any(name.endswith(ext) for ext in allowed):
            return Response(
                {'detail': 'Allowed: MP4, WebM, MOV, PDF'},
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
            media_url = url
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
            media_url = request.build_absolute_uri(settings.MEDIA_URL + rel_path)

        if name.lower().endswith('.pdf'):
            lesson.content_type = 'pdf'
        elif lesson.content_type not in ('video', 'pdf'):
            lesson.content_type = 'video'
        lesson.save(update_fields=['file_key', 'content_type', 'updated_at'])

        return Response({'file_key': lesson.file_key, 'url': media_url, 'content_type': lesson.content_type})


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

        # Check expiry
        if attempt.expires_at and timezone.now() > attempt.expires_at:
            attempt.status = 'timed_out'
            attempt.submitted_at = timezone.now()
            attempt.save(update_fields=['status', 'submitted_at'])
            return Response(
                {'detail': 'Quiz time expired.', 'status': 'timed_out'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        attempt.answers = serializer.validated_data['answers']
        attempt.focus_loss_count = serializer.validated_data.get('focus_loss_count', 0)
        attempt.status = 'submitted'
        attempt.submitted_at = timezone.now()
        score = attempt.calculate_score()
        attempt.score = score
        attempt.passed = score >= quiz.passing_score
        attempt.save()

        # Mark lesson as complete if passed
        if attempt.passed:
            progress, _ = LessonProgress.objects.get_or_create(
                lesson=quiz.lesson, student=request.user
            )
            progress.mark_complete()

        return Response({
            'status': 'submitted',
            'score': float(score),
            'passed': attempt.passed,
            'passing_score': quiz.passing_score,
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

    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        """
        Student submits an assignment.
        POST /api/learning/assignments/{id}/submit/
        Body: { content, file_key (optional), focus_loss_count }
        """
        if request.user.role != UserRole.STUDENT:
            return Response(status=status.HTTP_403_FORBIDDEN)
        assignment = self.get_object()

        existing = Submission.objects.filter(
            assignment=assignment, student=request.user
        ).first()
        if existing:
            return Response(
                {'detail': 'You have already submitted this assignment.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        submission = Submission.objects.create(
            assignment=assignment,
            student=request.user,
            content=request.data.get('content', ''),
            file_key=request.data.get('file_key', ''),
            focus_loss_count=int(request.data.get('focus_loss_count', 0)),
        )
        serializer = SubmissionSerializer(submission)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

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
