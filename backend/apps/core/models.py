"""
Academic Core — single source of truth for academic identity and structure.

Ownership rules (enforced by architecture, not just convention):
  - User identity          → apps.accounts.User
  - Academic structure     → apps.academics (Faculty, Department, Course)
  - Official session       → apps.core.AcademicSession   ← NEW
  - Course registration    → apps.core.StudentCourseRegistration  ← NEW

The Results Module (apps.academics) and Learning Module (apps.learning)
MUST import identity/structure from here or from apps.accounts/apps.academics.
Neither module owns users, faculties, departments, courses, or sessions.
"""
from django.db import models
from django.conf import settings


class AcademicSession(models.Model):
    """
    Official academic session (e.g. 2023/2024).
    There is exactly one current session at any time.
    All modules (Results, Learning) reference sessions by name string,
    but this model is the authoritative list and flags the active one.
    """
    name = models.CharField(
        max_length=20,
        unique=True,
        help_text='Session identifier (e.g. 2023/2024)',
    )
    is_current = models.BooleanField(
        default=False,
        help_text='True for the active session; only one session should be current',
    )
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'core_academic_sessions'
        ordering = ['-name']
        verbose_name = 'Academic Session'
        verbose_name_plural = 'Academic Sessions'

    def __str__(self):
        return f'{self.name}{"  ← current" if self.is_current else ""}'

    def save(self, *args, **kwargs):
        """Ensure only one session is current."""
        if self.is_current:
            AcademicSession.objects.exclude(pk=self.pk).update(is_current=False)
        super().save(*args, **kwargs)

    @classmethod
    def get_current(cls):
        """Return the current session, or None if none is set."""
        return cls.objects.filter(is_current=True).first()


class StudentCourseRegistration(models.Model):
    """
    Official academic course registration.

    This is the registrar record of which student is officially enrolled in
    which course for a given session/semester.  It is the Academic Core's
    authoritative enrollment list — not to be confused with LMS enrollment
    (apps.learning.Enrollment), which tracks *learning content* access.

    Both the Results Module (creating Result records) and the Learning Module
    (creating LMSOffering enrollments) SHOULD verify against this table before
    accepting a student for a course.

    Data source: imported from the academic registry (bulk import or admin entry).
    """
    STATUS_CHOICES = [
        ('registered', 'Registered'),
        ('dropped',    'Dropped'),
        ('carried_over', 'Carried Over'),
    ]

    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='course_registrations',
        limit_choices_to={'role': 'STUDENT'},
        help_text='The registered student (from Academic Core)',
    )
    course = models.ForeignKey(
        'academics.Course',
        on_delete=models.CASCADE,
        related_name='student_registrations',
        help_text='Official course from Academic Core',
    )
    session = models.ForeignKey(
        AcademicSession,
        on_delete=models.CASCADE,
        related_name='registrations',
        help_text='Academic session for this registration',
    )
    semester = models.CharField(
        max_length=10,
        choices=[('FIRST', 'First Semester'), ('SECOND', 'Second Semester')],
        help_text='Semester of registration',
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='registered',
        db_index=True,
    )
    registered_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'core_student_registrations'
        ordering = ['-session__name', 'semester', 'student__student_id']
        verbose_name = 'Student Course Registration'
        verbose_name_plural = 'Student Course Registrations'
        unique_together = [['student', 'course', 'session', 'semester']]
        indexes = [
            models.Index(fields=['student', 'session']),
            models.Index(fields=['course', 'session', 'semester']),
        ]

    def __str__(self):
        return (
            f'{self.student.student_id} — {self.course.code} '
            f'({self.session.name} {self.semester})'
        )


class PlatformBranding(models.Model):
    """
    Singleton — official platform visual identity for UI and transactional emails.
    Updated by Super Admin via /api/core/platform-branding/
    """
    singleton_id = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    platform_name = models.CharField(max_length=160, default='IBBUL Academic OS')
    platform_short_name = models.CharField(max_length=40, default='IBBUL')
    tagline = models.CharField(max_length=160, default='Learning for Service')
    footer_text = models.TextField(
        blank=True,
        default='Ibrahim Badamasi Babangida University, Lapai · Niger State, Nigeria',
    )
    primary_color = models.CharField(max_length=7, default='#0F6B3E')
    accent_color = models.CharField(max_length=7, default='#C9A227')
    logo_data = models.TextField(blank=True, help_text='Cloudinary HTTPS URL for logo')
    login_background_data = models.TextField(blank=True, help_text='Cloudinary HTTPS URL for login hero')
    dashboard_banner_data = models.TextField(blank=True, help_text='Cloudinary HTTPS URL for dashboard banner')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'core_platform_branding'
        verbose_name = 'Platform branding'
        verbose_name_plural = 'Platform branding'

    def __str__(self):
        return self.platform_name

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj
