"""
HOD User Management API
Department-scoped user management: create/edit/deactivate lecturers/examiners
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Q
from django.utils import timezone
from django.db import transaction

from apps.accounts.models import User, UserRole
from apps.accounts.audit import log_audit
from apps.accounts.models import AuditLog
from apps.accounts.scope import is_super_admin, is_hod, get_hod_department_id
from apps.academics.models import CourseAssignment, Course
from apps.accounts.admin_views import _generate_temp_password
from apps.accounts.serializers import UserSerializer, _role_to_string
from rest_framework import serializers


class HODUserSerializer(serializers.ModelSerializer):
    """Serializer for HOD user list with assigned courses."""
    assigned_courses = serializers.SerializerMethodField()
    role = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'email', 'first_name', 'last_name', 'role', 'is_active',
            'last_login', 'date_joined', 'assigned_courses'
        ]
        read_only_fields = ['id', 'date_joined', 'last_login']

    def get_role(self, obj):
        """Normalize role to string."""
        return _role_to_string(obj.role)

    def get_assigned_courses(self, obj):
        """Get assigned courses for examiner."""
        if obj.role != UserRole.EXAMINER:
            return []
        assignments = CourseAssignment.objects.filter(examiner=obj).select_related('course')
        return [
            {'id': ca.course.id, 'code': ca.course.code, 'title': ca.course.title}
            for ca in assignments
        ]


class HODUserViewSet(viewsets.ModelViewSet):
    """
    HOD-scoped user management.
    Can only create/edit/deactivate departmental users (lecturers/examiners).
    Cannot create faculties, departments, or system-wide users.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = HODUserSerializer
    pagination_class = None  # We return { results, count, scope_info } from list() - no DRF pagination
    # CRITICAL: Do NOT set queryset = User.objects.all() here
    # Always use get_queryset() which enforces department filtering
    # Setting queryset = User.objects.none() ensures nothing is returned unless get_queryset() is called
    queryset = User.objects.none()

    def get_queryset(self):
        """
        Filter users by HOD's department scope. Each HOD sees ONLY users in their department.
        This is the PRIMARY filtering method - all other methods should use this.
        """
        user = self.request.user
        
        # Authentication and permission checks
        if not user.is_authenticated or not getattr(user, 'is_staff', False):
            return User.objects.none()
        
        if not is_hod(user) and not is_super_admin(user):
            return User.objects.none()

        # SUPER_ADMIN sees all examiners/lecturers (no department filter)
        if is_super_admin(user):
            return User.objects.filter(
                role=UserRole.EXAMINER
            ).select_related('department_fk').prefetch_related('course_assignments__course')
        
        # HOD: STRICT department filtering - ONLY users in HOD's department
        dept_id = get_hod_department_id(user)
        if dept_id is None:
            # HOD without department sees nothing
            return User.objects.none()
        
        # CRITICAL: Filter by department_fk_id - this is the core scope enforcement
        # Each HOD sees ONLY users where department_fk_id matches their department_fk_id
        qs = User.objects.filter(
            department_fk_id=dept_id,  # MUST match HOD's department
            role=UserRole.EXAMINER  # Only examiners/lecturers
        ).select_related('department_fk').prefetch_related('course_assignments__course')
        
        return qs

    def get_object(self):
        """
        Get a single user object. ENFORCES department scope - HOD can only access users in their department.
        """
        obj = super().get_object()
        user = self.request.user
        
        # For HOD, verify the object is in their department
        if is_hod(user) and not is_super_admin(user):
            hod_dept_id = get_hod_department_id(user)
            if hod_dept_id is not None and getattr(obj, 'department_fk_id', None) != hod_dept_id:
                from rest_framework.exceptions import NotFound
                raise NotFound('User not found in your department.')
        
        return obj

    def list(self, request, *args, **kwargs):
        """
        List users - ENTERPRISE SCOPE: HOD sees ONLY their department's users.
        Build queryset from scratch for HOD path so there is no possible bypass.
        """
        user = request.user
        
        # ----- ENTERPRISE: Build queryset from scratch by role -----
        # Do NOT use get_queryset() for list - build explicitly so scope cannot be bypassed
        raw_role = getattr(user, 'role', None)
        role_str = (getattr(raw_role, 'value', raw_role) or '')
        role_str = str(role_str).upper()
        
        # HOD / DEPARTMENT_ADMIN: STRICT department scope - build queryset from scratch
        if role_str in ('HOD', 'DEPARTMENT_ADMIN'):
            dept_id = getattr(user, 'department_fk_id', None) or (
                getattr(user.department_fk, 'pk', None) if getattr(user, 'department_fk', None) else None
            )
            if not dept_id:
                return Response({
                    'results': [],
                    'count': 0,
                    'error': 'HOD must have department_fk set. Django admin → Users → Your profile → Set Department (department_fk).',
                    'scope_info': {'department_id': None, 'note': 'No department assigned'}
                })
            
            # CRITICAL: Build queryset from scratch - ONLY users in this department
            queryset = User.objects.filter(
                department_fk_id=dept_id,
                role=UserRole.EXAMINER
            ).select_related('department_fk').prefetch_related('course_assignments__course')
            
            # Optional: search filter from query params
            search = request.query_params.get('search', '').strip()
            if search:
                from django.db.models import Q
                queryset = queryset.filter(
                    Q(email__icontains=search) | Q(first_name__icontains=search) | Q(last_name__icontains=search)
                )
            
            serializer = self.get_serializer(queryset, many=True)
            dept = getattr(user, 'department_fk', None)
            return Response({
                'results': serializer.data,
                'count': queryset.count(),
                'scope_info': {
                    'department_id': dept_id,
                    'department_name': getattr(dept, 'name', None) if dept else None,
                    'department_code': getattr(dept, 'code', None) if dept else None,
                    'note': 'Showing only users in your department (department-scoped)'
                }
            })
        
        # SUPER_ADMIN: sees all examiners/lecturers (no department filter)
        if role_str == 'SUPER_ADMIN':
            queryset = User.objects.filter(
                role=UserRole.EXAMINER
            ).select_related('department_fk').prefetch_related('course_assignments__course')
            search = request.query_params.get('search', '').strip()
            if search:
                from django.db.models import Q
                queryset = queryset.filter(
                    Q(email__icontains=search) | Q(first_name__icontains=search) | Q(last_name__icontains=search)
                )
            serializer = self.get_serializer(queryset, many=True)
            return Response({
                'results': serializer.data,
                'count': queryset.count(),
                'scope_info': {'note': 'Super Admin view - all department users'}
            })

        # FACULTY_ADMIN (Dean): faculty-scoped examiners
        if role_str == 'FACULTY_ADMIN':
            fac_id = getattr(user, 'faculty_id', None)
            if not fac_id:
                return Response({
                    'results': [],
                    'count': 0,
                    'error': 'Faculty Admin must have faculty set in profile.',
                    'scope_info': {'faculty_id': None},
                })
            queryset = User.objects.filter(
                role=UserRole.EXAMINER,
                department_fk__faculty_id=fac_id,
            ).select_related('department_fk').prefetch_related('course_assignments__course')
            search = request.query_params.get('search', '').strip()
            if search:
                from django.db.models import Q
                queryset = queryset.filter(
                    Q(email__icontains=search) | Q(first_name__icontains=search) | Q(last_name__icontains=search)
                )
            serializer = self.get_serializer(queryset, many=True)
            return Response({
                'results': serializer.data,
                'count': queryset.count(),
                'scope_info': {
                    'faculty_id': fac_id,
                    'note': 'Faculty-scoped examiners/lecturers',
                },
            })
        
        # Any other role: no access
        return Response({'results': [], 'count': 0, 'error': 'Only HOD, Faculty Admin, or Super Admin can list users.'})

    def create(self, request):
        """Create a new departmental user (lecturer/examiner). Only in HOD's department."""
        user = request.user
        if not user.is_authenticated or not getattr(user, 'is_staff', False):
            return Response({'error': 'Only HOD/Department Admin can create users'}, status=status.HTTP_403_FORBIDDEN)
        if not is_hod(user) and not is_super_admin(user):
            return Response({'error': 'Only HOD/Department Admin can create users'}, status=status.HTTP_403_FORBIDDEN)
        dept_id = get_hod_department_id(user)
        if not is_super_admin(user) and dept_id is None:
            return Response(
                {'error': 'HOD must be assigned to a department. Set Department (department_fk) in your profile.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        email = request.data.get('email', '').strip()
        first_name = request.data.get('first_name', '').strip()
        last_name = request.data.get('last_name', '').strip()
        role = request.data.get('role', '').strip()
        
        if not email or not first_name or not last_name:
            return Response(
                {'error': 'Email, first_name, and last_name are required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # API accepts EXAMINER or LECTURER; model has only EXAMINER (Examiner/Lecturer)
        if role not in (UserRole.EXAMINER, 'EXAMINER', 'LECTURER'):
            return Response(
                {'error': 'Role must be EXAMINER (lecturer)'},
                status=status.HTTP_400_BAD_REQUEST
            )
        role = UserRole.EXAMINER
        
        # Check if user already exists
        if User.objects.filter(email=email).exists():
            return Response(
                {'error': 'User with this email already exists'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        from apps.academics.models import Department
        dept = Department.objects.filter(pk=dept_id).first() if dept_id else getattr(user, 'department_fk', None)
        if not is_super_admin(user) and not dept:
            return Response(
                {'error': 'HOD must be assigned to a department.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        with transaction.atomic():
            temp_password = _generate_temp_password()
            new_user = User.objects.create_user(
                email=email,
                first_name=first_name,
                last_name=last_name,
                role=role,
                department_fk=dept,
                faculty=dept.faculty if dept else None,
                is_staff=True,
                is_first_login=True,
            )
            new_user.set_password(temp_password)
            new_user.save()

            log_audit(
                AuditLog.Action.USER_CREATED,
                request=request,
                user=user,
                identifier=f'Created user {email}',
                extra={
                    'created_user_id': new_user.id,
                    'created_user_email': email,
                    'role': role,
                    'department': dept.code if dept else '',
                }
            )
        
        return Response({
            'message': 'User created successfully',
            'user_id': new_user.id,
            'email': new_user.email,
            'temporary_password': temp_password,
            'note': 'User must change password on first login',
        }, status=status.HTTP_201_CREATED)

    def update(self, request, pk=None):
        """Update a departmental user."""
        target_user = self.get_object()
        user = request.user
        
        # Validate scope: HOD can only modify users in their department
        hod_dept_id = get_hod_department_id(user)
        if not is_super_admin(user) and getattr(target_user, 'department_fk_id', None) != hod_dept_id:
            return Response(
                {'error': 'Cannot modify users outside your department'},
                status=status.HTTP_403_FORBIDDEN
            )

        # Prevent changing role to non-departmental roles (EXAMINER only; API accepts LECTURER as alias)
        new_role = request.data.get('role', '').strip()
        if new_role and new_role not in (UserRole.EXAMINER, 'EXAMINER', 'LECTURER'):
            return Response(
                {'error': 'Cannot change role to non-departmental role'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Update fields
        if 'first_name' in request.data:
            target_user.first_name = request.data['first_name']
        if 'last_name' in request.data:
            target_user.last_name = request.data['last_name']
        if 'email' in request.data:
            target_user.email = request.data['email']
        if 'role' in request.data and new_role:
            target_user.role = new_role
        if 'is_active' in request.data:
            target_user.is_active = request.data['is_active']
        
        target_user.save()
        
        # Audit log
        log_audit(
            AuditLog.Action.USER_UPDATED,
            request=request,
            user=user,
            identifier=f'Updated user {target_user.email}',
            extra={
                'updated_user_id': target_user.id,
                'updated_fields': list(request.data.keys()),
            }
        )
        
        return Response({
            'message': 'User updated successfully',
            'user_id': target_user.id,
        })

    @action(detail=True, methods=['post'])
    def deactivate(self, request, pk=None):
        """Deactivate a departmental user."""
        target_user = self.get_object()
        user = request.user
        
        # Validate scope: HOD can only deactivate users in their department
        hod_dept_id = get_hod_department_id(user)
        if not is_super_admin(user) and getattr(target_user, 'department_fk_id', None) != hod_dept_id:
            return Response(
                {'error': 'Cannot deactivate users outside your department'},
                status=status.HTTP_403_FORBIDDEN
            )

        target_user.is_active = False
        target_user.save()
        
        # Audit log
        log_audit(
            AuditLog.Action.ADMIN_ACTIVATE_DEACTIVATE,
            request=request,
            user=user,
            identifier=f'Deactivated user {target_user.email}',
            extra={
                'deactivated_user_id': target_user.id,
            }
        )
        
        return Response({
            'message': 'User deactivated successfully',
        })

    @action(detail=True, methods=['post'])
    def assign_courses(self, request, pk=None):
        """Assign one or more courses to an examiner. Replaces existing assignments. Scope: HOD = department, Faculty Admin = faculty, Super Admin = all. Audited."""
        target_user = self.get_object()
        user = request.user

        if target_user.role != UserRole.EXAMINER:
            return Response(
                {'error': 'Can only assign courses to examiners (lecturers)'},
                status=status.HTTP_400_BAD_REQUEST
            )

        role_str = str(getattr(user, 'role', '') or '').upper()
        # HOD: only examiners and courses in their department
        hod_dept_id = get_hod_department_id(user)
        if role_str in ('HOD', 'DEPARTMENT_ADMIN'):
            if hod_dept_id is None:
                return Response(
                    {'error': 'HOD must be assigned to a department. Set Department (department_fk) in your profile.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            if getattr(target_user, 'department_fk_id', None) != hod_dept_id:
                return Response(
                    {'error': 'Cannot assign courses to users outside your department'},
                    status=status.HTTP_403_FORBIDDEN
                )
        # Faculty Admin: only examiners and courses in their faculty
        elif role_str == 'FACULTY_ADMIN':
            fac_id = getattr(user, 'faculty_id', None)
            if not fac_id:
                return Response(
                    {'error': 'Faculty Admin must be assigned to a faculty. Set Faculty in your profile.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            target_dept_id = getattr(target_user, 'department_fk_id', None)
            if target_dept_id is not None:
                from apps.academics.models import Department
                target_dept = Department.objects.filter(pk=target_dept_id).first()
                if not target_dept or target_dept.faculty_id != fac_id:
                    return Response(
                        {'error': 'Cannot assign courses to users outside your faculty'},
                        status=status.HTTP_403_FORBIDDEN
                    )
            # else examiner has no department_fk — still allow if super later; for Faculty Admin we allow
        # Super Admin: no extra scope check

        course_ids = request.data.get('course_ids', [])
        if not isinstance(course_ids, list):
            return Response(
                {'error': 'course_ids must be an array'},
                status=status.HTTP_400_BAD_REQUEST
            )

        courses = Course.objects.filter(id__in=course_ids).select_related('department')
        if not is_super_admin(user) and hod_dept_id is not None:
            invalid = courses.exclude(department_id=hod_dept_id)
            if invalid.exists():
                return Response(
                    {'error': 'Cannot assign courses outside your department'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        if role_str == 'FACULTY_ADMIN' and getattr(user, 'faculty_id', None):
            invalid = courses.exclude(department__faculty_id=user.faculty_id)
            if invalid.exists():
                return Response(
                    {'error': 'Cannot assign courses outside your faculty'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        with transaction.atomic():
            existing = list(
                CourseAssignment.objects.filter(examiner=target_user).values_list('course_id', flat=True)
            )
            existing_set = set(existing)
            new_ids = set(c.id for c in courses)
            to_remove = existing_set - new_ids
            to_add = new_ids - existing_set
            CourseAssignment.objects.filter(examiner=target_user, course_id__in=to_remove).delete()
            assigned_count = 0
            for course in courses:
                _, created = CourseAssignment.objects.get_or_create(
                    examiner=target_user,
                    course=course
                )
                if created:
                    assigned_count += 1
            added_codes = [c.code for c in courses if c.id in to_add]
            removed_codes = list(
                Course.objects.filter(id__in=to_remove).values_list('code', flat=True)
            ) if to_remove else []

        log_audit(
            AuditLog.Action.COURSE_ASSIGNMENT_UPDATED,
            request=request,
            user=user,
            identifier=f'Assignments for {target_user.email}',
            extra={
                'examiner_id': target_user.id,
                'examiner_email': target_user.email,
                'course_ids': list(new_ids),
                'assigned_count': len(new_ids),
                'added_codes': added_codes,
                'removed_codes': removed_codes,
            }
        )

        return Response({
            'message': f'{len(new_ids)} course(s) assigned successfully. Lecturer can view results for these courses only.',
            'assigned_count': len(new_ids),
            'added_codes': added_codes,
            'removed_codes': removed_codes,
        })

    @action(detail=True, methods=['get'])
    def login_history(self, request, pk=None):
        """Get login history for a user."""
        target_user = self.get_object()
        user = request.user
        
        # Validate scope: HOD can only view login history for users in their department
        hod_dept_id = get_hod_department_id(user)
        if not is_super_admin(user) and getattr(target_user, 'department_fk_id', None) != hod_dept_id:
            return Response(
                {'error': 'Cannot view login history for users outside your department'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Get audit logs for login events
        login_logs = AuditLog.objects.filter(
            user=target_user,
            action__in=(AuditLog.Action.LOGIN_SUCCESS, AuditLog.Action.LOGIN_FAILED)
        ).order_by('-created_at')[:50]
        
        history = []
        for log in login_logs:
            history.append({
                'action': log.action,
                'ip_address': log.ip_address,
                'user_agent': log.user_agent,
                'created_at': log.created_at.isoformat(),
            })
        
        return Response({
            'user_id': target_user.id,
            'last_login': target_user.last_login.isoformat() if target_user.last_login else None,
            'login_history': history,
        })

    @action(detail=False, methods=['get'])
    def export_csv(self, request):
        """Export department users as CSV."""
        user = request.user
        
        if not user.is_staff or user.role not in (UserRole.DEPARTMENT_ADMIN, UserRole.HOD, UserRole.SUPER_ADMIN):
            return Response(
                {'error': 'Only HOD/Department Admin can export users'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        users = self.get_queryset()
        
        # Generate CSV
        import csv
        from django.http import HttpResponse
        
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="department_users_{timezone.now().date()}.csv"'
        
        writer = csv.writer(response)
        writer.writerow(['Email', 'First Name', 'Last Name', 'Role', 'Is Active', 'Last Login', 'Date Joined'])
        
        for u in users:
            writer.writerow([
                u.email or '',
                u.first_name,
                u.last_name,
                u.role,
                'Yes' if u.is_active else 'No',
                u.last_login.isoformat() if u.last_login else '',
                u.date_joined.isoformat(),
            ])
        
        # Audit log
        log_audit(
            AuditLog.Action.RESULT_IMPORT_REPORT_DOWNLOAD,
            request=request,
            user=user,
            identifier='Exported department users CSV',
            extra={
                'export_type': 'users_csv',
                'user_count': users.count(),
            }
        )
        
        return response

    @action(detail=False, methods=['get'])
    def debug_info(self, request):
        """
        Debug endpoint: Show HOD's department and queryset info. Helps diagnose scope issues.
        GET /api/academics/hod/users/debug_info/
        """
        user = request.user
        if not is_hod(user) and not is_super_admin(user):
            return Response({'error': 'Only HOD/Super Admin can access debug info'}, status=status.HTTP_403_FORBIDDEN)
        
        dept_id = get_hod_department_id(user)
        dept = getattr(user, 'department_fk', None)
        
        # Get filtered queryset
        queryset = self.get_queryset()
        filtered_count = queryset.count()
        
        # Get ALL examiners/lecturers (for comparison)
        all_examiners = User.objects.filter(role=UserRole.EXAMINER)
        total_examiners = all_examiners.count()
        
        # Count users in HOD's department
        if dept_id:
            dept_users_count = User.objects.filter(
                department_fk_id=dept_id,
                role=UserRole.EXAMINER
            ).count()
        else:
            dept_users_count = 0
        
        # Sample users from queryset
        user_list = list(queryset.values('id', 'email', 'first_name', 'last_name', 'role', 'department_fk_id')[:10])
        
        # Sample users with wrong department (should be empty)
        wrong_dept_users = []
        if dept_id:
            wrong_dept = User.objects.filter(
                role=UserRole.EXAMINER
            ).exclude(department_fk_id=dept_id).values('id', 'email', 'department_fk_id')[:5]
            wrong_dept_users = list(wrong_dept)
        
        return Response({
            'user_email': user.email,
            'user_role': str(user.role),
            'is_hod': is_hod(user),
            'is_super_admin': is_super_admin(user),
            'user_department_fk_id': getattr(user, 'department_fk_id', None),
            'department_id_from_scope': dept_id,
            'department_name': dept.name if dept else None,
            'department_code': dept.code if dept else None,
            'queryset_count': filtered_count,
            'total_examiners_lecturers': total_examiners,
            'users_in_hod_department': dept_users_count,
            'sample_users_from_queryset': user_list,
            'sample_wrong_dept_users': wrong_dept_users,
            'diagnosis': {
                'hod_has_department': dept_id is not None,
                'queryset_is_filtered': filtered_count <= dept_users_count if dept_id else False,
                'all_users_showing': filtered_count == total_examiners and total_examiners > 0,
            },
            'note': 'HOD should see only users where department_fk_id matches their department_fk_id. If all_users_showing is true, check that HOD has department_fk set.'
        })
