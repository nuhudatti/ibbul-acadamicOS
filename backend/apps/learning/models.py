"""
Learning Management System models.
Students, courses, and academic structure come from the Academic Core (accounts + academics).
This module only owns: LMS content delivery, enrollment, progress, assessments.
"""
from django.db import models
from django.conf import settings
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils import timezone


class LMSOffering(models.Model):
    """
    Links an official CourseCatalog (Academic Core) to LMS content for a
    specific session and semester. The LMS never owns the course definition —
    it only adds delivery content on top of the academic record.
    """
    course = models.ForeignKey(
        'academics.Course',
        on_delete=models.CASCADE,
        related_name='lms_offerings',
        help_text='Official course from Academic Core',
    )
    session = models.CharField(
        max_length=20,
        help_text='Academic session (e.g., 2023/2024)',
    )
    semester = models.CharField(
        max_length=20,
        choices=[('FIRST', 'First Semester'), ('SECOND', 'Second Semester')],
        help_text='Semester for this offering',
    )
    instructor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='taught_offerings',
        limit_choices_to={'role': 'EXAMINER'},
        help_text='Examiner/Lecturer responsible for this LMS offering',
    )
    description = models.TextField(
        blank=True,
        help_text='Course description or overview for students',
    )
    thumbnail_key = models.CharField(
        max_length=500,
        blank=True,
        help_text='S3 key for course thumbnail image',
    )
    is_published = models.BooleanField(
        default=False,
        help_text='Published offerings are visible to enrolled students',
    )
    enrollment_open = models.BooleanField(
        default=True,
        help_text='Whether new enrollments are accepted',
    )
    enrollment_pin = models.CharField(
        max_length=4,
        blank=True,
        default='',
        help_text='Optional 4-digit PIN students must enter to enroll',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-session', 'semester', 'course__code']
        verbose_name = 'LMS Offering'
        verbose_name_plural = 'LMS Offerings'
        unique_together = [['course', 'session', 'semester']]

    def __str__(self):
        return f'{self.course.code} — {self.session} {self.semester}'

    @property
    def enrolled_count(self):
        return self.enrollments.filter(is_active=True).count()

    @property
    def completion_rate(self):
        """Average completion % across all enrolled students."""
        total = self.enrollments.filter(is_active=True).count()
        if not total:
            return 0
        total_lessons = Lesson.objects.filter(module__offering=self).count()
        if not total_lessons:
            return 0
        completed = LessonProgress.objects.filter(
            lesson__module__offering=self, completed=True
        ).count()
        return round((completed / (total * total_lessons)) * 100, 1) if total_lessons else 0


class Module(models.Model):
    """A chapter or unit within an LMSOffering. Contains ordered lessons."""
    offering = models.ForeignKey(
        LMSOffering,
        on_delete=models.CASCADE,
        related_name='modules',
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    order = models.PositiveIntegerField(default=0)
    is_published = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['order']
        verbose_name = 'Module'
        verbose_name_plural = 'Modules'

    def __str__(self):
        return f'{self.offering} › {self.title}'


class Lesson(models.Model):
    """
    A single learning item within a Module.
    Supports multiple content types: video, PDF, HTML, quiz, assignment.
    """
    CONTENT_TYPES = [
        ('video', 'Video'),
        ('pdf', 'PDF Document'),
        ('html', 'HTML Content'),
        ('quiz', 'Quiz'),
        ('assignment', 'Assignment'),
        ('link', 'External Link'),
    ]

    module = models.ForeignKey(
        Module,
        on_delete=models.CASCADE,
        related_name='lessons',
    )
    title = models.CharField(max_length=255)
    content_type = models.CharField(max_length=20, choices=CONTENT_TYPES)
    content_body = models.TextField(
        blank=True,
        help_text='HTML body (for html type) or embed code (for video)',
    )
    file_key = models.CharField(
        max_length=500,
        blank=True,
        help_text='S3 key for uploaded file (video/pdf)',
    )
    external_url = models.URLField(
        blank=True,
        help_text='External URL for link-type lessons',
    )
    duration_minutes = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text='Estimated duration in minutes',
    )
    order = models.PositiveIntegerField(default=0)
    is_published = models.BooleanField(default=True)
    is_preview = models.BooleanField(
        default=False,
        help_text='Preview lessons are accessible without enrollment',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['order']
        verbose_name = 'Lesson'
        verbose_name_plural = 'Lessons'

    def __str__(self):
        return f'{self.module} › {self.title}'


class Quiz(models.Model):
    """Timed quiz attached to a quiz-type Lesson."""
    lesson = models.OneToOneField(
        Lesson,
        on_delete=models.CASCADE,
        related_name='quiz',
    )
    title = models.CharField(max_length=255)
    instructions = models.TextField(blank=True)
    passing_score = models.PositiveIntegerField(
        default=50,
        validators=[MinValueValidator(1), MaxValueValidator(100)],
        help_text='Minimum score (%) to pass',
    )
    time_limit_minutes = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text='Time limit in minutes (null = unlimited)',
    )
    max_attempts = models.PositiveIntegerField(
        default=3,
        help_text='Maximum number of attempts allowed per student',
    )
    shuffle_questions = models.BooleanField(default=False)
    due_at = models.DateTimeField(null=True, blank=True)
    secure_mode_enabled = models.BooleanField(
        default=True,
        help_text='Enable secure assessment mode for this quiz',
    )
    max_violations = models.PositiveIntegerField(
        default=3,
        help_text='Violations before auto-submit',
    )
    auto_submit_on_violations = models.BooleanField(
        default=True,
        help_text='Auto-submit when max violations reached',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Quiz'
        verbose_name_plural = 'Quizzes'

    def __str__(self):
        return f'Quiz: {self.lesson}'


class QuizQuestion(models.Model):
    """A single question in a Quiz — MCQ or short answer."""
    QUESTION_TYPES = [
        ('mcq', 'Multiple Choice'),
        ('short_answer', 'Short Answer'),
    ]

    quiz = models.ForeignKey(
        Quiz,
        on_delete=models.CASCADE,
        related_name='questions',
    )
    question_type = models.CharField(
        max_length=20,
        choices=QUESTION_TYPES,
        default='mcq',
    )
    question_text = models.TextField()
    options = models.JSONField(
        default=list,
        help_text='List of option strings, e.g. ["Option A", "Option B", ...]',
    )
    correct_index = models.PositiveIntegerField(
        default=0,
        help_text='0-based index of the correct option (MCQ only)',
    )
    model_answer = models.TextField(
        blank=True,
        help_text='Reference answer for short-answer similarity grading',
    )
    explanation = models.TextField(
        blank=True,
        help_text='Shown after submission to explain the correct answer',
    )
    points = models.PositiveIntegerField(default=1)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['order']
        verbose_name = 'Quiz Question'
        verbose_name_plural = 'Quiz Questions'

    def __str__(self):
        return f'Q{self.order + 1}: {self.question_text[:60]}'


class QuizAttempt(models.Model):
    """One student's attempt at a quiz."""
    STATUS_CHOICES = [
        ('in_progress', 'In Progress'),
        ('submitted', 'Submitted'),
        ('timed_out', 'Timed Out'),
    ]

    quiz = models.ForeignKey(
        Quiz,
        on_delete=models.CASCADE,
        related_name='attempts',
    )
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='quiz_attempts',
    )
    attempt_number = models.PositiveIntegerField(default=1)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='in_progress',
        db_index=True,
    )
    started_at = models.DateTimeField(auto_now_add=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    answers = models.JSONField(
        default=dict,
        help_text='Dict mapping question_id (str) → selected_index (int)',
    )
    score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        help_text='Score as a percentage (0-100)',
    )
    passed = models.BooleanField(null=True, blank=True)
    focus_loss_count = models.PositiveIntegerField(
        default=0,
        help_text='Number of times student switched away from the quiz window',
    )
    violation_log = models.JSONField(
        default=list,
        help_text='Secure-mode violation events',
    )
    auto_submitted = models.BooleanField(
        default=False,
        help_text='Auto-submitted by timeout or violations',
    )

    class Meta:
        ordering = ['-started_at']
        verbose_name = 'Quiz Attempt'
        verbose_name_plural = 'Quiz Attempts'
        unique_together = [['quiz', 'student', 'attempt_number']]

    def __str__(self):
        return f'{self.student} — {self.quiz} — Attempt {self.attempt_number}'

    def calculate_score(self):
        """Calculate percentage score from submitted answers (MCQ + short answer)."""
        from .services.plagiarism_engine import compare_texts

        questions = self.quiz.questions.all()
        if not questions:
            return 0
        earned = 0
        total_points = sum(q.points for q in questions)
        for q in questions:
            submitted = self.answers.get(str(q.id))
            if submitted is None:
                continue
            q_type = getattr(q, 'question_type', 'mcq') or 'mcq'
            if q_type == 'short_answer':
                if not str(submitted).strip():
                    continue
                if q.model_answer:
                    sim = compare_texts(str(submitted), q.model_answer)
                    if sim['combined_score'] >= 0.85:
                        earned += q.points
                    elif sim['combined_score'] >= 0.65:
                        earned += q.points * 0.5
                else:
                    earned += q.points * 0.5 if len(str(submitted).strip()) >= 10 else 0
            else:
                try:
                    if int(submitted) == q.correct_index:
                        earned += q.points
                except (TypeError, ValueError):
                    pass
        if total_points == 0:
            return 0
        return round((earned / total_points) * 100, 2)


