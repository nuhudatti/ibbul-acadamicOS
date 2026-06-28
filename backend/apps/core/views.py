"""
Academic Core API views.

Authoritative endpoints for:
  - Academic structure  (faculties, departments, courses, tree)
  - Academic sessions   (current session, session list)
  - Student course registrations (official enrollment)
  - Scoped user lists   (students and staff by department/faculty)

Both the Results Module and the Learning Module must call these endpoints
when they need structure or identity data.  They must NOT define their own
separate faculty/department/course endpoints.
"""
from django.db.models import Count, Q, Prefetch
from django.db.utils import IntegrityError
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.academics.models import Faculty, Department, Course, CourseAssignment
from apps.accounts.models import User, UserRole
from .models import AcademicSession, StudentCourseRegistration
from apps.accounts.audit import log_audit
from apps.accounts.models import AuditLog
from .serializers import (
    FacultySerializer,
    FacultyWriteSerializer,
    DepartmentSerializer,
    DepartmentWriteSerializer,
    CourseSerializer,
    CourseWriteSerializer,
    CourseBulkRowSerializer,
    CoreUserSerializer,
    AcademicSessionSerializer,
    StudentCourseRegistrationSerializer,
    StudentRegistrationWriteSerializer,
    AcademicTreeSerializer,
)
from apps.accounts.scope import get_hod_department_id
from .permissions import IsAdminOrHOD, IsStaffOrReadOnly, IsSuperAdmin, IsSuperOrFacultyAdmin


# ─── Helper: scope filter ─────────────────────────────────────────────────────

def _scope(user):
    """Return a dict describing the user's academic scope."""
    role = str(user.role) if user.role else ''
    department_id = (
        get_hod_department_id(user)
        if role in ('HOD', 'DEPARTMENT_ADMIN')
        else user.department_fk_id
    )
    return {
        'role': role,
        'department_id': department_id,
        'faculty_id': user.faculty_id,
        'is_super': role in ('SUPER_ADMIN',),
        'is_faculty': role in ('FACULTY_ADMIN',),
        'is_hod': role in ('HOD', 'DEPARTMENT_ADMIN'),
        'is_examiner': role == 'EXAMINER',
        'is_student': role == 'STUDENT',
    }


# ─── Structure endpoints ──────────────────────────────────────────────────────

class FacultyListCreateView(generics.ListCreateAPIView):
    """List active faculties; Super Admin may create new faculties."""
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return FacultyWriteSerializer
        return FacultySerializer

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsAuthenticated(), IsSuperAdmin()]
        return [IsAuthenticated()]

    def get_queryset(self):
        return Faculty.objects.filter(is_active=True).annotate(
            dept_count=Count('departments', filter=Q(departments__is_active=True))
        ).order_by('code')

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        faculty = serializer.save()
        log_audit(
            AuditLog.Action.ADMIN_ACTION,
            request=request,
            user=request.user,
            identifier=f'faculty:{faculty.code}',
            extra={'action': 'FACULTY_CREATED', 'faculty_id': faculty.id, 'name': faculty.name},
        )
        return Response(
            FacultySerializer(faculty).data,
            status=status.HTTP_201_CREATED,
        )


