"""
URL configuration for academics app
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
from . import views_hod
from . import views_hod_department
from . import views_upload_batch
from . import upload_hod
from . import users_hod

router = DefaultRouter()
router.register(r'courses', views.CourseViewSet, basename='course')
router.register(r'results', views.ResultViewSet, basename='result')
router.register(r'gpa', views.GPAViewSet, basename='gpa')
router.register(r'upload-batches', views_upload_batch.UploadBatchViewSet, basename='upload-batch')

# HOD module routes
hod_router = DefaultRouter()
hod_router.register(r'results', views_hod.HODResultViewSet, basename='hod-result')
hod_router.register(r'users', users_hod.HODUserViewSet, basename='hod-user')

urlpatterns = [
    # SuperAdmin only: emergency unlock (must be before router to take precedence)
    path('results/<int:pk>/emergency_unlock/', views.emergency_unlock_result_view, name='result-emergency-unlock'),
    path('', include(router.urls)),
    path('check-permissions/', views.check_permissions, name='check-permissions'),
    path('students/', views.get_students_list, name='students-list'),
    # HOD module endpoints
    path('hod/', include(hod_router.urls)),
    path('hod/upload/validate/', upload_hod.HODUploadValidateView.as_view(), name='hod-upload-validate'),
    path('hod/upload/preview/', upload_hod.HODUploadPreviewView.as_view(), name='hod-upload-preview'),
    path('hod/upload/submit/', upload_hod.HODUploadSubmitView.as_view(), name='hod-upload-submit'),
    path('hod/manual-entry/', upload_hod.HODManualStudentEntryView.as_view(), name='hod-manual-entry'),
    # HOD department management
    path('hod/department/overview/', views_hod_department.department_overview, name='hod-department-overview'),
    path('hod/department/lecturers/', views_hod_department.department_lecturers, name='hod-department-lecturers'),
    path('hod/department/students/', views_hod_department.department_students, name='hod-department-students'),
    path('hod/department/invitations/export/', views_hod_department.department_invitations_export, name='hod-invitations-export'),
    path('hod/department/invitations/', views_hod_department.department_invitations, name='hod-department-invitations'),
    path('hod/department/invitations/<int:invitation_id>/resend/', views_hod_department.department_invitation_resend, name='hod-invitation-resend'),
    path('hod/department/invitations/<int:invitation_id>/revoke/', views_hod_department.department_invitation_revoke, name='hod-invitation-revoke'),
    path('hod/department/students/bulk-invite/', views_hod_department.department_bulk_invite_students, name='hod-bulk-invite-students'),
    path('hod/department/students/bulk-invite-rows/', views_hod_department.department_bulk_invite_rows, name='hod-bulk-invite-rows'),
    path('hod/department/students/<int:pk>/deactivate/', views_hod_department.department_student_deactivate, name='hod-student-deactivate'),
    path('hod/department/students/<int:pk>/reactivate/', views_hod_department.department_student_reactivate, name='hod-student-reactivate'),
    path('hod/department/students/<int:pk>/', views_hod_department.department_student_delete, name='hod-student-delete'),
]
