"""
Admin Configuration - Production System
Custom User admin for full staff management (SUPER_ADMIN, FACULTY_ADMIN, DEPARTMENT_ADMIN, EXAMINER, STUDENT).
User import via CSV/Excel at /admin/import-users/. Audit logs visible for compliance.
"""
from django.contrib import admin
from django.contrib.admin.filters import SimpleListFilter
from django.contrib.admin.forms import AdminAuthenticationForm
from django.db.models import Q
from django.http import HttpResponseRedirect
from django import forms
from django.urls import reverse
from django.utils.text import gettext_lazy as _

from .models import User, UserRole, AuditLog, UsersAccountsHub
from .scope import filter_by_scope, is_hod, get_hod_department_id, is_super_admin
from .audit import log_audit
from common.validators.student_id_validator import department_code_from_student_id


class ScopedRoleListFilter(SimpleListFilter):
    """
    Role filter scoped to viewer: HOD sees only Dept Admin, Examiner, Student;
    Faculty Admin sees Faculty Admin + those; Super Admin sees all.
    Legacy HOD is merged into "Department Admin (HOD)" (single choice, both roles).
    """
    title = _('Role')
    parameter_name = 'role'

    def lookups(self, request, model_admin):
        if not request.user.is_authenticated:
            return ()
        role_str = str(getattr(request.user, 'role', '') or '').upper()
        is_global = getattr(request.user, 'is_superuser', False) or role_str == 'SUPER_ADMIN'
        if is_hod(request.user) and not is_global:
            return (
                (UserRole.DEPARTMENT_ADMIN, _('Department Admin (HOD)')),
                (UserRole.EXAMINER, _('Examiner (Lecturer)')),
                (UserRole.STUDENT, _('Student')),
            )
        if role_str in ('FACULTY_ADMIN',) and not is_global:
            return (
                (UserRole.FACULTY_ADMIN, _('Faculty Admin (Dean)')),
                (UserRole.DEPARTMENT_ADMIN, _('Department Admin (HOD)')),
                (UserRole.EXAMINER, _('Examiner (Lecturer)')),
                (UserRole.STUDENT, _('Student')),
            )
        # Super Admin: all roles; show Dept Admin once (covers legacy HOD)
        return (
            (UserRole.SUPER_ADMIN, _('Super Admin (ICT/Registrar)')),
            (UserRole.FACULTY_ADMIN, _('Faculty Admin (Dean)')),
            (UserRole.DEPARTMENT_ADMIN, _('Department Admin (HOD)')),
            (UserRole.EXAMINER, _('Examiner (Lecturer)')),
            (UserRole.STUDENT, _('Student')),
        )

    def queryset(self, request, queryset):
        value = self.value()
        if not value:
            return queryset
        # Department Admin filter includes legacy HOD
        if value == UserRole.DEPARTMENT_ADMIN:
            return queryset.filter(Q(role=UserRole.DEPARTMENT_ADMIN) | Q(role=UserRole.HOD))
        return queryset.filter(role=value)


def _user_admin_scope_info(request):
    """Scope info for User changelist: scope_label, is_scoped (HOD/Faculty Admin)."""
    if not getattr(request, 'user', None) or not getattr(request.user, 'is_authenticated', False):
        return {'scope_label': None, 'is_scoped': False}
    role = getattr(request.user, 'role', None)
    role_str = str(role).upper() if role else ''
    if role_str in ('DEPARTMENT_ADMIN', 'HOD'):
        dept = getattr(request.user, 'department_fk', None)
        if dept:
            name = getattr(dept, 'name', None) or getattr(dept, 'code', None) or str(dept)
            return {'scope_label': name, 'is_scoped': True, 'scope_type': 'department'}
        return {'scope_label': _('Department (assign in profile)'), 'is_scoped': True, 'scope_type': 'department'}
    if role_str == 'FACULTY_ADMIN':
        fac = getattr(request.user, 'faculty', None)
        if fac:
            name = getattr(fac, 'name', None) or getattr(fac, 'code', None) or str(fac)
            return {'scope_label': name, 'is_scoped': True, 'scope_type': 'faculty'}
        return {'scope_label': _('Faculty (assign in profile)'), 'is_scoped': True, 'scope_type': 'faculty'}
    return {'scope_label': None, 'is_scoped': False}


