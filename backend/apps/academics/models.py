"""
Academic models for courses, results, and GPA calculations.
Includes Faculty/Department scope, upload batches, and course-batch approval workflow.
"""
from django.db import models
from django.conf import settings
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils import timezone
from decimal import Decimal


class Faculty(models.Model):
    """Faculty (e.g. Faculty of Natural Sciences). Used for scope and reporting."""
    code = models.CharField(max_length=20, unique=True, help_text='Faculty code (e.g. FNS)')
    name = models.CharField(max_length=200, help_text='Faculty name')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['code']
        verbose_name = 'Faculty'
        verbose_name_plural = 'Faculties'

    def __str__(self):
        return f'{self.code} - {self.name}'


class Department(models.Model):
    """Department under a Faculty. Used for scope (HOD/Lecturer) and result grouping."""
    faculty = models.ForeignKey(
        Faculty,
        on_delete=models.CASCADE,
        related_name='departments',
        help_text='Parent faculty'
    )
    code = models.CharField(max_length=20, help_text='Department code (e.g. CSC)')
    name = models.CharField(max_length=200, help_text='Department name')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['faculty', 'code']
        verbose_name = 'Department'
        verbose_name_plural = 'Departments'
        unique_together = [['faculty', 'code']]

    def __str__(self):
        return f'{self.code} - {self.name}'


