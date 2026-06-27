"""
Academic Core URL configuration.
Mounted at /api/core/ in config/urls.py.

These are the authoritative endpoints for academic identity and structure.
All modules consume from here — they do not define their own structure endpoints.
"""
from django.urls import path
from . import views
from . import views_setup

app_name = 'core'

urlpatterns = [
    # ── Structure ────────────────────────────────────────────────────────────
    path('faculties/',         views.FacultyListCreateView.as_view(),    name='faculties'),
    path('departments/',       views.DepartmentListCreateView.as_view(), name='departments'),
    path('courses/',           views.CourseListView.as_view(),     name='courses'),
    path('courses/bulk/',      views.CourseBulkCreateView.as_view(), name='courses-bulk'),
    path('courses/<int:pk>/',  views.CourseDeleteView.as_view(),   name='course-delete'),
    path('tree/',              views.AcademicTreeView.as_view(),   name='tree'),

    # ── Sessions ─────────────────────────────────────────────────────────────
    path('sessions/',          views.SessionListView.as_view(),    name='sessions'),
    path('sessions/current/',  views.current_session,              name='sessions-current'),
    path('sessions/<int:pk>/', views.SessionDetailView.as_view(),  name='session-detail'),

    # ── Student Course Registrations ─────────────────────────────────────────
    path('registrations/',     views.StudentRegistrationListView.as_view(), name='registrations'),
    path('my-registrations/',  views.my_registrations,             name='my-registrations'),

    # ── Scoped user lists ────────────────────────────────────────────────────
    path('students/',          views.scoped_students,              name='students'),
    path('staff/',             views.scoped_staff,                 name='staff'),

    # ── Summary / health ─────────────────────────────────────────────────────
    path('summary/',           views.core_summary,                 name='summary'),

    # ── Platform branding (UI + emails) ───────────────────────────────────────
    path('platform-branding/', views.platform_branding,            name='platform-branding'),
    path('platform-branding/public/', views.platform_branding_public, name='platform-branding-public'),
    path('platform-branding/upload/', views.platform_branding_upload, name='platform-branding-upload'),

    # ── Enterprise setup wizard (first run only) ───────────────────────────────
    path('setup/status/', views_setup.setup_status, name='setup-status'),
    path('setup/complete/', views_setup.setup_complete, name='setup-complete'),
]
