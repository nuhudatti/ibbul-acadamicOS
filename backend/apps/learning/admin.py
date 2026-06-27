from django.contrib import admin
from .models import (
    LMSOffering, Module, Lesson, Quiz, QuizQuestion,
    QuizAttempt, Assignment, Submission, Enrollment, LessonProgress,
)


class ModuleInline(admin.TabularInline):
    model = Module
    extra = 0
    fields = ['title', 'order', 'is_published']
    ordering = ['order']


class LessonInline(admin.TabularInline):
    model = Lesson
    extra = 0
    fields = ['title', 'content_type', 'order', 'is_published', 'duration_minutes']
    ordering = ['order']


class QuizQuestionInline(admin.TabularInline):
    model = QuizQuestion
    extra = 0
    fields = ['question_text', 'correct_index', 'points', 'order']
    ordering = ['order']


@admin.register(LMSOffering)
class LMSOfferingAdmin(admin.ModelAdmin):
    list_display = ['__str__', 'instructor', 'session', 'semester', 'is_published', 'enrollment_open', 'enrolled_count']
    list_filter = ['session', 'semester', 'is_published', 'enrollment_open']
    search_fields = ['course__code', 'course__title', 'instructor__email']
    raw_id_fields = ['course', 'instructor']
    inlines = [ModuleInline]

    def enrolled_count(self, obj):
        return obj.enrollments.filter(is_active=True).count()
    enrolled_count.short_description = 'Enrolled'


@admin.register(Module)
class ModuleAdmin(admin.ModelAdmin):
    list_display = ['title', 'offering', 'order', 'is_published']
    list_filter = ['is_published']
    search_fields = ['title', 'offering__course__code']
    inlines = [LessonInline]


@admin.register(Lesson)
class LessonAdmin(admin.ModelAdmin):
    list_display = ['title', 'module', 'content_type', 'order', 'is_published', 'duration_minutes']
    list_filter = ['content_type', 'is_published']
    search_fields = ['title']


@admin.register(Quiz)
class QuizAdmin(admin.ModelAdmin):
    list_display = ['title', 'lesson', 'passing_score', 'time_limit_minutes', 'max_attempts']
    inlines = [QuizQuestionInline]


@admin.register(QuizAttempt)
class QuizAttemptAdmin(admin.ModelAdmin):
    list_display = ['student', 'quiz', 'attempt_number', 'status', 'score', 'passed', 'started_at']
    list_filter = ['status', 'passed']
    search_fields = ['student__student_id', 'student__email']
    readonly_fields = ['score', 'passed', 'answers']


@admin.register(Assignment)
class AssignmentAdmin(admin.ModelAdmin):
    list_display = ['title', 'lesson', 'max_score', 'due_at']


@admin.register(Submission)
class SubmissionAdmin(admin.ModelAdmin):
    list_display = ['student', 'assignment', 'submitted_at', 'score', 'graded_at', 'is_late']
    list_filter = ['is_late']
    search_fields = ['student__student_id', 'student__email']
    readonly_fields = ['submitted_at', 'is_late']


@admin.register(Enrollment)
class EnrollmentAdmin(admin.ModelAdmin):
    list_display = ['student', 'offering', 'enrolled_at', 'is_active']
    list_filter = ['is_active']
    search_fields = ['student__student_id', 'student__email', 'offering__course__code']


@admin.register(LessonProgress)
class LessonProgressAdmin(admin.ModelAdmin):
    list_display = ['student', 'lesson', 'completed', 'completed_at', 'last_accessed']
    list_filter = ['completed']
    search_fields = ['student__student_id']