class Course(models.Model):
    """University course model"""
    code = models.CharField(max_length=20, unique=True, help_text='Course code (e.g., CSC201)')
    title = models.CharField(max_length=200, help_text='Course title')
    credit_units = models.PositiveIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(6)],
        help_text='Number of credit units (1-6)'
    )
    semester = models.CharField(
        max_length=20,
        choices=[('FIRST', 'First Semester'), ('SECOND', 'Second Semester')],
        help_text='Semester offered'
    )
    level = models.CharField(
        max_length=10,
        choices=[
            ('100', '100 Level'),
            ('200', '200 Level'),
            ('300', '300 Level'),
            ('400', '400 Level'),
        ],
        help_text='Student level'
    )
    is_active = models.BooleanField(default=True, help_text='Is course currently active?')
    department = models.ForeignKey(
        Department,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='courses',
        help_text='Department that owns this course (optional)'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['level', 'code']
        verbose_name = 'Course'
        verbose_name_plural = 'Courses'

    def __str__(self):
        return f"{self.code} - {self.title}"


class DepartmentBorrowedCourse(models.Model):
    """
    Links a catalogue course owned by one department to another department
    for borrowed/service courses (e.g. GST, MTH taken by CSC students).
    """
    department = models.ForeignKey(
        Department,
        on_delete=models.CASCADE,
        related_name='borrowed_course_links',
        help_text='Department that may enter results for this borrowed course',
    )
    course = models.ForeignKey(
        Course,
        on_delete=models.CASCADE,
        related_name='borrowed_by_departments',
        help_text='Course owned by another department (or shared catalogue entry)',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [['department', 'course']]
        verbose_name = 'Borrowed course'
        verbose_name_plural = 'Borrowed courses'

    def __str__(self):
        return f'{self.department.code} borrows {self.course.code}'


class Result(models.Model):
    """Student result model with custom permissions"""
    
    GRADE_CHOICES = [
        ('A', 'A (70-100) - Excellent'),
        ('B', 'B (60-69) - Very Good'),
        ('C', 'C (50-59) - Good'),
        ('D', 'D (45-49) - Fair'),
        ('E', 'E (40-44) - Pass'),
        ('F', 'F (0-39) - Fail'),
    ]
    
    STATUS_CHOICES = [
        ('DRAFT', 'Draft'),
        ('PENDING', 'Pending'),
        ('SUBMITTED', 'Submitted'),
        ('FACULTY_REVIEW', 'Faculty Review'),
        ('HOD_REVIEW', 'HOD Review'),
        ('APPROVED', 'Approved by HOD'),
        ('LOCKED_PUBLISHED', 'Locked & Published'),
        ('REJECTED', 'Rejected'),
        ('RETURNED', 'Returned for Revision'),
    ]
    
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='results',
        help_text='Student who owns this result'
    )
    course = models.ForeignKey(
        Course,
        on_delete=models.CASCADE,
        related_name='results',
        help_text='Course for this result'
    )
    score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text='Score out of 100'
    )
    grade = models.CharField(
        max_length=1,
        choices=GRADE_CHOICES,
        blank=True,
        help_text='Grade as uploaded; no auto-calculation'
    )
    grade_point = models.DecimalField(
        max_digits=3,
        decimal_places=2,
        blank=True,
        null=True,
        help_text='Grade point (0-5)'
    )
    remark = models.CharField(
        max_length=100,
        blank=True,
        help_text='Remark (e.g., Excellent, Very Good, Good)'
    )
    status = models.CharField(
        max_length=30,
        choices=STATUS_CHOICES,
        default='DRAFT',
        help_text='Workflow status'
    )
    session = models.CharField(
        max_length=20,
        help_text='Academic session (e.g., 2023/2024)'
    )
    semester = models.CharField(
        max_length=20,
        choices=[('FIRST', 'First Semester'), ('SECOND', 'Second Semester')],
        help_text='Semester'
    )
    
    # Audit fields
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='uploaded_results',
        help_text='Examiner who uploaded this result'
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_results',
        help_text='HOD who approved this result'
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    # Module 4: lock when course batch is approved (no further edits)
    is_editable = models.BooleanField(
        default=True,
        help_text='False when batch is approved; locked for editing',
    )
    
    # Enhanced HOD module fields
    upload_batch = models.ForeignKey(
        'academics.ResultUploadBatch',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='results',
        help_text='Upload batch this result belongs to'
    )
    department = models.ForeignKey(
        'academics.Department',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='results',
        help_text='Department scope'
    )
    checksum = models.CharField(
        max_length=64,
        blank=True,
        help_text='SHA256 checksum for tamper detection'
    )
    locked_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text='When result was locked (LOCKED_PUBLISHED status)'
    )
    locked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='locked_results',
        help_text='User who locked this result'
    )
    rejection_reason = models.TextField(
        blank=True,
        help_text='Reason for rejection (if status=REJECTED)'
    )
    is_deleted = models.BooleanField(
        default=False,
        db_index=True,
        help_text='Soft delete — hidden from HOD/student views when True',
    )
    deleted_at = models.DateTimeField(null=True, blank=True)
    deleted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='deleted_results',
        help_text='HOD who soft-deleted this result',
    )
    faculty_reviewer_remark = models.TextField(
        blank=True,
        help_text='Remarks from Faculty Reviewer (if applicable)'
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Result'
        verbose_name_plural = 'Results'
        unique_together = ['student', 'course', 'session', 'semester']
        
        # ⭐ CUSTOM PERMISSIONS for group-based authorization
        permissions = [
            ('upload_result', 'Can upload student results'),
            ('approve_result', 'Can approve results (HOD only)'),
            ('view_all_results', 'Can view all students results'),
            ('view_own_result', 'Can view own results (Student)'),
        ]
    
    def __str__(self):
        return f"{self.student.student_id} - {self.course.code} ({self.grade})"
    
    def save(self, *args, **kwargs):
        """
        Save result exactly as provided. No calculation — score, grade, and
        grade_point are stored as uploaded or entered.
        """
        super().save(*args, **kwargs)

    def get_score_display(self):
        """Return score as shown when uploaded: no trailing .00 (e.g. 85 not 85.00)."""
        if self.score is None:
            return ''
        return str(self.score.normalize())


class SemesterSummary(models.Model):
    """Stores exact summary data uploaded from admin (LE, NSS, RCU, etc.)"""
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='semester_summaries',
        help_text='Student'
    )
    session = models.CharField(max_length=20, help_text='Academic session')
    semester = models.CharField(
        max_length=20,
        choices=[('FIRST', 'First Semester'), ('SECOND', 'Second Semester')],
        help_text='Semester'
    )
    # Summary fields (exact format from upload: LE, NSS, RCU, ECU, CP, GPA, TRCU, TECU, TCP, PCGPA, CGPA, Outstanding, REMARKS, Standing)
    le = models.CharField(max_length=50, blank=True, help_text='LE')
    nss = models.CharField(max_length=50, blank=True, help_text='NSS')
    rcu = models.CharField(max_length=50, blank=True, help_text='RCU')
    ecu = models.CharField(max_length=50, blank=True, help_text='ECU')
    cp = models.CharField(max_length=50, blank=True, help_text='CP')
    gpa = models.CharField(max_length=50, blank=True, help_text='GPA')
    trcu = models.CharField(max_length=50, blank=True, help_text='TRCU')
    tecu = models.CharField(max_length=50, blank=True, help_text='TECU')
    tcp = models.CharField(max_length=50, blank=True, help_text='TCP')
    pcgpa = models.CharField(max_length=50, blank=True, help_text='PCGPA')
    cgpa = models.CharField(max_length=50, blank=True, help_text='CGPA')
    outstanding_courses = models.CharField(max_length=255, blank=True, help_text='OUTSTANDING COURSES from file')
    remarks = models.CharField(max_length=255, blank=True, help_text='REMARKS from file')
    standing = models.CharField(max_length=50, blank=True, help_text='Standing')
    
    # Raw summary string (for exact display)
    raw_summary = models.TextField(blank=True, help_text='Raw summary string as uploaded')
    
    approved = models.BooleanField(default=False, help_text='Summary approved by HOD')
    approved_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_semester_summaries',
        help_text='User who approved this summary',
    )
    upload_batch = models.ForeignKey(
        'ResultUploadBatch',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='semester_summaries',
        help_text='Upload batch this summary came from (empty if manual)',
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-session', '-semester']
        verbose_name = 'Semester Summary'
        verbose_name_plural = 'Semester Summaries'
        unique_together = ['student', 'session', 'semester']
    
    def __str__(self):
        return f"{self.student.student_id} - {self.session} {self.semester} Summary"


class GPA(models.Model):
    """Semester GPA calculation"""
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='gpa_records'
    )
    session = models.CharField(max_length=20)
    semester = models.CharField(max_length=20)
    gpa = models.DecimalField(max_digits=3, decimal_places=2, help_text='Semester GPA')
    cgpa = models.DecimalField(max_digits=3, decimal_places=2, help_text='Cumulative GPA')
    total_credits = models.PositiveIntegerField(help_text='Total credit units earned')
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
        unique_together = ['student', 'session', 'semester']
        verbose_name = 'GPA Record'
        verbose_name_plural = 'GPA Records'
        
        permissions = [
            ('calculate_gpa', 'Can calculate GPA/CGPA'),
        ]
    
    def __str__(self):
        return f"{self.student.student_id} - {self.session} {self.semester} (GPA: {self.gpa})"


class CourseAssignment(models.Model):
    """Assigns EXAMINER (lecturer) users to courses for view-only access. No upload/approve."""
    examiner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='course_assignments',
        limit_choices_to={'role': 'EXAMINER'},
        help_text='Examiner (lecturer) with view-only access to this course',
    )
    course = models.ForeignKey(
        Course,
        on_delete=models.CASCADE,
        related_name='examiner_assignments',
        help_text='Course the examiner can view results for',
    )

    class Meta:
        ordering = ['course__code', 'examiner__email']
        verbose_name = 'Course assignment'
        verbose_name_plural = 'Course assignments'
        unique_together = [['examiner', 'course']]

    def __str__(self):
        return f'{self.examiner.email} → {self.course.code}'


class ResultUploadBatch(models.Model):
    """
    Enterprise upload batch: one batch per file upload.
    Approval is at batch level — HOD approves or rejects the entire batch; all results in the batch are updated.
    """
    class Status(models.TextChoices):
        PENDING = 'PENDING', 'Pending'
        PROCESSING = 'PROCESSING', 'Processing'
        COMPLETED = 'COMPLETED', 'Completed'
        FAILED = 'FAILED', 'Failed'

    class ApprovalStatus(models.TextChoices):
        PENDING_APPROVAL = 'PENDING_APPROVAL', 'Pending HOD approval'
        APPROVED = 'APPROVED', 'Approved'
        REJECTED = 'REJECTED', 'Rejected'

    filename = models.CharField(max_length=255, help_text='Original file name')
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='result_upload_batches',
        help_text='User who uploaded'
    )
    department = models.ForeignKey(
        Department,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='result_upload_batches',
        help_text='Department scope (optional)'
    )
    faculty = models.ForeignKey(
        Faculty,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='result_upload_batches',
        help_text='Faculty scope (optional)'
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
    )
    approval_status = models.CharField(
        max_length=20,
        choices=ApprovalStatus.choices,
        default=ApprovalStatus.PENDING_APPROVAL,
        db_index=True,
        help_text='HOD approval: pending, approved, or rejected for the entire batch',
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_upload_batches',
        help_text='HOD who approved or rejected this batch',
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(
        blank=True,
        help_text='Reason for rejection (if batch rejected)',
    )
    progress = models.PositiveIntegerField(
        default=0,
        help_text='Number of rows processed (for background uploads)',
    )
    session = models.CharField(max_length=20, blank=True, help_text='Session from upload')
    semester = models.CharField(max_length=20, blank=True, help_text='Semester from upload')
    success_count = models.PositiveIntegerField(default=0)
    error_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    upload_file_path = models.CharField(
        max_length=500,
        blank=True,
        null=True,
        help_text='Path to uploaded file for background processing',
    )
    report_download_token = models.CharField(
        max_length=64,
        blank=True,
        null=True,
        help_text='One-time token for error report download (TTL)',
    )
    report_download_expires_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text='When the error report download link expires',
    )

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Result upload batch'
        verbose_name_plural = 'Result upload batches'

    def __str__(self):
        return f'{self.filename} ({self.status} / {self.get_approval_status_display()})'

    @property
    def is_pending_approval(self):
        return (
            self.status == self.Status.COMPLETED
            and self.approval_status == self.ApprovalStatus.PENDING_APPROVAL
        )


class ResultRow(models.Model):
    """One row from an upload batch: either attached to a Result or stored as error."""
    class RowStatus(models.TextChoices):
        ATTACHED = 'ATTACHED', 'Attached'
        ERROR = 'ERROR', 'Error'

    batch = models.ForeignKey(
        ResultUploadBatch,
        on_delete=models.CASCADE,
        related_name='rows',
    )
    line_no = models.PositiveIntegerField(help_text='1-based line number in file')
    reg_number = models.CharField(max_length=50, blank=True)
    course_code = models.CharField(max_length=20, blank=True)
    score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )
    grade = models.CharField(max_length=5, blank=True)
    session = models.CharField(max_length=20, blank=True)
    semester = models.CharField(max_length=20, blank=True)
    status = models.CharField(
        max_length=20,
        choices=RowStatus.choices,
        default=RowStatus.ERROR,
        db_index=True,
    )
    error_message = models.CharField(max_length=500, blank=True)
    result = models.ForeignKey(
        Result,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='upload_rows',
        help_text='Created Result when status=ATTACHED',
    )

    class Meta:
        ordering = ['batch', 'line_no']
        verbose_name = 'Result upload row'
        verbose_name_plural = 'Result upload rows'
        unique_together = [['batch', 'line_no']]

    def __str__(self):
        return f'Batch {self.batch_id} line {self.line_no} ({self.status})'


class CourseBatch(models.Model):
    """Groups results by course+session+semester for HOD approval workflow."""
    class Status(models.TextChoices):
        PENDING = 'PENDING', 'Pending'
        APPROVED_BY_HOD = 'APPROVED_BY_HOD', 'Approved by HOD'
        REJECTED = 'REJECTED', 'Rejected'
        REOPEN = 'REOPEN', 'Request changes'
        PUBLISHED = 'PUBLISHED', 'Published'

    course = models.ForeignKey(
        Course,
        on_delete=models.CASCADE,
        related_name='course_batches',
        help_text='Course for this batch',
    )
    session = models.CharField(max_length=20, db_index=True)
    semester = models.CharField(max_length=20, db_index=True)
    department = models.ForeignKey(
        Department,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='course_batches',
    )
    faculty = models.ForeignKey(
        Faculty,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='course_batches',
    )
    status = models.CharField(
        max_length=30,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
    )
    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='submitted_course_batches',
    )
    submitted_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_course_batches',
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Course batch'
        verbose_name_plural = 'Course batches'
        unique_together = [['course', 'session', 'semester']]

    def __str__(self):
        return f'{self.course.code} {self.session} {self.semester} ({self.status})'


class ResultVersion(models.Model):
    """
    Immutable version history for Result model.
    When a Result is locked (LOCKED_PUBLISHED), updates create new versions.
    Only SuperAdmin can perform emergency unlocks (creates new version with audit).
    """
    result = models.ForeignKey(
        Result,
        on_delete=models.CASCADE,
        related_name='versions',
        help_text='Parent result'
    )
    version_number = models.PositiveIntegerField(
        help_text='Version number (1, 2, 3...)'
    )
    score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )
    grade = models.CharField(max_length=1)
    grade_point = models.DecimalField(max_digits=3, decimal_places=2, null=True, blank=True)
    remark = models.CharField(max_length=100, blank=True)
    status = models.CharField(max_length=30)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='result_versions_created',
        help_text='User who created this version'
    )
    change_reason = models.TextField(
        blank=True,
        help_text='Reason for change (required for emergency unlock)'
    )
    checksum = models.CharField(
        max_length=64,
        help_text='SHA256 checksum of this version for tamper detection'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-version_number']
        unique_together = [['result', 'version_number']]
        verbose_name = 'Result version'
        verbose_name_plural = 'Result versions'

    def __str__(self):
        return f'{self.result} v{self.version_number}'

    def calculate_checksum(self):
        """Calculate SHA256 checksum of version data."""
        import hashlib
        import json
        data = {
            'result_id': self.result_id,
            'version_number': self.version_number,
            'score': str(self.score),
            'grade': self.grade,
            'grade_point': str(self.grade_point) if self.grade_point else '',
            'remark': self.remark,
            'status': self.status,
            'changed_by_id': self.changed_by_id if self.changed_by_id else '',
            'created_at': self.created_at.isoformat() if self.created_at else '',
        }
        data_str = json.dumps(data, sort_keys=True)
        return hashlib.sha256(data_str.encode()).hexdigest()

    def save(self, *args, **kwargs):
        """Calculate checksum before saving."""
        if not self.checksum:
            self.checksum = self.calculate_checksum()
        super().save(*args, **kwargs)


class AuditForwardingLog(models.Model):
    """
    Tracks audit forwarding to SuperAdmin webhook/email.
    Retry logic and dead-letter queue for failed forwards.
    """
    class Status(models.TextChoices):
        PENDING = 'PENDING', 'Pending'
        SENT = 'SENT', 'Sent'
        FAILED = 'FAILED', 'Failed'
        RETRYING = 'RETRYING', 'Retrying'

    audit_log = models.ForeignKey(
        'accounts.AuditLog',
        on_delete=models.CASCADE,
        related_name='forwarding_logs',
        help_text='Audit log being forwarded'
    )
    forwarding_type = models.CharField(
        max_length=20,
        choices=[
            ('WEBHOOK', 'Webhook'),
            ('EMAIL', 'Email'),
            ('DAILY_DIGEST', 'Daily Digest'),
        ],
        help_text='Type of forwarding'
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    endpoint_url = models.CharField(
        max_length=500,
        blank=True,
        help_text='Webhook endpoint URL'
    )
    payload = models.JSONField(
        default=dict,
        help_text='Forwarded payload'
    )
    response_status = models.IntegerField(null=True, blank=True)
    response_body = models.TextField(blank=True)
    error_message = models.TextField(blank=True)
    retry_count = models.PositiveIntegerField(default=0)
    next_retry_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Audit forwarding log'
        verbose_name_plural = 'Audit forwarding logs'

    def __str__(self):
        return f'{self.forwarding_type} - {self.status} - {self.created_at}'
