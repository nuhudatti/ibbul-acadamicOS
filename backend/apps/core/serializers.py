"""
Academic Core serializers.

These are the canonical, read-only representations of academic identity and
structure that all modules (Results, Learning) MUST use when they need to
expose Faculty / Department / Course / User / Session data to the frontend.

No module should define its own Faculty / Department / Course serializer.
Import from here instead.
"""
from rest_framework import serializers
from apps.academics.models import Faculty, Department, Course, CourseAssignment
from apps.accounts.models import User
from .models import AcademicSession, StudentCourseRegistration


# ─── Academic Structure ────────────────────────────────────────────────────────

class FacultySerializer(serializers.ModelSerializer):
    department_count = serializers.IntegerField(
        source='departments.count', read_only=True
    )

    class Meta:
        model = Faculty
        fields = ['id', 'code', 'name', 'is_active', 'department_count']


class FacultyWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Faculty
        fields = ['id', 'code', 'name', 'is_active']

    def validate_code(self, value):
        code = (value or '').strip().upper()
        if not code:
            raise serializers.ValidationError('Faculty code is required.')
        if len(code) > 20:
            raise serializers.ValidationError('Faculty code must be 20 characters or fewer.')
        return code

    def validate_name(self, value):
        name = (value or '').strip()
        if not name:
            raise serializers.ValidationError('Faculty name is required.')
        return name


class DepartmentWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = ['id', 'code', 'name', 'faculty', 'is_active']

    def validate_code(self, value):
        code = (value or '').strip().upper()
        if not code:
            raise serializers.ValidationError('Department code is required.')
        return code

    def validate_name(self, value):
        name = (value or '').strip()
        if not name:
            raise serializers.ValidationError('Department name is required.')
        return name

    def validate(self, attrs):
        faculty = attrs.get('faculty') or getattr(self.instance, 'faculty', None)
        code = attrs.get('code') or getattr(self.instance, 'code', None)
        if faculty and code:
            qs = Department.objects.filter(faculty=faculty, code__iexact=code)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError({
                    'code': f'Department code "{code}" already exists in this faculty.',
                })
        return attrs


class DepartmentSerializer(serializers.ModelSerializer):
    faculty_name = serializers.CharField(source='faculty.name', read_only=True)
    faculty_code = serializers.CharField(source='faculty.code', read_only=True)
    course_count = serializers.IntegerField(
        source='courses.count', read_only=True
    )

    class Meta:
        model = Department
        fields = [
            'id', 'code', 'name', 'is_active',
            'faculty', 'faculty_name', 'faculty_code',
            'course_count',
        ]


class CourseSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(
        source='department.name', read_only=True
    )
    faculty_name = serializers.CharField(
        source='department.faculty.name', read_only=True
    )

    class Meta:
        model = Course
        fields = [
            'id', 'code', 'title', 'credit_units', 'semester', 'level',
            'is_active', 'department', 'department_name', 'faculty_name',
        ]


class CourseWriteSerializer(serializers.ModelSerializer):
    """Create/update course — department set by view for HOD scope."""

    class Meta:
        model = Course
        fields = ['code', 'title', 'credit_units', 'semester', 'level', 'department', 'is_active']

    def validate_code(self, value):
        code = (value or '').strip().upper()
        if not code:
            raise serializers.ValidationError('Course code is required.')
        return code

    def validate_title(self, value):
        title = (value or '').strip()
        if not title:
            raise serializers.ValidationError('Course title is required.')
        return title


class CourseBulkRowSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=20)
    title = serializers.CharField(max_length=200)
    level = serializers.ChoiceField(choices=['100', '200', '300', '400'])
    semester = serializers.ChoiceField(choices=['FIRST', 'SECOND'])
    credit_units = serializers.IntegerField(min_value=1, max_value=6, required=False, default=3)
    examiner_id = serializers.IntegerField(required=False, allow_null=True)


# ─── Users (identity layer — readonly) ────────────────────────────────────────

class CoreUserSerializer(serializers.ModelSerializer):
    """
    Minimal read-only user representation for Academic Core consumers.
    Exposes identity fields only — no auth internals.
    """
    full_name = serializers.SerializerMethodField()
    department_name = serializers.SerializerMethodField()
    faculty_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'student_id', 'first_name', 'last_name', 'full_name',
            'email', 'role', 'level', 'department', 'department_name',
            'faculty_name', 'is_active',
        ]
        read_only_fields = fields

    def get_full_name(self, obj):
        return obj.get_full_name()

    def get_department_name(self, obj):
        if obj.department_fk:
            return obj.department_fk.name
        return obj.department or ''

    def get_faculty_name(self, obj):
        if obj.faculty:
            return obj.faculty.name
        return ''


# ─── Academic Session ──────────────────────────────────────────────────────────

class AcademicSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = AcademicSession
        fields = [
            'id', 'name', 'is_current', 'start_date', 'end_date',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


# ─── Student Course Registration ───────────────────────────────────────────────

class StudentCourseRegistrationSerializer(serializers.ModelSerializer):
    student_id = serializers.CharField(source='student.student_id', read_only=True)
    student_name = serializers.SerializerMethodField()
    course_code = serializers.CharField(source='course.code', read_only=True)
    course_title = serializers.CharField(source='course.title', read_only=True)
    credit_units = serializers.IntegerField(source='course.credit_units', read_only=True)
    session_name = serializers.CharField(source='session.name', read_only=True)

    class Meta:
        model = StudentCourseRegistration
        fields = [
            'id', 'student', 'student_id', 'student_name',
            'course', 'course_code', 'course_title', 'credit_units',
            'session', 'session_name', 'semester', 'status',
            'registered_at', 'updated_at',
        ]
        read_only_fields = ['registered_at', 'updated_at']

    def get_student_name(self, obj):
        return obj.student.get_full_name()


class StudentRegistrationWriteSerializer(serializers.ModelSerializer):
    """Used when bulk-creating registrations (admin/HOD import)."""

    class Meta:
        model = StudentCourseRegistration
        fields = ['student', 'course', 'session', 'semester', 'status']

    def validate(self, data):
        student = data.get('student')
        if student and student.role != 'STUDENT':
            raise serializers.ValidationError(
                {'student': 'Only users with role STUDENT can be registered for courses.'}
            )
        return data


# ─── Academic Structure Tree ──────────────────────────────────────────────────

class CourseInDeptSerializer(serializers.ModelSerializer):
    class Meta:
        model = Course
        fields = ['id', 'code', 'title', 'credit_units', 'semester', 'level', 'is_active']


class DeptWithCoursesSerializer(serializers.ModelSerializer):
    courses = serializers.SerializerMethodField()

    class Meta:
        model = Department
        fields = ['id', 'code', 'name', 'is_active', 'courses']

    def get_courses(self, obj):
        owned = Course.objects.filter(department=obj, is_active=True)
        borrowed = Course.objects.filter(
            borrowed_by_departments__department=obj,
            is_active=True,
        ).exclude(department=obj)
        combined = list(owned) + [c for c in borrowed if c.id not in {o.id for o in owned}]
        combined.sort(key=lambda c: (c.level or '', c.code or ''))
        return CourseInDeptSerializer(combined, many=True).data


class AcademicTreeSerializer(serializers.ModelSerializer):
    """Full faculty → department → course tree for structure exploration."""
    departments = DeptWithCoursesSerializer(many=True, read_only=True)

    class Meta:
        model = Faculty
        fields = ['id', 'code', 'name', 'is_active', 'departments']


class PlatformBrandingSerializer(serializers.Serializer):
    """Public branding payload — matches frontend PlatformBrand shape."""
    platformName = serializers.CharField(max_length=160, required=False)
    platformShortName = serializers.CharField(max_length=40, required=False)
    tagline = serializers.CharField(max_length=160, required=False)
    footerText = serializers.CharField(required=False, allow_blank=True)
    primaryColor = serializers.CharField(max_length=7, required=False)
    accentColor = serializers.CharField(max_length=7, required=False)
    logoDataUrl = serializers.CharField(required=False, allow_blank=True)
    loginBackgroundDataUrl = serializers.CharField(required=False, allow_blank=True)
    dashboardBannerDataUrl = serializers.CharField(required=False, allow_blank=True)
    updatedAt = serializers.DateTimeField(read_only=True)

    def to_representation(self, instance):
        from .models import PlatformBranding
        pb: PlatformBranding = instance
        return {
            'platformName': pb.platform_name,
            'platformShortName': pb.platform_short_name,
            'tagline': pb.tagline,
            'footerText': pb.footer_text,
            'primaryColor': pb.primary_color,
            'accentColor': pb.accent_color,
            'logoDataUrl': pb.logo_data or '',
            'loginBackgroundDataUrl': pb.login_background_data or '',
            'dashboardBannerDataUrl': pb.dashboard_banner_data or '',
            'updatedAt': pb.updated_at.isoformat() if pb.updated_at else None,
        }

    def update(self, instance, validated_data):
        from django.conf import settings as dj_settings
        from common.storage.cloudinary_service import delete_by_url, normalize_media_value

        field_map = {
            'platformName': 'platform_name',
            'platformShortName': 'platform_short_name',
            'tagline': 'tagline',
            'footerText': 'footer_text',
            'primaryColor': 'primary_color',
            'accentColor': 'accent_color',
            'logoDataUrl': 'logo_data',
            'loginBackgroundDataUrl': 'login_background_data',
            'dashboardBannerDataUrl': 'dashboard_banner_data',
        }
        media_api_keys = {'logoDataUrl', 'loginBackgroundDataUrl', 'dashboardBannerDataUrl'}
        base_folder = getattr(dj_settings, 'CLOUDINARY_BRANDING_FOLDER', 'ibbul/branding')

        for api_key, model_key in field_map.items():
            if api_key not in validated_data:
                continue
            raw = validated_data[api_key] or ''
            if api_key in media_api_keys:
                old = getattr(instance, model_key, '') or ''
                subfolder = model_key.replace('_data', '').replace('_', '-')
                new_val = normalize_media_value(raw, folder=f'{base_folder}/{subfolder}')
                if old and old != new_val and old.startswith('https://'):
                    delete_by_url(old)
                setattr(instance, model_key, new_val)
            else:
                setattr(instance, model_key, raw)
        instance.save()
        return instance