class Assignment(models.Model):
    """Text/file assignment attached to an assignment-type Lesson."""
    lesson = models.OneToOneField(
        Lesson,
        on_delete=models.CASCADE,
        related_name='assignment',
    )
    title = models.CharField(max_length=255)
    description = models.TextField()
    instructions_key = models.CharField(
        max_length=500,
        blank=True,
        help_text='S3 key for a PDF instructions file',
    )
    max_score = models.PositiveIntegerField(default=100)
    due_at = models.DateTimeField(null=True, blank=True)
    allow_late_submission = models.BooleanField(default=False)
    enable_ai_grading = models.BooleanField(default=False)
    similarity_check_enabled = models.BooleanField(default=True)
    rubric = models.TextField(blank=True, help_text='Grading rubric for AI-assisted grading')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Assignment'
        verbose_name_plural = 'Assignments'

    def __str__(self):
        return f'Assignment: {self.lesson}'


class Submission(models.Model):
    """A student's submission for an Assignment."""
    assignment = models.ForeignKey(
        Assignment,
        on_delete=models.CASCADE,
        related_name='submissions',
    )
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='assignment_submissions',
    )
    content = models.TextField(
        blank=True,
        help_text='Text submission content',
    )
    file_key = models.CharField(
        max_length=500,
        blank=True,
        help_text='S3 key for file submission',
    )
    submitted_at = models.DateTimeField(auto_now_add=True)
    is_late = models.BooleanField(default=False)
    score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
    )
    graded_at = models.DateTimeField(null=True, blank=True)
    graded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='graded_submissions',
    )
    feedback = models.TextField(blank=True)
    focus_loss_count = models.PositiveIntegerField(default=0)
    violation_log = models.JSONField(default=list)
    similarity_score = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True,
    )
    similarity_report = models.JSONField(default=dict, blank=True)
    ai_suggested_score = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True,
    )
    ai_feedback = models.TextField(blank=True)
    ai_graded = models.BooleanField(default=False)

    class Meta:
        ordering = ['-submitted_at']
        verbose_name = 'Submission'
        verbose_name_plural = 'Submissions'
        unique_together = [['assignment', 'student']]

    def __str__(self):
        return f'{self.student} → {self.assignment}'

    def save(self, *args, **kwargs):
        if not self.pk and self.assignment.due_at:
            self.is_late = timezone.now() > self.assignment.due_at
        super().save(*args, **kwargs)