class EmailAdminAuthenticationForm(AdminAuthenticationForm):
    """Custom login form for admin - uses email instead of username. Students must use the student portal."""
    username = forms.EmailField(
        label='Email',
        widget=forms.EmailInput(attrs={'autofocus': True, 'placeholder': 'Staff email (e.g. admin@ibbul.edu.ng)'}),
        help_text='Staff only. Students: use the student portal (e.g. http://localhost:5173/login) with your registration number.',
    )


class UserAdminForm(forms.ModelForm):
    """Form for create/edit User: student_id required for STUDENT, email required for staff; faculty/department optional."""
    password1 = forms.CharField(
        label=_('Password'),
        required=False,
        widget=forms.PasswordInput(attrs={'autocomplete': 'new-password'}),
        help_text=_('Leave blank to auto-generate a temporary password (user must change on first login).'),
    )
    password2 = forms.CharField(
        label=_('Password confirmation'),
        required=False,
        widget=forms.PasswordInput(attrs={'autocomplete': 'new-password'}),
        help_text=_('Enter the same password as above, for verification.'),
    )

    class Meta:
        model = User
        fields = (
            'email', 'student_id', 'first_name', 'last_name', 'role',
            'faculty', 'department_fk', 'is_active', 'is_staff', 'is_superuser',
            'is_first_login',
        )
        # password1 / password2 are form-only (not model fields)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['student_id'].help_text = _('Required for STUDENT role (e.g. U22/FNS/CSC/0001). Leave blank for staff.')
        self.fields['email'].help_text = _('Required for staff. Optional for students.')
        
        user = getattr(self, 'request', None) and self.request.user
        # ENTERPRISE: HOD can only add STUDENT or EXAMINER; restrict role choices and department
        if user and is_hod(user) and not is_super_admin(user):
            dept_id = get_hod_department_id(user)
            if dept_id and 'department_fk' in self.fields:
                from apps.academics.models import Department
                self.fields['department_fk'].queryset = Department.objects.filter(pk=dept_id)
                self.fields['department_fk'].help_text = _('Your department (auto-set).')
            if 'role' in self.fields:
                role_choices = [c for c in self.fields['role'].choices if c[0] in (UserRole.STUDENT, UserRole.EXAMINER)]
                self.fields['role'].choices = role_choices
                self.fields['role'].help_text = _('Department Admin can only add Students or Examiners.')
        
        if self.instance and self.instance.pk:
            self.fields['password1'].help_text = _('Leave blank to keep current password.')
            self.fields.pop('password2', None)
        else:
            self.fields['password2'].required = False

    def clean(self):
        data = super().clean()
        role = data.get('role') or (self.instance.role if self.instance.pk else UserRole.STUDENT)
        if role == UserRole.STUDENT:
            sid = (data.get('student_id') or '').strip()
            if not sid:
                self.add_error('student_id', _('Student ID is required for STUDENT role.'))
            if sid:
                data['student_id'] = sid.upper()
            # Enterprise: HOD can only add students whose reg number department code matches their department
            user = getattr(self, 'request', None) and getattr(self, 'request') and getattr(self.request, 'user', None)
            if user and is_hod(user) and not is_super_admin(user) and sid:
                dept_id = get_hod_department_id(user)
                if dept_id:
                    from apps.academics.models import Department
                    hod_dept = Department.objects.filter(pk=dept_id).first()
                    if hod_dept:
                        reg_code = department_code_from_student_id(sid.upper())
                        hod_code = getattr(hod_dept, 'code', '')
                        if reg_code and reg_code != hod_code:
                            self.add_error(
                                'student_id',
                                _('Registration number indicates department %(code)s. You can only add students for your department (%(dept)s). Use format U22/FNS/%(hod)s/XXXX.')
                                % {'code': reg_code, 'dept': getattr(hod_dept, 'name', hod_code), 'hod': hod_code},
                            )
        else:
            email = (data.get('email') or '').strip()
            if not email:
                self.add_error('email', _('Email is required for staff roles.'))
            data['student_id'] = None
        password1 = data.get('password1')
        password2 = data.get('password2')
        if not self.instance.pk and password1 and password1 != password2:
            self.add_error('password2', _("Passwords don't match."))
        return data

    def save(self, commit=True):
        user = super().save(commit=False)
        password = self.cleaned_data.get('password1') or self.cleaned_data.get('password2')
        if password:
            user.set_password(password)
        if commit:
            user.save()
        return user


