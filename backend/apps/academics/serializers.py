"""
Serializers for academic models
"""
from rest_framework import serializers
from .models import Course, Result, GPA, SemesterSummary, ResultUploadBatch
from apps.accounts.serializers import UserSerializer


class CourseSerializer(serializers.ModelSerializer):
    """Serializer for Course model"""
    
    class Meta:
        model = Course
        fields = [
            'id', 'code', 'title', 'credit_units', 
            'semester', 'level', 'is_active',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class ResultSerializer(serializers.ModelSerializer):
    """Serializer for Result model - Enhanced for HOD module. All nested/source fields defensive for 500s."""
    student_info = UserSerializer(source='student', read_only=True)
    course_info = CourseSerializer(source='course', read_only=True)
    uploaded_by_info = UserSerializer(source='uploaded_by', read_only=True)
    approved_by_info = UserSerializer(source='approved_by', read_only=True)
    locked_by_info = UserSerializer(source='locked_by', read_only=True)
    department_name = serializers.SerializerMethodField()
    course_units = serializers.SerializerMethodField()
    course_code = serializers.SerializerMethodField()
    course_title = serializers.SerializerMethodField()
    credit_units = serializers.SerializerMethodField()
    batch_display = serializers.SerializerMethodField()

    def get_course_code(self, obj):
        try:
            if getattr(obj, 'course', None):
                return obj.course.code
        except Exception:
            pass
        return None

    def get_course_title(self, obj):
        try:
            if getattr(obj, 'course', None):
                return obj.course.title
        except Exception:
            pass
        return None

    def get_credit_units(self, obj):
        return self.get_course_units(obj)

    def get_department_name(self, obj):
        if obj is None or obj.department_id is None:
            return None
        try:
            return obj.department.name if obj.department else None
        except Exception:
            return None

    def get_course_units(self, obj):
        if obj is None:
            return None
        try:
            if getattr(obj, 'course', None) is None:
                return None
            cu = getattr(obj.course, 'credit_units', None)
            return int(cu) if cu is not None else None
        except (TypeError, ValueError):
            return None

    def get_batch_display(self, obj):
        if obj is None:
            return None
        batch = getattr(obj, 'upload_batch', None)
        if batch is None:
            return None
        bid = getattr(batch, 'id', None)
        if bid is None:
            return None
        status = getattr(batch, 'approval_status', None) or ''
        if status == 'APPROVED':
            return f'Batch #{bid} — ✓ Approved'
        if status == 'REJECTED':
            return f'Batch #{bid} — Rejected'
        return f'Batch #{bid} — Pending'

    def to_representation(self, instance):
        """Serialize score/grade_point as exact strings for 100% accuracy (no float rounding)."""
        data = super().to_representation(instance)
        if data is None:
            return data
        from decimal import Decimal
        if 'score' in data and data['score'] is not None:
            try:
                data['score'] = str(Decimal(str(instance.score)).normalize())
            except (TypeError, ValueError):
                data['score'] = str(instance.score)
        if 'grade_point' in data and data['grade_point'] is not None:
            try:
                data['grade_point'] = str(Decimal(str(instance.grade_point)).normalize())
            except (TypeError, ValueError):
                data['grade_point'] = str(instance.grade_point)
        return data

    class Meta:
        model = Result
        fields = [
            'id', 'student', 'student_info', 'course', 'course_info',
            'course_code', 'course_title', 'credit_units',
            'score', 'grade', 'grade_point', 'status', 'remark',
            'session', 'semester', 'course_units',
            'uploaded_by', 'uploaded_by_info',
            'approved_by', 'approved_by_info', 'approved_at',
            'locked_by', 'locked_by_info', 'locked_at',
            'department', 'department_name',
            'rejection_reason', 'faculty_reviewer_remark',
            'checksum', 'is_editable',
            'upload_batch', 'batch_display',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'grade', 'grade_point', 'uploaded_by',
            'approved_by', 'approved_at', 'locked_by', 'locked_at',
            'checksum', 'is_editable', 'created_at', 'updated_at'
        ]


class ResultUploadSerializer(serializers.ModelSerializer):
    """Serializer for uploading results (Examiner use)"""
    
    class Meta:
        model = Result
        fields = ['student', 'course', 'score', 'session', 'semester']
    
    def validate_score(self, value):
        """Ensure score is between 0 and 100"""
        if value < 0 or value > 100:
            raise serializers.ValidationError('Score must be between 0 and 100')
        return value


class ResultApprovalSerializer(serializers.Serializer):
    """Serializer for HOD to approve/reject results"""
    status = serializers.ChoiceField(choices=['APPROVED', 'REJECTED'])
    
    def validate_status(self, value):
        """Ensure only valid statuses are used"""
        if value not in ['APPROVED', 'REJECTED']:
            raise serializers.ValidationError('Status must be APPROVED or REJECTED')
        return value


class GPASerializer(serializers.ModelSerializer):
    """Serializer for GPA records. Decimals coerced for JSON safety."""
    student_info = UserSerializer(source='student', read_only=True)

    class Meta:
        model = GPA
        fields = [
            'id', 'student', 'student_info',
            'session', 'semester', 'gpa', 'cgpa',
            'total_credits', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if data is None:
            return data
        for field in ('gpa', 'cgpa'):
            if field in data and data[field] is not None:
                try:
                    data[field] = float(data[field])
                except (TypeError, ValueError):
                    data[field] = None
        return data


class CSVUploadSerializer(serializers.Serializer):
    """Serializer for CSV file upload"""
    file = serializers.FileField(required=True)
    session = serializers.CharField(required=True, max_length=20)
    semester = serializers.ChoiceField(
        choices=[('FIRST', 'First Semester'), ('SECOND', 'Second Semester')],
        required=True
    )


class ManualResultEntrySerializer(serializers.Serializer):
    """Serializer for manual result entry (single or bulk)"""
    student_id = serializers.CharField(required=False, max_length=50)
    course_code = serializers.CharField(required=False, max_length=20)
    score = serializers.DecimalField(
        required=False,
        max_digits=5,
        decimal_places=2,
        min_value=0,
        max_value=100
    )
    session = serializers.CharField(required=False, max_length=20)
    semester = serializers.ChoiceField(
        choices=[('FIRST', 'First Semester'), ('SECOND', 'Second Semester')],
        required=False
    )
    
    # For bulk entry
    results = serializers.ListField(
        child=serializers.DictField(),
        required=False
    )
    
    def validate(self, attrs):
        """Validate that either single entry or bulk entry is provided"""
        if 'results' in attrs:
            # Bulk entry - validate each result
            for result in attrs['results']:
                required_fields = ['student_id', 'course_code', 'score', 'session', 'semester']
                for field in required_fields:
                    if field not in result:
                        raise serializers.ValidationError(
                            f'Missing required field "{field}" in bulk entry'
                        )
        else:
            # Single entry - validate required fields
            required_fields = ['student_id', 'course_code', 'score', 'session', 'semester']
            for field in required_fields:
                if field not in attrs:
                    raise serializers.ValidationError(f'Missing required field: {field}')
        
        return attrs


class SemesterSummarySerializer(serializers.ModelSerializer):
    """Serializer for SemesterSummary model"""
    
    class Meta:
        model = SemesterSummary
        fields = [
            'id', 'student', 'session', 'semester',
            'le', 'nss', 'rcu', 'ecu', 'cp', 'gpa',
            'trcu', 'tecu', 'tcp', 'pcgpa', 'cgpa',
            'outstanding_courses', 'remarks', 'standing',
            'raw_summary', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class ResultSummarySerializer(serializers.Serializer):
    """Serializer for result summary response"""
    student = serializers.DictField()
    summary = serializers.DictField()


class UploadBatchListSerializer(serializers.ModelSerializer):
    """List view for result upload batches (scoped)."""
    uploaded_by_display = serializers.SerializerMethodField()
    department_name = serializers.SerializerMethodField()
    faculty_name = serializers.SerializerMethodField()
    approved_by_display = serializers.SerializerMethodField()
    is_pending_approval = serializers.SerializerMethodField()

    class Meta:
        model = ResultUploadBatch
        fields = [
            'id', 'filename', 'session', 'semester', 'status', 'approval_status',
            'success_count', 'error_count', 'created_at', 'completed_at',
            'uploaded_by', 'uploaded_by_display', 'department', 'department_name',
            'faculty', 'faculty_name', 'approved_by', 'approved_by_display',
            'approved_at', 'rejection_reason', 'is_pending_approval',
        ]
        read_only_fields = fields

    def get_uploaded_by_display(self, obj):
        if not obj.uploaded_by:
            return None
        return obj.uploaded_by.get_full_name() or obj.uploaded_by.email

    def get_department_name(self, obj):
        return obj.department.name if obj.department else None

    def get_faculty_name(self, obj):
        return obj.faculty.name if obj.faculty else None

    def get_approved_by_display(self, obj):
        return obj.approved_by.get_full_name() or (obj.approved_by.email if obj.approved_by else None) if obj.approved_by else None

    def get_is_pending_approval(self, obj):
        return getattr(obj, 'is_pending_approval', False)


class UploadBatchDetailSerializer(UploadBatchListSerializer):
    """Detail view: batch + all results in this batch."""
    results = ResultSerializer(many=True, read_only=True)

    class Meta(UploadBatchListSerializer.Meta):
        fields = UploadBatchListSerializer.Meta.fields + ['results']


class BatchRejectSerializer(serializers.Serializer):
    """Reason for rejecting a batch."""
    reason = serializers.CharField(required=False, allow_blank=True, max_length=2000)