class Enrollment(models.Model):
    """
    A student's enrollment in an LMSOffering.
    Students belong to the Academic Core — this record only links them to LMS content.
    """
    offering = models.ForeignKey(
        LMSOffering,
        on_delete=models.CASCADE,
        related_name='enrollments',
    )
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='lms_enrollments',
        limit_choices_to={'role': 'STUDENT'},
    )
    enrolled_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-enrolled_at']
        verbose_name = 'Enrollment'
        verbose_name_plural = 'Enrollments'
        unique_together = [['offering', 'student']]

    def __str__(self):
        return f'{self.student} enrolled in {self.offering}'

    @property
    def progress_percent(self):
        total_lessons = Lesson.objects.filter(
            module__offering=self.offering, is_published=True
        ).count()
        if not total_lessons:
            return 0
        completed = LessonProgress.objects.filter(
            lesson__module__offering=self.offering,
            student=self.student,
            completed=True,
        ).count()
        return round((completed / total_lessons) * 100, 1)


class LessonProgress(models.Model):
    """Tracks whether a student has completed a specific lesson."""
    lesson = models.ForeignKey(
        Lesson,
        on_delete=models.CASCADE,
        related_name='progress_records',
    )
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='lesson_progress',
    )
    completed = models.BooleanField(default=False)
    completed_at = models.DateTimeField(null=True, blank=True)
    last_accessed = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [['lesson', 'student']]
        verbose_name = 'Lesson Progress'
        verbose_name_plural = 'Lesson Progress Records'

    def __str__(self):
        status = 'completed' if self.completed else 'in progress'
        return f'{self.student} — {self.lesson.title} ({status})'

    def mark_complete(self):
        if not self.completed:
            self.completed = True
            self.completed_at = timezone.now()
            self.save(update_fields=['completed', 'completed_at'])
