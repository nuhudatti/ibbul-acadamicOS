"""
Custom User Model
- Students authenticate with Student ID (U22/FNS/CSC/XXXX)
- Admins/HOD/Examiners authenticate with Email
Supports roles: Student, Examiner, HOD
"""
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.core.validators import RegexValidator
from typing import Optional
from common.validators.student_id_validator import validate_student_id_format


class UserRole(models.TextChoices):
    """Enterprise role hierarchy: SUPER_ADMIN → FACULTY_ADMIN → DEPARTMENT_ADMIN → EXAMINER → STUDENT."""
    SUPER_ADMIN = 'SUPER_ADMIN', 'Super Admin (ICT/Registrar)'
    FACULTY_ADMIN = 'FACULTY_ADMIN', 'Faculty Admin (Dean)'
    DEPARTMENT_ADMIN = 'DEPARTMENT_ADMIN', 'Department Admin (HOD)'
    EXAMINER = 'EXAMINER', 'Examiner (Lecturer)'
    STUDENT = 'STUDENT', 'Student'
    # Legacy alias: map to DEPARTMENT_ADMIN in migrations
    HOD = 'HOD', 'Head of Department (legacy)'


class UserManager(BaseUserManager):
    """Custom user manager supporting both student ID and email authentication"""
    
    def create_user(
        self, 
        email: str,
        password: Optional[str] = None,
        student_id: Optional[str] = None,
        role: str = UserRole.STUDENT,
        **extra_fields
    ) -> 'User':
        """
        Create and save a regular user
        
        Args:
            email: Email address (required for all users)
            password: User password
            student_id: Student ID in format U22/FNS/CSC/XXXX (required only for STUDENT role)
            role: User role (STUDENT, EXAMINER, HOD)
            **extra_fields: Additional user fields
            
        Returns:
            User instance
        """
        # For STUDENT role, student_id is required; email is optional (nullable)
        # Accept legacy HOD as DEPARTMENT_ADMIN
        if role == UserRole.HOD:
            role = UserRole.DEPARTMENT_ADMIN
        if role == UserRole.STUDENT:
            if not student_id:
                raise ValueError('Student ID is required for STUDENT role')
            # Normalize student_id to uppercase (format: U22/FNS/CSC/XXXX)
            student_id = student_id.strip().upper()
            # Validate student ID format
            validate_student_id_format(student_id)
            if not email or not email.strip():
                email = None  # Optional for students; they can add in Settings
            else:
                email = self.normalize_email(email)
        else:
            # For non-students (EXAMINER, DEPARTMENT_ADMIN, FACULTY_ADMIN, SUPER_ADMIN), email required
            student_id = None
            if not email:
                raise ValueError('The Email must be set for staff users.')
            email = self.normalize_email(email)
        
        user = self.model(
            email=email,
            student_id=student_id,  # Store in uppercase
            role=role,
            **extra_fields
        )
        user.set_password(password)
        user.save(using=self._db)
        return user
    
    def create_superuser(
        self, 
        email: str,
        password: Optional[str] = None,
        **extra_fields
    ) -> 'User':
        """
        Create and save a superuser (HOD/Admin)
        Superusers use email, NOT student_id
        
        Args:
            email: Email address
            password: User password
            **extra_fields: Additional user fields
            
        Returns:
            User instance with is_staff=True, is_superuser=True
        """
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('role', UserRole.SUPER_ADMIN)
        extra_fields.setdefault('student_id', None)  # Admins don't have student_id
        
        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser must have is_staff=True.')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser must have is_superuser=True.')
        
        return self.create_user(email, password, role=UserRole.SUPER_ADMIN, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    """
    Custom User model supporting dual authentication:
    - Students: Authenticate with Student ID (U22/FNS/CSC/XXXX)
    - Admins/HOD/Examiners: Authenticate with Email
    
    Student ID Format: U22/FNS/CSC/XXXX
    - U22: Year prefix (U + 2 digits)
    - FNS: Faculty code (3 uppercase letters)
    - CSC: Department code (3 uppercase letters)
    - XXXX: 4-digit student number
    """
    email = models.EmailField(
        unique=True,
        null=True,
        blank=True,
        help_text='Email (optional for students; used for admin/HOD login and password reset)'
    )
    
    student_id = models.CharField(
        max_length=20,
        unique=True,
        null=True,
        blank=True,
        validators=[validate_student_id_format],
        help_text='Student ID in format: U22/FNS/CSC/XXXX (required only for STUDENT role)'
    )
    
    role = models.CharField(
        max_length=30,
        choices=UserRole.choices,
        default=UserRole.STUDENT,
        help_text='Enterprise role: Super Admin, Faculty Admin, Department Admin, Examiner, Student'
    )
    
    first_name = models.CharField(max_length=150, blank=True)
    last_name = models.CharField(max_length=150, blank=True)
    
    # Scope FKs for staff: DEPARTMENT_ADMIN → department_fk, FACULTY_ADMIN → faculty, SUPER_ADMIN → global
    faculty = models.ForeignKey(
        'academics.Faculty',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='users',
        help_text='Faculty scope (for FACULTY_ADMIN)',
    )
    department_fk = models.ForeignKey(
        'academics.Department',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='users',
        help_text='Department scope (for DEPARTMENT_ADMIN/HOD)',
    )
    department = models.CharField(
        max_length=100,
        blank=True,
        help_text='Department display (e.g. Computer Science); for students/display'
    )
    level = models.CharField(
        max_length=20,
        blank=True,
        help_text='Level/Programme (e.g. 300, 400); read-only for students'
    )
    email_verified = models.BooleanField(
        default=False,
        help_text='True when student has verified email (future-ready)'
    )
    phone_number = models.CharField(
        max_length=20,
        blank=True,
        help_text='Phone number (optional)'
    )
    profile_picture_key = models.CharField(
        max_length=500,
        blank=True,
        help_text='S3 key for profile picture'
    )
    module_access = models.JSONField(
        default=list,
        blank=True,
        help_text='Platform modules accessible: results, learning, admin'
    )
    last_password_change = models.DateTimeField(
        null=True,
        blank=True,
        help_text='When password was last changed (settings or reset)'
    )
    is_first_login = models.BooleanField(
        default=True,
        help_text='If True, user must reset password before accessing dashboard'
    )
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    is_superuser = models.BooleanField(default=False)
    
    date_joined = models.DateTimeField(auto_now_add=True)
    last_login = models.DateTimeField(null=True, blank=True)
    
    objects = UserManager()
    
    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = []  # email is the only required field
    
    class Meta:
        db_table = 'users'
        verbose_name = 'User'
        verbose_name_plural = 'Users'
        indexes = [
            models.Index(fields=['email']),
            models.Index(fields=['student_id']),
            models.Index(fields=['role']),
        ]
        # Enterprise: scoped user management (HOD = department, Faculty Admin = faculty, Super Admin = all)
        permissions = [
            ('view_user_scoped', 'Can view users within scope'),
            ('add_user_scoped', 'Can add users within scope'),
            ('change_user_scoped', 'Can change users within scope'),
            ('bulk_import_users', 'Can bulk import users (CSV/Excel)'),
        ]
    
    def __str__(self) -> str:
        """Return student_id for students, email for admins"""
        return self.student_id if self.student_id else self.email
    
    def get_full_name(self) -> str:
        """Return full name or identifier if name not set"""
        if self.first_name and self.last_name:
            return f'{self.first_name} {self.last_name}'
        return self.student_id if self.student_id else self.email
    
    def get_short_name(self) -> str:
        """Return short name or identifier"""
        return self.first_name if self.first_name else (self.student_id if self.student_id else self.email)
    
    def get_username(self) -> str:
        """Return username for authentication (student_id for students, email for others). Never None."""
        if self.role == UserRole.STUDENT and self.student_id:
            return self.student_id
        if self.email:
            return self.email
        return ''


class AuditLog(models.Model):
    """
    Audit log for security-critical actions: login, password reset, first-login change, admin actions.
    Production-grade accountability and compliance.
    """
    class Action(models.TextChoices):
        LOGIN_SUCCESS = 'LOGIN_SUCCESS', 'Login success'
        LOGIN_FAILED = 'LOGIN_FAILED', 'Login failed'
        FIRST_LOGIN_PASSWORD_CHANGE = 'FIRST_LOGIN_PASSWORD_CHANGE', 'First-login password change'
        PASSWORD_RESET_REQUEST = 'PASSWORD_RESET_REQUEST', 'Password reset requested'
        PASSWORD_RESET_CONFIRM = 'PASSWORD_RESET_CONFIRM', 'Password reset confirmed'
        ADMIN_USER_IMPORT = 'ADMIN_USER_IMPORT', 'Admin user import (CSV/Excel)'
        ADMIN_ACTION = 'ADMIN_ACTION', 'Admin action'
        USER_CREATED = 'USER_CREATED', 'User created'
        USER_UPDATED = 'USER_UPDATED', 'User updated'
        PASSWORD_CHANGE = 'PASSWORD_CHANGE', 'Password change (settings)'
        ADMIN_PASSWORD_RESET = 'ADMIN_PASSWORD_RESET', 'Admin password reset'
        ADMIN_ACTIVATE_DEACTIVATE = 'ADMIN_ACTIVATE_DEACTIVATE', 'Admin activate/deactivate user'
        EMAIL_UPDATED = 'EMAIL_UPDATED', 'Email updated (settings)'
        RESULT_UPLOAD_STARTED = 'RESULT_UPLOAD_STARTED', 'Result upload started'
        RESULT_UPLOAD_COMPLETED = 'RESULT_UPLOAD_COMPLETED', 'Result upload completed'
        RESULT_BATCH_APPROVED = 'RESULT_BATCH_APPROVED', 'Course batch approved by HOD'
        RESULT_BATCH_REJECTED = 'RESULT_BATCH_REJECTED', 'Course batch rejected'
        RESULT_BATCH_UNAPPROVED = 'RESULT_BATCH_UNAPPROVED', 'Batch unapproved (reverted to draft)'
        RESULT_BATCH_REOPENED = 'RESULT_BATCH_REOPENED', 'Rejected batch re-opened for approval'
        RESULT_SINGLE_APPROVED = 'RESULT_SINGLE_APPROVED', 'Single result approved'
        RESULT_SINGLE_REJECTED = 'RESULT_SINGLE_REJECTED', 'Single result rejected'
        RESULT_CREATED = 'RESULT_CREATED', 'Result created'
        RESULT_UPDATED = 'RESULT_UPDATED', 'Result updated'
        RESULT_DELETED = 'RESULT_DELETED', 'Result deleted'
        RESULT_MANUAL_ENTRY = 'RESULT_MANUAL_ENTRY', 'Manual result entry'
        RESULT_IMPORT_REPORT_DOWNLOAD = 'RESULT_IMPORT_REPORT_DOWNLOAD', 'Import report downloaded'
        AUDIT_LOG_DELETED = 'AUDIT_LOG_DELETED', 'Audit log deleted (archived)'
        LOCKED_PUBLISHED = 'LOCKED_PUBLISHED', 'Result locked and published'
        EMERGENCY_UNLOCK = 'EMERGENCY_UNLOCK', 'Emergency unlock by SuperAdmin'
        COURSE_CREATED = 'COURSE_CREATED', 'Course created'
        COURSE_UPDATED = 'COURSE_UPDATED', 'Course updated'
        COURSE_DELETED = 'COURSE_DELETED', 'Course deleted'
        COURSE_ASSIGNMENT_CREATED = 'COURSE_ASSIGNMENT_CREATED', 'Course assignment created'
        COURSE_ASSIGNMENT_UPDATED = 'COURSE_ASSIGNMENT_UPDATED', 'Course assignments updated'
        COURSE_ASSIGNMENT_DELETED = 'COURSE_ASSIGNMENT_DELETED', 'Course assignment deleted'

    user = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='audit_logs',
        help_text='User who performed the action (null for failed login or reset request)'
    )
    action = models.CharField(max_length=50, choices=Action.choices, db_index=True)
    actor_role = models.CharField(
        max_length=30,
        blank=True,
        help_text='Role of the actor at time of action (SUPER_ADMIN, FACULTY_ADMIN, etc.)',
    )
    identifier = models.CharField(
        max_length=255,
        blank=True,
        help_text='Reg number/email used for login or reset (for failed login or no user)'
    )
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=500, blank=True)
    scope_faculty = models.ForeignKey(
        'academics.Faculty',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='audit_logs',
        help_text='Faculty scope of the action (if applicable)',
    )
    scope_department = models.ForeignKey(
        'academics.Department',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='audit_logs',
        help_text='Department scope of the action (if applicable)',
    )
    extra = models.JSONField(default=dict, blank=True, help_text='Extra context / meta (e.g. count imported)')
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = 'audit_logs'
        ordering = ['-created_at']
        verbose_name = 'Audit log'
        verbose_name_plural = 'Audit logs'

    def save(self, *args, **kwargs):
        """
        Append-only immutability for audit logs.
        Once created, audit logs must never be modified.
        """
        if self.pk is not None and AuditLog.objects.filter(pk=self.pk).exists():
            raise RuntimeError('Audit logs are append-only; updates are not allowed.')
        super().save(*args, **kwargs)