class DepartmentListCreateView(generics.ListCreateAPIView):
    """
    List departments, optionally filtered by faculty.
    Super Admin or Faculty Admin may create departments under their faculty.
    """
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return DepartmentWriteSerializer
        return DepartmentSerializer

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsAuthenticated(), IsSuperOrFacultyAdmin()]
        return [IsAuthenticated()]

    def get_queryset(self):
        sc = _scope(self.request.user)
        qs = Department.objects.filter(is_active=True).select_related('faculty')

        if sc['is_hod']:
            if sc['department_id']:
                qs = qs.filter(id=sc['department_id'])
        elif sc['is_faculty']:
            if sc['faculty_id']:
                qs = qs.filter(faculty_id=sc['faculty_id'])
        elif sc['is_examiner'] or sc['is_student']:
            if sc['department_id']:
                qs = qs.filter(id=sc['department_id'])

        faculty_id = self.request.query_params.get('faculty_id')
        if faculty_id:
            qs = qs.filter(faculty_id=faculty_id)

        return qs.order_by('faculty__code', 'code')

    def create(self, request, *args, **kwargs):
        # Faculty Admin can only create departments within their own faculty
        user = request.user
        if str(user.role) == 'FACULTY_ADMIN':
            requested_faculty = request.data.get('faculty')
            if not requested_faculty:
                return Response(
                    {'detail': 'faculty is required.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if int(requested_faculty) != (user.faculty_id or -1):
                return Response(
                    {'detail': 'You may only add departments to your own faculty.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        department = serializer.save()
        log_audit(
            AuditLog.Action.ADMIN_ACTION,
            request=request,
            user=request.user,
            identifier=f'department:{department.code}',
            extra={
                'action': 'DEPARTMENT_CREATED',
                'department_id': department.id,
                'faculty_id': department.faculty_id,
                'name': department.name,
            },
        )
        return Response(
            DepartmentSerializer(department).data,
            status=status.HTTP_201_CREATED,
        )


class CourseListView(generics.ListAPIView):
    """
    List courses. Optionally filter by department, level, semester.
    Scoped by user role.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = CourseSerializer

    def get_queryset(self):
        sc = _scope(self.request.user)
        qs = Course.objects.filter(is_active=True).select_related(
            'department', 'department__faculty'
        )

        if sc['is_hod']:
            if sc['department_id']:
                from apps.academics.models import DepartmentBorrowedCourse
                borrowed_ids = DepartmentBorrowedCourse.objects.filter(
                    department_id=sc['department_id']
                ).values_list('course_id', flat=True)
                qs = qs.filter(Q(department_id=sc['department_id']) | Q(id__in=borrowed_ids))
        elif sc['is_faculty']:
            if sc['faculty_id']:
                qs = qs.filter(department__faculty_id=sc['faculty_id'])

        # Examiners: only their assigned courses
        if sc['is_examiner']:
            from apps.academics.models import CourseAssignment
            assigned = CourseAssignment.objects.filter(
                examiner=self.request.user
            ).values_list('course_id', flat=True)
            qs = qs.filter(id__in=assigned)

        # Students: only courses at their level (if level set)
        if sc['is_student'] and self.request.user.level:
            qs = qs.filter(level=self.request.user.level)

        # Query param filters
        for param, field in [
            ('department_id', 'department_id'),
            ('faculty_id', 'department__faculty_id'),
            ('level', 'level'),
            ('semester', 'semester'),
        ]:
            val = self.request.query_params.get(param)
            if val:
                qs = qs.filter(**{field: val})

        return qs.order_by('level', 'code')


class CourseBulkCreateView(APIView):
    """
    HOD / Super Admin: create multiple courses in one request.
    POST /api/core/courses/bulk/
    Body: { "courses": [ { code, title, level, semester, credit_units?, examiner_id? }, ... ] }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        sc = _scope(request.user)
        role = sc['role']
        if role not in ('SUPER_ADMIN', 'HOD', 'DEPARTMENT_ADMIN'):
            return Response(
                {'detail': 'Only HOD or Super Admin can bulk-create courses.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        rows = request.data.get('courses') or []
        if not isinstance(rows, list) or not rows:
            return Response(
                {'detail': 'Provide a non-empty "courses" array.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        department_id = sc['department_id']
        if role == 'SUPER_ADMIN':
            department_id = request.data.get('department_id') or department_id
        if not department_id:
            return Response(
                {'detail': 'Department is required (set department_id for Super Admin).'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            department = Department.objects.get(pk=department_id, is_active=True)
        except Department.DoesNotExist:
            return Response({'detail': 'Department not found.'}, status=status.HTTP_400_BAD_REQUEST)

        created = []
        updated = []
        borrowed = []
        errors = []

        for i, row in enumerate(rows):
            ser = CourseBulkRowSerializer(data=row)
            if not ser.is_valid():
                errors.append({'index': i, 'errors': ser.errors})
                continue
            data = ser.validated_data
            code = data['code'].strip().upper()
            from apps.academics.services import get_course_for_upload, register_borrowed_course
            defaults = {
                'title': data['title'].strip(),
                'level': data['level'],
                'semester': data['semester'],
                'credit_units': data.get('credit_units') or 3,
                'department': department,
                'is_active': True,
            }
            existing = get_course_for_upload(code, department_id=None)
            if existing:
                owner_dept_id = getattr(existing, 'department_id', None)
                if owner_dept_id is not None and owner_dept_id != department.id:
                    register_borrowed_course(department.id, existing)
                    borrowed.append(CourseSerializer(existing).data)
                    course = existing
                else:
                    for key, val in defaults.items():
                        setattr(existing, key, val)
                    existing.save()
                    course = existing
                    updated.append(CourseSerializer(course).data)
            else:
                try:
                    course = Course.objects.create(code=code, **defaults)
                    created.append(CourseSerializer(course).data)
                except IntegrityError:
                    errors.append({
                        'index': i,
                        'errors': {'code': f'Course code "{code}" already exists in the catalogue.'},
                    })
                    continue

            examiner_id = data.get('examiner_id')
            if examiner_id:
                try:
                    examiner = User.objects.get(
                        pk=examiner_id,
                        role=UserRole.EXAMINER,
                        department_fk_id=department.id,
                        is_active=True,
                    )
                    CourseAssignment.objects.get_or_create(examiner=examiner, course=course)
                except User.DoesNotExist:
                    errors.append({
                        'index': i,
                        'errors': {'examiner_id': 'Lecturer not found in this department.'},
                    })

        log_audit(
            AuditLog.Action.ADMIN_ACTION,
            request=request,
            user=request.user,
            identifier=f'Bulk courses {department.code}',
            extra={
                'action': 'COURSES_BULK_CREATE',
                'department_id': department.id,
                'created_count': len(created),
                'updated_count': len(updated),
                'borrowed_count': len(borrowed),
            },
        )

        return Response({
            'created_count': len(created),
            'updated_count': len(updated),
            'borrowed_count': len(borrowed),
            'created': created,
            'updated': updated,
            'borrowed': borrowed,
            'errors': errors,
        }, status=status.HTTP_201_CREATED if created or updated or borrowed else status.HTTP_400_BAD_REQUEST)


class CourseDeleteView(APIView):
    """
    Permanently delete a course and all linked records (results, assignments, LMS offerings).
    DELETE /api/core/courses/<pk>/
    HOD: own department only. Super Admin: any course.
    """
    permission_classes = [IsAuthenticated, IsAdminOrHOD]

    def delete(self, request, pk):
        sc = _scope(request.user)
        role = sc['role']

        try:
            course = Course.objects.get(pk=pk)
        except Course.DoesNotExist:
            return Response({'detail': 'Course not found.'}, status=status.HTTP_404_NOT_FOUND)

        if role != 'SUPER_ADMIN':
            if role not in ('HOD', 'DEPARTMENT_ADMIN'):
                return Response({'detail': 'Not allowed.'}, status=status.HTTP_403_FORBIDDEN)
            dept_id = sc.get('department_id')
            if not dept_id:
                return Response({'detail': 'Department not set.'}, status=status.HTTP_403_FORBIDDEN)
            if course.department_id != dept_id:
                from apps.academics.models import DepartmentBorrowedCourse
                link = DepartmentBorrowedCourse.objects.filter(
                    department_id=dept_id,
                    course=course,
                ).first()
                if link:
                    code = course.code
                    link.delete()
                    log_audit(
                        AuditLog.Action.ADMIN_ACTION,
                        request=request,
                        user=request.user,
                        identifier=f'Borrowed course removed {code}',
                        extra={'action': 'BORROWED_COURSE_REMOVED', 'course_code': code},
                    )
                    return Response({
                        'message': f'Removed borrowed course "{code}" from your department.',
                        'removed_borrowed': True,
                    }, status=status.HTTP_200_OK)
                return Response(
                    {'detail': 'Course is not in your department.'},
                    status=status.HTTP_403_FORBIDDEN,
                )

        result_count = course.results.count()
        assignment_count = course.examiner_assignments.count()
        offering_count = getattr(course, 'lms_offerings', None)
        offering_count = offering_count.count() if offering_count is not None else 0
        batch_count = course.course_batches.count()
        code = course.code

        course.delete()

        log_audit(
            AuditLog.Action.ADMIN_ACTION,
            request=request,
            user=request.user,
            identifier=f'Course deleted {code}',
            extra={
                'action': 'COURSE_DELETED',
                'course_code': code,
                'deleted_results': result_count,
                'deleted_assignments': assignment_count,
                'deleted_offerings': offering_count,
                'deleted_batches': batch_count,
            },
        )

        return Response({
            'message': f'Course "{code}" deleted permanently.',
            'deleted_results': result_count,
            'deleted_assignments': assignment_count,
            'deleted_offerings': offering_count,
            'deleted_batches': batch_count,
        }, status=status.HTTP_200_OK)


class AcademicTreeView(APIView):
    """
    Return the full Faculty → Department → Course tree.
    Used by admin and structure browsing.
    Staff only (students see their scoped courses via CourseListView).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        sc = _scope(request.user)
        faculties = Faculty.objects.filter(is_active=True).prefetch_related(
            Prefetch(
                'departments',
                queryset=Department.objects.filter(is_active=True).prefetch_related(
                    Prefetch('courses', queryset=Course.objects.filter(is_active=True))
                )
            )
        )
        if sc['is_faculty'] and sc['faculty_id']:
            faculties = faculties.filter(id=sc['faculty_id'])
        elif sc['is_hod'] and sc['department_id']:
            faculties = faculties.filter(departments__id=sc['department_id'])

        serializer = AcademicTreeSerializer(faculties, many=True)
        return Response(serializer.data)


# ─── Academic Sessions ────────────────────────────────────────────────────────

class SessionListView(generics.ListCreateAPIView):
    """
    GET  — list all academic sessions (any authenticated user)
    POST — create a new session (admin/HOD only)
    """
    permission_classes = [IsAuthenticated, IsAdminOrHOD]
    serializer_class = AcademicSessionSerializer

    def get_queryset(self):
        return AcademicSession.objects.all().order_by('-name')


class SessionDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated, IsAdminOrHOD]
    serializer_class = AcademicSessionSerializer
    queryset = AcademicSession.objects.all()


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def current_session(request):
    """Return the current active academic session."""
    session = AcademicSession.get_current()
    if not session:
        return Response({
            'name': None,
            'is_current': False,
            'detail': 'No current session configured.',
        })
    return Response(AcademicSessionSerializer(session).data)


# ─── Student Course Registrations ─────────────────────────────────────────────

class StudentRegistrationListView(generics.ListCreateAPIView):
    """
    GET  — list student course registrations (scoped by role)
    POST — register a student for a course (admin/HOD)
    """
    permission_classes = [IsAuthenticated, IsAdminOrHOD]

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return StudentRegistrationWriteSerializer
        return StudentCourseRegistrationSerializer

    def get_queryset(self):
        sc = _scope(self.request.user)
        qs = StudentCourseRegistration.objects.select_related(
            'student', 'course', 'session'
        )

        # Scope
        if sc['is_hod'] and sc['department_id']:
            qs = qs.filter(course__department_id=sc['department_id'])
        elif sc['is_faculty'] and sc['faculty_id']:
            qs = qs.filter(course__department__faculty_id=sc['faculty_id'])

        # Filters
        student_id = self.request.query_params.get('student_id')
        if student_id:
            qs = qs.filter(student__student_id=student_id)

        session_id = self.request.query_params.get('session_id')
        if session_id:
            qs = qs.filter(session_id=session_id)

        semester = self.request.query_params.get('semester')
        if semester:
            qs = qs.filter(semester=semester.upper())

        course_id = self.request.query_params.get('course_id')
        if course_id:
            qs = qs.filter(course_id=course_id)

        return qs.order_by('-session__name', 'student__student_id')


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_registrations(request):
    """
    Return the authenticated student's course registrations.
    Non-students get an empty list.
    """
    if str(request.user.role) != 'STUDENT':
        return Response([])

    registrations = StudentCourseRegistration.objects.filter(
        student=request.user,
        status='registered',
    ).select_related('course', 'session').order_by('-session__name', 'semester')

    # If no official registrations exist yet, fall back to Result-based courses
    # so students always see something useful.
    if not registrations.exists():
        from apps.academics.models import Result
        results = Result.objects.filter(
            student=request.user
        ).select_related('course', 'course__department').order_by('-session', 'semester')

        data = []
        seen = set()
        for r in results:
            key = (r.course_id, r.session, r.semester)
            if key not in seen:
                seen.add(key)
                data.append({
                    'id': None,
                    'student': request.user.id,
                    'student_id': request.user.student_id,
                    'student_name': request.user.get_full_name(),
                    'course': r.course_id,
                    'course_code': r.course.code,
                    'course_title': r.course.title,
                    'credit_units': r.course.credit_units,
                    'session': None,
                    'session_name': r.session or '',
                    'semester': r.semester or '',
                    'status': 'registered',
                    'registered_at': None,
                    'updated_at': None,
                    'source': 'result_fallback',
                })
        return Response(data)

    serializer = StudentCourseRegistrationSerializer(registrations, many=True)
    return Response(serializer.data)


# ─── Scoped User Lists ────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def scoped_students(request):
    """
    Return students scoped to the caller's department/faculty.
    Used by Results and Learning modules to populate dropdowns.
    """
    sc = _scope(request.user)

    if sc['is_student']:
        return Response({'detail': 'Not permitted.'}, status=403)

    qs = User.objects.filter(role='STUDENT', is_active=True)

    if sc['is_hod'] and sc['department_id']:
        qs = qs.filter(department_fk_id=sc['department_id'])
    elif sc['is_faculty'] and sc['faculty_id']:
        qs = qs.filter(faculty_id=sc['faculty_id'])

    # Optional filters
    level = request.query_params.get('level')
    if level:
        qs = qs.filter(level=level)
    dept_id = request.query_params.get('department_id')
    if dept_id:
        qs = qs.filter(department_fk_id=dept_id)

    serializer = CoreUserSerializer(qs.order_by('student_id'), many=True)
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def scoped_staff(request):
    """
    Return staff (examiners, HODs, faculty admins) scoped to the caller's area.
    Used for assignment dropdowns.
    """
    sc = _scope(request.user)
    if sc['is_student'] or sc['is_examiner']:
        return Response({'detail': 'Not permitted.'}, status=403)

    qs = User.objects.filter(
        is_staff=True, is_active=True
    ).exclude(role='STUDENT')

    if sc['is_hod'] and sc['department_id']:
        qs = qs.filter(department_fk_id=sc['department_id'])
    elif sc['is_faculty'] and sc['faculty_id']:
        qs = qs.filter(
            Q(faculty_id=sc['faculty_id'])
            | Q(department_fk__faculty_id=sc['faculty_id'])
        )

    serializer = CoreUserSerializer(qs.order_by('role', 'last_name'), many=True)
    return Response(serializer.data)


# ─── Health / summary ─────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def core_summary(request):
    """
    Return a snapshot of the academic core for the current user's context.
    Used by the frontend dashboard loader to seed initial state.
    """
    sc = _scope(request.user)
    user = request.user

    session = AcademicSession.get_current()

    # Counts scoped to caller
    faculty_qs = Faculty.objects.filter(is_active=True)
    dept_qs = Department.objects.filter(is_active=True)
    course_qs = Course.objects.filter(is_active=True)
    student_qs = User.objects.filter(role='STUDENT', is_active=True)

    if sc['is_hod'] and sc['department_id']:
        dept_qs = dept_qs.filter(id=sc['department_id'])
        course_qs = course_qs.filter(department_id=sc['department_id'])
        student_qs = student_qs.filter(department_fk_id=sc['department_id'])
        faculty_qs = faculty_qs.filter(departments__id=sc['department_id'])
    elif sc['is_faculty'] and sc['faculty_id']:
        faculty_qs = faculty_qs.filter(id=sc['faculty_id'])
        dept_qs = dept_qs.filter(faculty_id=sc['faculty_id'])
        course_qs = course_qs.filter(department__faculty_id=sc['faculty_id'])
        student_qs = student_qs.filter(
            Q(faculty_id=sc['faculty_id'])
            | Q(department_fk__faculty_id=sc['faculty_id'])
        )

    return Response({
        'current_session': AcademicSessionSerializer(session).data if session else None,
        'counts': {
            'faculties': faculty_qs.count(),
            'departments': dept_qs.count(),
            'courses': course_qs.count(),
            'students': student_qs.count(),
        },
        'scope': {
            'role': sc['role'],
            'department': user.department_fk.name if user.department_fk else None,
            'faculty': user.faculty.name if user.faculty else None,
        },
    })


@api_view(['GET', 'PUT', 'PATCH'])
@permission_classes([IsAuthenticated])
def platform_branding(request):
    """
    GET — public branding for login UI and emails (any authenticated user; AllowAny on GET below).
    PUT/PATCH — Super Admin only.
    """
    from .models import PlatformBranding
    from .serializers import PlatformBrandingSerializer

    pb = PlatformBranding.load()

    if request.method == 'GET':
        return Response(PlatformBrandingSerializer(pb).data)

    if not IsSuperAdmin().has_permission(request, None):
        return Response({'error': 'Only Super Admin can update platform branding.'}, status=status.HTTP_403_FORBIDDEN)

    ser = PlatformBrandingSerializer(pb, data=request.data, partial=(request.method == 'PATCH'))
    ser.is_valid(raise_exception=True)
    ser.save()
    log_audit(
        AuditLog.Action.ADMIN_ACTION,
        request=request,
        user=request.user,
        identifier='Platform branding updated',
        extra={'action': 'PLATFORM_BRANDING_UPDATE'},
    )
    return Response(PlatformBrandingSerializer(pb).data)


@api_view(['GET'])
@permission_classes([AllowAny])
def platform_branding_public(request):
    """Unauthenticated branding for auth pages (login, forgot password)."""
    from .models import PlatformBranding
    from .serializers import PlatformBrandingSerializer
    pb = PlatformBranding.load()
    return Response(PlatformBrandingSerializer(pb).data)


@api_view(['POST'])
@parser_classes([MultiPartParser, FormParser])
@permission_classes([IsAuthenticated])
def platform_branding_upload(request):
    """
    Upload branding image to Cloudinary.
    POST multipart: file, type=logo|background|banner
    """
    from django.conf import settings as dj_settings
    from common.storage.cloudinary_service import is_configured, upload_file

    if not IsSuperAdmin().has_permission(request, None):
        return Response({'error': 'Only Super Admin can upload branding.'}, status=status.HTTP_403_FORBIDDEN)
    if not is_configured():
        return Response(
            {'error': 'Cloudinary is not configured. Set CLOUDINARY_* in .env'},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    upload = request.FILES.get('file')
    if not upload:
        return Response({'error': 'No file provided.'}, status=status.HTTP_400_BAD_REQUEST)

    asset_type = (request.data.get('type') or 'logo').strip().lower()
    if asset_type not in ('logo', 'background', 'banner'):
        return Response({'error': 'type must be logo, background, or banner.'}, status=status.HTTP_400_BAD_REQUEST)

    base = getattr(dj_settings, 'CLOUDINARY_BRANDING_FOLDER', 'ibbul/branding')
    folder = f'{base}/{asset_type}'
    try:
        url, public_id = upload_file(
            upload,
            folder=folder,
            filename=upload.name,
        )
    except Exception as exc:
        return Response({'error': str(exc)[:300]}, status=status.HTTP_502_BAD_GATEWAY)

    return Response({'url': url, 'publicId': public_id})