class CustomUserAdmin(admin.ModelAdmin):
    """Full staff user management: create/edit any role with faculty/department and first-login password change."""
    form = UserAdminForm
    list_display = ('identifier_display', 'get_full_name', 'role', 'faculty', 'department_fk', 'is_active', 'is_first_login', 'last_login')
    list_filter = (ScopedRoleListFilter, 'is_active', 'is_first_login', 'is_staff', 'is_superuser')
    search_fields = ('email', 'student_id', 'first_name', 'last_name')
    ordering = ('-date_joined',)
    filter_horizontal = ()
    readonly_fields = ('date_joined', 'last_login', 'last_password_change')
    change_list_template = 'admin/accounts/user/change_list.html'
    actions_on_top = True
    actions_on_bottom = True

    @admin.action(description=_('Activate selected users'))
    def activate_users(self, request, queryset):
        n = queryset.update(is_active=True)
        self.message_user(request, _('%d user(s) activated.') % n)

    @admin.action(description=_('Deactivate selected users'))
    def deactivate_users(self, request, queryset):
        # Don't allow deactivating yourself
        qs = queryset.exclude(pk=request.user.pk)
        n = qs.update(is_active=False)
        self.message_user(request, _('%d user(s) deactivated.') % n)

    def get_actions(self, request):
        actions = super().get_actions(request)
        actions['activate_users'] = (
            self.get_action('activate_users')[0],
            'activate_users',
            _('Activate selected users'),
        )
        actions['deactivate_users'] = (
            self.get_action('deactivate_users')[0],
            'deactivate_users',
            _('Deactivate selected users'),
        )
        if not getattr(request.user, 'is_superuser', False):
            actions.pop('delete_selected', None)
        return actions

    fieldsets = (
        (None, {'fields': ('email', 'student_id', 'password1', 'password2')}),
        (_('Personal'), {'fields': ('first_name', 'last_name', 'role')}),
        (_('Scope'), {'fields': ('faculty', 'department_fk')}),
        (_('Status'), {'fields': ('is_active', 'is_staff', 'is_superuser', 'is_first_login')}),
        (_('Important dates'), {'fields': ('date_joined', 'last_login', 'last_password_change')}),
    )
    add_fieldsets = (
        (None, {'fields': ('email', 'student_id', 'password1', 'password2')}),
        (_('Personal'), {'fields': ('first_name', 'last_name', 'role')}),
        (_('Scope'), {'fields': ('faculty', 'department_fk')}),
        (_('Status'), {'fields': ('is_active', 'is_staff', 'is_superuser', 'is_first_login')}),
    )

    def has_module_permission(self, request):
        """Allow staff users to see User module."""
        return request.user.is_staff

    def has_view_permission(self, request, obj=None):
        """Allow staff users to view User."""
        return request.user.is_staff

    def has_add_permission(self, request):
        """HOD/Faculty Admin/Super Admin can add users within scope. HOD without department cannot add."""
        if not request.user.is_staff:
            return False
        if getattr(request.user, 'is_superuser', False):
            return True
        if is_hod(request.user) and not is_super_admin(request.user) and get_hod_department_id(request.user) is None:
            return False
        return (
            request.user.has_perm('accounts.add_user_scoped')
            or request.user.has_perm('accounts.add_user')
        )

    def get_list_filter(self, request):
        """Scoped role filter + is_active, is_first_login. Super Admin gets is_staff, is_superuser."""
        base = (ScopedRoleListFilter, 'is_active', 'is_first_login')
        if is_super_admin(request.user):
            return base + ('is_staff', 'is_superuser')
        return base

    def changelist_view(self, request, extra_context=None):
        """Add scope banner and scope_info so HOD/Faculty Admin see 'Viewing: Geology' etc."""
        extra_context = extra_context or {}
        scope_info = _user_admin_scope_info(request)
        extra_context['scope_info'] = scope_info
        return super().changelist_view(request, extra_context)

    def get_queryset(self, request):
        """
        ENTERPRISE SCOPE: HOD sees ONLY users in their department.
        Super Admin sees all users. Faculty Admin sees users in their faculty.
        """
        qs = super().get_queryset(request)
        # Apply scope filtering: HOD → department, Faculty Admin → faculty, Super Admin → all
        return filter_by_scope(qs, request.user, request)

    def has_change_permission(self, request, obj=None):
        """
        HOD can only edit users in their department (or themselves).
        Super Admin can edit anyone.
        """
        if not request.user.is_staff:
            return False
        if is_super_admin(request.user):
            return True
        if obj is None:
            return True  # List view - permission checked by get_queryset
        # HOD: can edit users in their department or themselves
        if is_hod(request.user):
            dept_id = get_hod_department_id(request.user)
            if dept_id is None:
                return False
            # HOD can edit: users in their department OR themselves
            return getattr(obj, 'department_fk_id', None) == dept_id or obj.pk == request.user.pk
        # Faculty Admin: can edit users in their faculty
        if hasattr(request.user, 'faculty_id') and request.user.faculty_id:
            return getattr(obj, 'faculty_id', None) == request.user.faculty_id or obj.pk == request.user.pk
        # Examiner/Student: can only edit themselves
        return obj.pk == request.user.pk

    def has_delete_permission(self, request, obj=None):
        """
        HOD can only delete users in their department (NOT themselves).
        Super Admin can delete anyone (except themselves?).
        """
        if not request.user.is_staff:
            return False
        if is_super_admin(request.user):
            return obj is None or obj.pk != request.user.pk  # Can't delete self
        if obj is None:
            return False  # No bulk delete for non-Super Admin
        # HOD: can delete users in their department (NOT themselves)
        if is_hod(request.user):
            dept_id = get_hod_department_id(request.user)
            if dept_id is None:
                return False
            # Can delete users in department, but NOT self
            return getattr(obj, 'department_fk_id', None) == dept_id and obj.pk != request.user.pk
        # Others: cannot delete
        return False

    def identifier_display(self, obj):
        return obj.student_id or obj.email or '—'
    identifier_display.short_description = _('Identifier')

    def get_form(self, request, obj=None, **kwargs):
        form = super().get_form(request, obj=None, **kwargs)
        form.request = request  # for form __init__ (restrict role/department for HOD)
        if obj:
            form.base_fields['password1'].required = False
            if 'password2' in form.base_fields:
                form.base_fields.pop('password2', None)
        return form

    def get_fieldsets(self, request, obj=None):
        if not obj:
            # Add form: for HOD hide Scope (department set in save_model)
            if is_hod(request.user) and not is_super_admin(request.user) and get_hod_department_id(request.user):
                return (
                    (None, {'fields': ('email', 'student_id', 'password1', 'password2')}),
                    (_('Personal'), {'fields': ('first_name', 'last_name', 'role')}),
                    (_('Status'), {'fields': ('is_active', 'is_staff', 'is_superuser', 'is_first_login')}),
                )
            return self.add_fieldsets
        # Change form: no password2 field
        return (
            (None, {'fields': ('email', 'student_id', 'password1')}),
            (_('Personal'), {'fields': ('first_name', 'last_name', 'role')}),
            (_('Scope'), {'fields': ('faculty', 'department_fk')}),
            (_('Status'), {'fields': ('is_active', 'is_staff', 'is_superuser', 'is_first_login')}),
            (_('Important dates'), {'fields': ('date_joined', 'last_login', 'last_password_change')}),
        )

    def save_model(self, request, obj, form, change):
        # ENTERPRISE: Auto-set department for HOD-created users; validate student_id matches HOD department
        if not change and is_hod(request.user) and not is_super_admin(request.user):
            dept_id = get_hod_department_id(request.user)
            if dept_id:
                from apps.academics.models import Department
                from django.core.exceptions import ValidationError
                dept = Department.objects.filter(pk=dept_id).first()
                if dept:
                    if obj.role == UserRole.STUDENT and (obj.student_id or '').strip():
                        reg_code = department_code_from_student_id((obj.student_id or '').strip().upper())
                        hod_code = getattr(dept, 'code', '')
                        if reg_code and reg_code != hod_code:
                            raise ValidationError(
                                _('Registration number indicates department %(code)s. You can only add students for your department (%(dept)s).')
                                % {'code': reg_code, 'dept': getattr(dept, 'name', hod_code)},
                            )
                    if not obj.department_fk_id:
                        obj.department_fk = dept
                        if not obj.faculty_id and dept.faculty_id:
                            obj.faculty = dept.faculty
        
        if not change:
            password = form.cleaned_data.get('password1') or form.cleaned_data.get('password2')
            if not password:
                from apps.accounts.admin_views import _generate_temp_password
                password = _generate_temp_password()
                obj.set_password(password)
                obj.is_first_login = True
                self._temp_password_for_message = password
            else:
                obj.is_first_login = bool(form.cleaned_data.get('is_first_login', True))
        if obj.role in (UserRole.SUPER_ADMIN, UserRole.FACULTY_ADMIN, UserRole.DEPARTMENT_ADMIN, UserRole.EXAMINER):
            if not obj.is_staff:
                obj.is_staff = True
        obj.save()
        # Enterprise audit: every user add/change is logged for full accountability
        if not change:
            log_audit(
                AuditLog.Action.USER_CREATED,
                request=request,
                user=request.user,
                identifier=obj.email or obj.student_id or str(obj.pk),
                extra={
                    'created_user_id': obj.pk,
                    'email': getattr(obj, 'email', None),
                    'student_id': getattr(obj, 'student_id', None),
                    'role': getattr(obj.role, 'value', str(obj.role)) if obj.role else None,
                },
            )
        else:
            log_audit(
                AuditLog.Action.USER_UPDATED,
                request=request,
                user=request.user,
                identifier=obj.email or obj.student_id or str(obj.pk),
                extra={
                    'updated_user_id': obj.pk,
                    'email': getattr(obj, 'email', None),
                    'role': getattr(obj.role, 'value', str(obj.role)) if obj.role else None,
                },
            )
        if not change and getattr(self, '_temp_password_for_message', None):
            from django.contrib import messages
            messages.success(
                request,
                _('User created. Temporary password: %(pwd)s — user must change on first login.')
                % {'pwd': self._temp_password_for_message},
            )
            del self._temp_password_for_message


