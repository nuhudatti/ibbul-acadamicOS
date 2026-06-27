"""
Module 3 — URL config for admin upload-results API.
"""
from django.urls import path
from . import upload_api

urlpatterns = [
    path('', upload_api.UploadResultsCreateView.as_view(), name='admin-upload-results-create'),
    path('scope/', upload_api.UploadScopeView.as_view(), name='admin-upload-results-scope'),
    path('<int:batch_id>/', upload_api.UploadResultsDetailView.as_view(), name='admin-upload-results-detail'),
    path('<int:batch_id>/download-report/', upload_api.UploadResultsDownloadReportView.as_view(), name='admin-upload-results-download-report'),
    path('<int:batch_id>/retry/', upload_api.UploadResultsRetryView.as_view(), name='admin-upload-results-retry'),
]
