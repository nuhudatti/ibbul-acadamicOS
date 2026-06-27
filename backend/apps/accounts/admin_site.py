"""
Custom Admin Site Configuration
- Email-based login (no username)
- HOD sees department-scoped sidebar only (no Faculties, no Departments).
"""
from django.contrib import admin
from django.contrib.admin import AdminSite
from django.contrib.admin.forms import AdminAuthenticationForm
from django import forms


class CustomAdminAuthenticationForm(AdminAuthenticationForm):
    """Custom admin login form that uses email"""
    username = forms.EmailField(
        label='Email',
        widget=forms.TextInput(attrs={'autofocus': True, 'placeholder': 'Enter your email address'})
    )


def _is_hod(user):
    """True if user is Department Admin (HOD)."""
    if not getattr(user, 'is_authenticated', False):
        return False
    role = getattr(user, 'role', None)
    if role is None:
        return False
    return str(role).upper() in ('DEPARTMENT_ADMIN', 'HOD')


def _is_faculty_admin(user):
    """True if user is Faculty Admin (Dean)."""
    if not getattr(user, 'is_authenticated', False):
        return False
    role = getattr(user, 'role', None)
    if role is None:
        return False
    return str(role).upper() == 'FACULTY_ADMIN'


def _is_super_admin(user):
    """True if user is Super Admin."""
    if not getattr(user, 'is_authenticated', False):
        return False
    return getattr(user, 'is_superuser', False) or str(getattr(user, 'role', '')).upper() == 'SUPER_ADMIN'


def _is_examiner(user):
    """True if user is Examiner (Lecturer)."""
    if not getattr(user, 'is_authenticated', False):
        return False
    return str(getattr(user, 'role', '')).upper() == 'EXAMINER'


# Model names to hide from HOD (department-scoped)
HOD_HIDDEN_MODELS = {'Faculty', 'Department'}
# Lecturer (Examiner) sees only Results + Courses (view courses and results for assigned students)
EXAMINER_VISIBLE_MODELS = {'Result', 'Course'}
# Faculty Admin: full faculty-scoped sidebar (no Faculty model — they are one faculty). Order for display.
FACULTY_ADMIN_VISIBLE_MODELS = {'Department', 'Course', 'Result', 'CourseAssignment'}
FACULTY_ACADEMICS_ORDER = ['Department', 'Course', 'CourseAssignment', 'Result']  # logical order in nav
FACULTY_ACCOUNTS_VISIBLE = {'User', 'AuditLog', 'UsersAccountsHub'}  # full Accounts: Users, Audit, Users/Accounts hub


class CustomAdminSite(AdminSite):
    """Custom admin site. HOD/Examiner see scoped sidebar only."""
    login_form = CustomAdminAuthenticationForm
    site_header = 'IBBUL Result Checker Administration'
    site_title = 'IBBUL Admin'
    index_title = 'Welcome to IBBUL Result Checker Admin'

    def has_permission(self, request):
        """Allow access to staff users (is_staff=True)."""
        return request.user.is_active and request.user.is_staff

    def get_app_list(self, request, app_label=None):
        """HOD: hide Faculty, Department. Examiner: only Results app (no Accounts), hide Faculty, Department."""
        app_list = super().get_app_list(request, app_label)
        if not request.user.is_authenticated:
            return app_list
        user = request.user
        # Examiner (Lecturer): only Results app with Results + Courses (view only).
        # Used for both index and inner pages (e.g. View results) so sidebar stays academics-only.
        if _is_examiner(user):
            for app in app_list:
                if app.get('app_label') != 'academics':
                    continue
                models = [m for m in app.get('models', []) if m.get('object_name') in EXAMINER_VISIBLE_MODELS]
                return [{**app, 'models': models}] if models else [{**app, 'models': []}]
            return []
        # Faculty Admin: full faculty-scoped sidebar — Academics (ordered) + full Accounts (Users, Audit, Hub)
        if _is_faculty_admin(user) and not _is_super_admin(user):
            out = []
            for app in app_list:
                if app.get('app_label') == 'academics':
                    all_models = app.get('models', [])
                    # Keep only faculty-visible; order by FACULTY_ACADEMICS_ORDER then rest
                    order_map = {name: i for i, name in enumerate(FACULTY_ACADEMICS_ORDER)}
                    filtered = [m for m in all_models if m.get('object_name') in FACULTY_ADMIN_VISIBLE_MODELS]
                    filtered.sort(key=lambda m: (order_map.get(m.get('object_name'), 99), m.get('object_name', '')))
                    if filtered:
                        out.append({**app, 'models': filtered})
                    else:
                        out.append(app)
                elif app.get('app_label') == 'accounts':
                    models = [m for m in app.get('models', []) if m.get('object_name') in FACULTY_ACCOUNTS_VISIBLE]
                    if models:
                        out.append({**app, 'models': models})
                    else:
                        out.append(app)
                else:
                    out.append(app)
            return out
        # HOD: hide Faculty, Department in Results app
        if _is_hod(user):
            out = []
            for app in app_list:
                if app.get('app_label') == 'academics':
                    models = [m for m in app.get('models', []) if m.get('object_name') not in HOD_HIDDEN_MODELS]
                    if models:
                        out.append({**app, 'models': models})
                    else:
                        out.append(app)
                else:
                    out.append(app)
            return out
        return app_list

    def each_context(self, request):
        """Scoped index title and Lecturer dashboard context."""
        context = super().each_context(request)
        if request.user.is_staff:
            context['has_module_permission'] = True
        if not request.user.is_authenticated:
            return context
        user = request.user
        # Examiner (Lecturer): Lecturer dashboard title, assigned courses, and sidebar = academics only
        if _is_examiner(user):
            name = user.get_full_name() or getattr(user, 'email', '') or 'Lecturer'
            context['index_title'] = f'Lecturer — {name}'
            context['is_examiner'] = True
            context['show_lecturer_ui'] = True  # Used by Result/Course templates to remove sidebar
            # Force sidebar to academics-only on every admin page (index, changelist, etc.)
            context['available_apps'] = self.get_app_list(request)
            try:
                from apps.academics.models import CourseAssignment
                assignments = CourseAssignment.objects.filter(examiner=user).select_related('course')[:20]
                context['lecturer_courses'] = [
                    {'code': ca.course.code, 'title': ca.course.title}
                    for ca in assignments
                ]
            except Exception:
                context['lecturer_courses'] = []
            return context
        # HOD: Department Admin Dashboard — Geology
        if _is_hod(user) and not _is_super_admin(user):
            dept = getattr(user, 'department_fk', None)
            if dept:
                name = getattr(dept, 'name', None) or getattr(dept, 'code', None) or str(dept)
                context['index_title'] = f'Department Admin — {name}'
            else:
                context['index_title'] = 'Department Admin (assign department in profile)'
            return context
        # Faculty Admin: same flow as HOD — index title only, default sidebar & app list
        if _is_faculty_admin(user) and not _is_super_admin(user):
            fac = getattr(user, 'faculty', None)
            if fac:
                name = getattr(fac, 'name', None) or getattr(fac, 'code', None) or str(fac)
                context['index_title'] = f'Faculty Admin — {name}'
            else:
                context['index_title'] = 'Faculty Admin (assign faculty in profile)'
            return context
        # Super Admin
        return context


# Instance for optional use; default admin.site is replaced in ready() with CustomAdminSite
admin_site = CustomAdminSite(name='ibbul_admin')
