"""
Main URL Configuration
Routes requests to appropriate app URLs
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from apps.accounts.views import root_view, api_root_view
from apps.accounts.views_monitoring import health_check_view, health_deep_check_view, metrics_view
from apps.accounts.admin_views import (
    import_users_view,
    import_users_template_download,
    user_management_view,
    temp_passwords_export_download,
    users_accounts_hub_view,
    add_student_view,
    audit_log_view,
    audit_log_export_view,
)
from apps.accounts.admin_views_monitoring import job_dashboard_view

# Configure admin site - Production System
admin.site.site_header = 'Result Management System'
admin.site.site_title = 'Result Management'
admin.site.index_title = 'Result Management Dashboard'
admin.autodiscover()

urlpatterns = [
    path('', root_view, name='root'),
    path('api/', api_root_view, name='api_root'),
    # Module 8 — Monitoring endpoints
    path('health', health_check_view, name='health'),
    path('health/deep', health_deep_check_view, name='health_deep'),
    path('metrics', metrics_view, name='metrics'),
    # Users / Accounts admin views: wrapped with admin.site.admin_view() so they're
    # bound to AdminSite and get full admin context (sidebar, breadcrumbs, theme).
    path('admin/users-accounts/', admin.site.admin_view(users_accounts_hub_view), name='admin_users_accounts'),
    path('admin/add-student/', admin.site.admin_view(add_student_view), name='admin_add_student'),
    path('admin/import-users/', admin.site.admin_view(import_users_view), name='admin_import_users'),
    path('admin/import-users/template/', admin.site.admin_view(import_users_template_download), name='admin_import_users_template'),
    path('admin/import-users/export/<str:export_id>/', admin.site.admin_view(temp_passwords_export_download), name='admin_temp_passwords_export'),
    path('admin/user-management/', admin.site.admin_view(user_management_view), name='admin_user_management'),
    path('admin/audit-logs/', admin.site.admin_view(audit_log_view), name='admin_audit_logs'),
    path('admin/audit-logs/export/', admin.site.admin_view(audit_log_export_view), name='admin_audit_logs_export'),
    path('admin/job-dashboard/', admin.site.admin_view(job_dashboard_view), name='admin_job_dashboard'),
    path('admin/', admin.site.urls),
    path('api/accounts/', include('apps.accounts.urls')),
    path('api/core/', include('apps.core.urls')),          # Academic Core — single source of truth
    path('api/academics/', include('apps.academics.urls')),
    path('api/learning/', include('apps.learning.urls')),
    path('api/admin/upload-results/', include('apps.academics.upload_urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
