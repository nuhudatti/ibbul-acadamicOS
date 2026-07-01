"""
Learning module serializers.
Nested reads use compact representations; writes use flat PKs.
"""
from rest_framework import serializers
from django.utils import timezone
from apps.accounts.models import UserRole
from .models import (
    LMSOffering, Module, Lesson, Quiz, QuizQuestion,
    QuizAttempt, Assignment, Submission, Enrollment, LessonProgress,
)


# ─── Compact nested serializers ──────────────────────────────────────────────

class QuizQuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = QuizQuestion
        fields = ['id', 'quiz', 'question_type', 'question_text', 'options', 'correct_index',
                  'model_answer', 'explanation', 'points', 'order']


class QuizQuestionStudentSerializer(serializers.ModelSerializer):
    """Student-safe quiz question — no correct_index, model_answer, or explanation."""
    class Meta:
        model = QuizQuestion
        fields = ['id', 'question_type', 'question_text', 'options', 'points', 'order']


class QuizSerializer(serializers.ModelSerializer):
    questions = QuizQuestionSerializer(many=True, read_only=True)
    question_count = serializers.SerializerMethodField()

    class Meta:
        model = Quiz
        fields = ['id', 'lesson', 'title', 'instructions', 'passing_score', 'time_limit_minutes',
                  'max_attempts', 'shuffle_questions', 'due_at', 'secure_mode_enabled',
                  'max_violations', 'auto_submit_on_violations',
                  'question_count', 'questions', 'created_at', 'updated_at']

    def get_question_count(self, obj):
        return obj.questions.count()


class QuizStudentSerializer(serializers.ModelSerializer):
    """Student-safe quiz — no question answers."""
    questions = QuizQuestionStudentSerializer(many=True, read_only=True)
    question_count = serializers.SerializerMethodField()

    class Meta:
        model = Quiz
        fields = ['id', 'title', 'instructions', 'passing_score', 'time_limit_minutes',
                  'max_attempts', 'due_at', 'secure_mode_enabled', 'max_violations',
                  'auto_submit_on_violations', 'question_count', 'questions']

    def get_question_count(self, obj):
        return obj.questions.count()


class AssignmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Assignment
        fields = ['id', 'lesson', 'title', 'description', 'instructions_key', 'max_score',
                  'due_at', 'allow_late_submission', 'enable_ai_grading',
                  'similarity_check_enabled', 'rubric', 'assignment_type',
                  'allow_resubmission', 'resource_attachments', 'allowed_file_types',
                  'max_file_size_mb', 'allow_multiple_files',
                  'created_at', 'updated_at']