class AuditLogDeletion(models.Model):
    """
    Archive for deleted audit log entries. When SUPER_ADMIN "deletes" a log,
    the row is moved here and a deletion entry is written to AuditLog.
    """
    original_id = models.PositiveIntegerField(help_text='Original audit_log id')
    user_id = models.PositiveIntegerField(null=True, blank=True)
    action = models.CharField(max_length=50, db_index=True)
    identifier = models.CharField(max_length=255, blank=True)
    actor_role = models.CharField(max_length=30, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=500, blank=True)
    scope_faculty_id = models.PositiveIntegerField(null=True, blank=True)
    scope_department_id = models.PositiveIntegerField(null=True, blank=True)
    extra = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(db_index=True)
    archived_at = models.DateTimeField(auto_now_add=True)
    archived_by_id = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        db_table = 'audit_log_deletions'
        ordering = ['-archived_at']
        verbose_name = 'Audit log deletion (archive)'
        verbose_name_plural = 'Audit log deletions (archive)'


class StaffInvitation(models.Model):
    """Super Admin staff invitation — Dean, HOD, Lecturer onboarding via email link."""

    class Status(models.TextChoices):
        PENDING = 'PENDING', 'Pending'
        SENT = 'SENT', 'Sent'
        ACCEPTED = 'ACCEPTED', 'Accepted'
        EXPIRED = 'EXPIRED', 'Expired'
        REVOKED = 'REVOKED', 'Revoked'
        FAILED = 'FAILED', 'Delivery failed'

    class DeliveryStatus(models.TextChoices):
        QUEUED = 'QUEUED', 'Queued'
        SENT = 'SENT', 'Sent to inbox'
        FAILED = 'FAILED', 'Failed'

    email = models.EmailField(db_index=True)
    student_id = models.CharField(
        max_length=20,
        null=True,
        blank=True,
        db_index=True,
        validators=[validate_student_id_format],
        help_text='Matric number for student invitations',
    )
    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=150)
    role = models.CharField(max_length=30, choices=UserRole.choices)
    faculty = models.ForeignKey(
        'academics.Faculty', on_delete=models.SET_NULL, null=True, blank=True, related_name='staff_invitations'
    )
    department = models.ForeignKey(
        'academics.Department', on_delete=models.SET_NULL, null=True, blank=True, related_name='staff_invitations'
    )
    token = models.CharField(max_length=64, unique=True, db_index=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True)
    delivery_status = models.CharField(
        max_length=20, choices=DeliveryStatus.choices, default=DeliveryStatus.QUEUED
    )
    delivery_error = models.CharField(max_length=500, blank=True)
    send_count = models.PositiveIntegerField(default=0)
    invited_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name='sent_invitations'
    )
    user = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name='staff_invitation'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(db_index=True)
    last_sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'staff_invitations'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['email', 'status']),
            models.Index(fields=['role', 'status']),
        ]

    def __str__(self) -> str:
        return f'{self.email} ({self.role}) — {self.status}'

    @property
    def is_expired(self) -> bool:
        from django.utils import timezone
        return timezone.now() > self.expires_at

    @property
    def is_pending_acceptance(self) -> bool:
        return (
            self.status in (self.Status.PENDING, self.Status.SENT, self.Status.FAILED)
            and not self.is_expired
            and self.status != self.Status.REVOKED
        )


class UsersAccountsHub(AuditLog):
    """
    Proxy model for admin sidebar only. No table; same table as AuditLog.
    Registered in admin with a ModelAdmin that redirects changelist to the
    Users / Accounts hub page (/admin/users-accounts/). Ensures "Users / Accounts"
    appears under Accounts in the sidebar on every admin page.
    """
    class Meta:
        proxy = True
        verbose_name = 'Users / Accounts'
        verbose_name_plural = 'Users / Accounts'
