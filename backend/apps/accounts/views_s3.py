"""
Module 7 — S3 Presigned URL API endpoint
Staff-only endpoint to request time-limited signed URLs for secure file access.
"""
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.conf import settings
from django.core.cache import cache

from .models import AuditLog
from .audit import log_audit
from common.storage.s3 import generate_presigned_download_url, generate_presigned_upload_url


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def s3_presigned_url_view(request):
    """
    POST /api/accounts/s3/presigned-url/
    Staff only. Generate presigned URL for S3 object access.
    
    Body:
    {
      "bucket": "ibbul-results",
      "object_key": "reports/2024/batch_123_errors.csv",
      "operation": "download",  # or "upload"
      "expiration": 3600  # optional, seconds (default: 1 hour)
    }
    """
    user = request.user
    if not user.is_staff:
        return Response(
            {'detail': 'Only staff can request presigned URLs.'},
            status=status.HTTP_403_FORBIDDEN,
        )
    
    bucket = request.data.get('bucket', '').strip()
    object_key = request.data.get('object_key', '').strip()
    operation = request.data.get('operation', 'download').strip().lower()
    expiration = int(request.data.get('expiration', 3600))
    
    if not bucket or not object_key:
        return Response(
            {'detail': 'bucket and object_key are required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    
    if operation not in ('download', 'upload'):
        return Response(
            {'detail': 'operation must be "download" or "upload".'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    
    if expiration < 60 or expiration > 86400:  # 1 minute to 24 hours
        return Response(
            {'detail': 'expiration must be between 60 and 86400 seconds.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    
    # Rate limiting: max 10 presigned URL requests per staff user per hour
    cache_key = f'presigned_url_requests_{user.id}'
    requests_count = cache.get(cache_key, 0)
    if requests_count >= 10:
        return Response(
            {'detail': 'Too many presigned URL requests. Please try again later.'},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )
    cache.set(cache_key, requests_count + 1, 3600)
    
    if operation == 'download':
        url = generate_presigned_download_url(bucket, object_key, expiration)
    else:
        content_type = request.data.get('content_type', '').strip() or None
        url = generate_presigned_upload_url(bucket, object_key, expiration, content_type)
    
    if not url:
        return Response(
            {'detail': 'S3 not configured or presigned URL generation failed.'},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    
    # Audit: log presigned URL generation
    log_audit(
        AuditLog.Action.ADMIN_ACTION,
        request=request,
        user=user,
        identifier=f'{bucket}/{object_key}',
        extra={
            'action': 's3_presigned_url_generated',
            'operation': operation,
            'expiration': expiration,
        },
    )
    
    return Response({
        'url': url,
        'expires_in': expiration,
        'operation': operation,
    }, status=status.HTTP_200_OK)