class LessonSerializer(serializers.ModelSerializer):
    quiz = QuizSerializer(read_only=True)
    assignment = AssignmentSerializer(read_only=True)
    progress = serializers.SerializerMethodField()
    file_key = serializers.SerializerMethodField()

    class Meta:
        model = Lesson
        fields = ['id', 'module', 'title', 'content_type', 'content_body', 'file_key',
                  'external_url', 'duration_minutes', 'order', 'is_published',
                  'is_preview', 'quiz', 'assignment', 'progress',
                  'created_at', 'updated_at']

    def get_file_key(self, obj):
        key = (obj.file_key or '').strip()
        if not key:
            return ''
        if key.startswith('http://') or key.startswith('https://'):
            return key.rsplit('/', 1)[-1].split('?')[0]
        return key

    def get_progress(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return None
        progress = LessonProgress.objects.filter(
            lesson=obj, student=request.user
        ).first()
        if progress:
            return {'completed': progress.completed, 'completed_at': progress.completed_at}
        return {'completed': False, 'completed_at': None}


class LessonStudentSerializer(LessonSerializer):
    """Student view — quiz has no answers."""
    quiz = QuizStudentSerializer(read_only=True)


class ModuleSerializer(serializers.ModelSerializer):
    lessons = LessonSerializer(many=True, read_only=True)
    lesson_count = serializers.SerializerMethodField()
    completed_count = serializers.SerializerMethodField()

    class Meta:
        model = Module
        fields = ['id', 'offering', 'title', 'description', 'order', 'is_published',
                  'lesson_count', 'completed_count', 'lessons',
                  'created_at', 'updated_at']

    def get_lesson_count(self, obj):
        return obj.lessons.filter(is_published=True).count()

    def get_completed_count(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return 0
        return LessonProgress.objects.filter(
            lesson__module=obj, student=request.user, completed=True
        ).count()


class LMSOfferingListSerializer(serializers.ModelSerializer):
    """Compact offering for list views (course catalog, enrolled list)."""
    course_code = serializers.CharField(source='course.code', read_only=True)
    course_title = serializers.CharField(source='course.title', read_only=True)
    course_level = serializers.CharField(source='course.level', read_only=True)
    course_credit_units = serializers.IntegerField(source='course.credit_units', read_only=True)
    department_name = serializers.SerializerMethodField()
    instructor_name = serializers.SerializerMethodField()
    module_count = serializers.SerializerMethodField()
    lesson_count = serializers.SerializerMethodField()
    enrolled_count = serializers.SerializerMethodField()
    is_enrolled = serializers.SerializerMethodField()
    progress_percent = serializers.SerializerMethodField()
    requires_enrollment_pin = serializers.SerializerMethodField()

    class Meta:
        model = LMSOffering
        fields = [
            'id', 'course', 'course_code', 'course_title', 'course_level', 'course_credit_units',
            'department_name', 'session', 'semester', 'description', 'thumbnail_key',
            'instructor_name', 'is_published', 'enrollment_open', 'requires_enrollment_pin',
            'module_count', 'lesson_count', 'enrolled_count',
            'is_enrolled', 'progress_percent',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'course_code', 'course_title', 'course_level', 'course_credit_units',
            'department_name', 'instructor_name', 'module_count', 'lesson_count',
            'enrolled_count', 'is_enrolled', 'progress_percent', 'requires_enrollment_pin',
            'created_at', 'updated_at',
        ]

    def get_requires_enrollment_pin(self, obj):
        return bool(obj.enrollment_pin)

    def get_department_name(self, obj):
        return obj.course.department.name if obj.course.department else None

    def get_instructor_name(self, obj):
        return obj.instructor.get_full_name() if obj.instructor else None

    def get_module_count(self, obj):
        return obj.modules.filter(is_published=True).count()

    def get_lesson_count(self, obj):
        return Lesson.objects.filter(
            module__offering=obj, is_published=True
        ).count()

    def get_enrolled_count(self, obj):
        return obj.enrollments.filter(is_active=True).count()

    def get_is_enrolled(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return False
        return obj.enrollments.filter(
            student=request.user, is_active=True
        ).exists()

    def get_progress_percent(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return 0
        enrollment = obj.enrollments.filter(
            student=request.user, is_active=True
        ).first()
        return enrollment.progress_percent if enrollment else 0


class LMSOfferingDetailSerializer(LMSOfferingListSerializer):
    """Full offering detail including modules and lessons."""
    modules = serializers.SerializerMethodField()
    enrollment_pin = serializers.CharField(required=False, allow_blank=True, max_length=4)

    class Meta(LMSOfferingListSerializer.Meta):
        fields = LMSOfferingListSerializer.Meta.fields + ['modules', 'enrollment_pin']
        read_only_fields = LMSOfferingListSerializer.Meta.read_only_fields

    def validate_enrollment_pin(self, value):
        value = (value or '').strip()
        if value and (len(value) != 4 or not value.isdigit()):
            raise serializers.ValidationError('Enrollment PIN must be exactly 4 digits.')
        return value

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        is_instructor = user and user.is_authenticated and (
            user.role in (
                UserRole.EXAMINER, UserRole.DEPARTMENT_ADMIN, UserRole.HOD,
                UserRole.FACULTY_ADMIN, UserRole.SUPER_ADMIN,
            )
        )
        if not is_instructor:
            data.pop('enrollment_pin', None)
        return data

    def get_modules(self, obj):
        request = self.context.get('request')
        modules = obj.modules.all().prefetch_related(
            'lessons__quiz__questions', 'lessons__assignment'
        )
        if request and request.user.role == UserRole.STUDENT:
            modules = modules.filter(is_published=True)
        return ModuleSerializer(
            modules.order_by('order'), many=True, context=self.context
        ).data


# ─── Enrollment ───────────────────────────────────────────────────────────────

class EnrollmentSerializer(serializers.ModelSerializer):
    offering_summary = LMSOfferingListSerializer(source='offering', read_only=True)
    progress_percent = serializers.SerializerMethodField()

    class Meta:
        model = Enrollment
        fields = ['id', 'offering', 'offering_summary', 'enrolled_at',
                  'is_active', 'completed_at', 'progress_percent']
        read_only_fields = ['enrolled_at', 'completed_at', 'is_active']

    def get_progress_percent(self, obj):
        return obj.progress_percent


# ─── Quiz Attempt ─────────────────────────────────────────────────────────────

class QuizAttemptSerializer(serializers.ModelSerializer):
    quiz_title = serializers.CharField(source='quiz.title', read_only=True)
    time_limit_minutes = serializers.IntegerField(source='quiz.time_limit_minutes', read_only=True)

    class Meta:
        model = QuizAttempt
        fields = [
            'id', 'quiz', 'quiz_title', 'attempt_number', 'status',
            'started_at', 'submitted_at', 'expires_at', 'answers',
            'score', 'passed', 'focus_loss_count', 'violation_log', 'auto_submitted',
            'time_limit_minutes',
        ]
        read_only_fields = [
            'attempt_number', 'started_at', 'submitted_at', 'expires_at',
            'score', 'passed',
        ]


class QuizSubmitSerializer(serializers.Serializer):
    """Payload for submitting quiz answers."""
    answers = serializers.JSONField(
        help_text='Dict: {question_id: selected_index (int) or text (str)}',
    )
    focus_loss_count = serializers.IntegerField(default=0, min_value=0)
    violations = serializers.ListField(
        child=serializers.DictField(),
        required=False,
        default=list,
    )
    timed_out = serializers.BooleanField(required=False, default=False)
    auto_submitted = serializers.BooleanField(required=False, default=False)


# ─── Submission ───────────────────────────────────────────────────────────────

class SubmissionSerializer(serializers.ModelSerializer):
    assignment_title = serializers.CharField(source='assignment.title', read_only=True)
    graded_by_name = serializers.SerializerMethodField()
    student_user_id = serializers.IntegerField(source='student.id', read_only=True)
    student_matric = serializers.CharField(source='student.student_id', read_only=True)
    student_name = serializers.SerializerMethodField()

    class Meta:
        model = Submission
        fields = [
            'id', 'assignment', 'assignment_title', 'student_user_id', 'student_matric',
            'student_name', 'content', 'file_key',
            'submitted_at', 'is_late', 'score', 'graded_at',
            'graded_by', 'graded_by_name', 'feedback', 'focus_loss_count', 'violation_log',
            'similarity_score', 'similarity_report', 'ai_suggested_score', 'ai_feedback', 'ai_graded',
            'ai_confidence_score', 'ai_strengths', 'ai_weaknesses',
        ]
        read_only_fields = [
            'submitted_at', 'is_late', 'score', 'graded_at',
            'graded_by', 'graded_by_name', 'student_user_id', 'student_matric', 'student_name',
        ]

    def get_graded_by_name(self, obj):
        return obj.graded_by.get_full_name() if obj.graded_by else None

    def get_student_name(self, obj):
        return obj.student.get_full_name() if obj.student else None


class GradeSubmissionSerializer(serializers.Serializer):
    score = serializers.DecimalField(max_digits=5, decimal_places=2)
    feedback = serializers.CharField(required=False, allow_blank=True)


# ─── LessonProgress ───────────────────────────────────────────────────────────

class LessonProgressSerializer(serializers.ModelSerializer):
    class Meta:
        model = LessonProgress
        fields = ['lesson', 'completed', 'completed_at', 'last_accessed']
        read_only_fields = ['completed_at', 'last_accessed']
