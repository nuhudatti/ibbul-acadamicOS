"""
Accounts App URLs – No public registration.
Login, first-login password change, forgot password, profile, JWT refresh.
"""
from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from . import views
from .views_audit import audit_delete_view, audit_list_view
from .views_s3 import s3_presigned_url_view
from .views_invitation import (
    invitations_list_create,
    invitation_resend,
    invitation_revoke,
    invitation_verify,
    invitation_accept,
    governance_suspend,
    governance_reactivate,
    governance_remove_assignment,
)

app_name = 'accounts'

urlpatterns = [
    path('login/', views.login_view, name='login'),
    path('profile/', views.UserProfileView.as_view(), name='profile'),
    path('settings/', views.student_settings_view, name='settings'),
    path('settings/change-password/', views.change_password_view, name='change_password'),
    path('settings/update-email/', views.update_email_view, name='update_email'),
    path('first-login/change-password/', views.first_login_change_password_view, name='first_login_change_password'),
    path('forgot-password/', views.forgot_password_request_view, name='forgot_password'),
    path('forgot-password/confirm/', views.forgot_password_confirm_view, name='forgot_password_confirm'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    # Module 6 — Audit logs & immutability
    path('audit/', audit_list_view, name='audit_list'),
    path('audit/delete/', audit_delete_view, name='audit_delete'),
    # Module 7 — Security & hardening: S3 presigned URLs
    path('s3/presigned-url/', s3_presigned_url_view, name='s3_presigned_url'),
    # Governance — staff invitations (Super Admin)
    path('invitations/', invitations_list_create, name='invitations'),
    path('invitations/verify/', invitation_verify, name='invitation_verify'),
    path('invitations/accept/', invitation_accept, name='invitation_accept'),
    path('invitations/<int:invitation_id>/resend/', invitation_resend, name='invitation_resend'),
    path('invitations/<int:invitation_id>/revoke/', invitation_revoke, name='invitation_revoke'),
    path('governance/staff/<int:user_id>/suspend/', governance_suspend, name='governance_suspend'),
    path('governance/staff/<int:user_id>/reactivate/', governance_reactivate, name='governance_reactivate'),
    path('governance/staff/<int:user_id>/remove-assignment/', governance_remove_assignment, name='governance_remove'),
]