# User is registered in apps.accounts.apps.ready() with CustomUserAdmin so /admin/accounts/user/ works


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    """Audit logs: read-only, immutable. Only Super Admin can delete. Changelist redirects to professional audit UI."""
    list_display = ('action', 'user', 'identifier', 'ip_address', 'created_at')
    list_filter = ('action', 'user', 'created_at')
    search_fields = ('identifier', 'action')
    readonly_fields = ('user', 'action', 'identifier', 'ip_address', 'user_agent', 'extra', 'created_at')
    date_hierarchy = 'created_at'

    def has_module_permission(self, request):
        """Allow staff users to see AuditLog module."""
        return request.user.is_staff

    def has_view_permission(self, request, obj=None):
        """Allow staff users to view AuditLog."""
        return request.user.is_staff

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        """Only Super Admin can delete audit logs. Normal admins must not see delete."""
        return getattr(request.user, 'is_superuser', False)

    def get_actions(self, request):
        """Remove bulk delete for non–Super Admins. Audit logs are append-only for normal admins."""
        actions = super().get_actions(request)
        if not getattr(request.user, 'is_superuser', False) and actions:
            actions.pop('delete_selected', None)
        return actions

    def changelist_view(self, request, extra_context=None):
        """Redirect to professional audit log page (stats, filters, export)."""
        qs = request.META.get('QUERY_STRING', '')
        url = reverse('admin_audit_logs')
        if qs:
            url = f'{url}?{qs}'
        return HttpResponseRedirect(url)


@admin.register(UsersAccountsHub)
class UsersAccountsHubAdmin(admin.ModelAdmin):
    """
    Changelist redirects to the Users / Accounts hub (/admin/users-accounts/).
    No add/edit; no data shown. Exists so "Users / Accounts" appears under
    Accounts in the admin sidebar on every page (index, Results, Audit logs, etc.).
    """
    def has_module_permission(self, request):
        """Staff users see Accounts module (so dashboard is not empty)."""
        return request.user.is_staff

    def changelist_view(self, request, extra_context=None):
        return HttpResponseRedirect(reverse('admin_users_accounts'))

    def get_queryset(self, request):
        return UsersAccountsHub.objects.none()

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return True  # so sidebar shows "Change" link

    def has_delete_permission(self, request, obj=None):
        return False

    def has_view_permission(self, request, obj=None):
        return request.user.is_staff


# Set custom login form
admin.site.login_form = EmailAdminAuthenticationForm
