"""
Module 7 — S3 Presigned URLs for secure file access
Production-grade: time-limited, signed URLs for private file downloads/uploads.
"""
import logging
from typing import Optional
from django.conf import settings
from datetime import timedelta

logger = logging.getLogger(__name__)

try:
    import boto3
    from botocore.exceptions import ClientError
    BOTO3_AVAILABLE = True
except ImportError:
    BOTO3_AVAILABLE = False
    logger.warning('boto3 not installed; S3 presigned URLs will not be available. Install: pip install boto3')


def get_s3_client():
    """Get S3 client with credentials from settings or environment."""
    if not BOTO3_AVAILABLE:
        return None
    aws_access_key_id = getattr(settings, 'AWS_ACCESS_KEY_ID', None)
    aws_secret_access_key = getattr(settings, 'AWS_SECRET_ACCESS_KEY', None)
    aws_region = getattr(settings, 'AWS_S3_REGION_NAME', 'us-east-1')
    if not aws_access_key_id or not aws_secret_access_key:
        return None
    return boto3.client(
        's3',
        aws_access_key_id=aws_access_key_id,
        aws_secret_access_key=aws_secret_access_key,
        region_name=aws_region,
    )


def generate_presigned_url(
    bucket_name: str,
    object_key: str,
    expiration: int = 3600,
    operation: str = 'get_object',
) -> Optional[str]:
    """
    Generate presigned URL for S3 object access (download or upload).
    
    Args:
        bucket_name: S3 bucket name
        object_key: S3 object key (path)
        expiration: URL expiration time in seconds (default: 1 hour)
        operation: 'get_object' (download) or 'put_object' (upload)
    
    Returns:
        Presigned URL string or None if S3 not configured/available
    """
    if not BOTO3_AVAILABLE:
        logger.warning('boto3 not available; cannot generate presigned URL')
        return None
    
    s3_client = get_s3_client()
    if not s3_client:
        logger.warning('S3 client not configured (missing AWS credentials)')
        return None
    
    try:
        url = s3_client.generate_presigned_url(
            operation,
            Params={'Bucket': bucket_name, 'Key': object_key},
            ExpiresIn=expiration,
        )
        return url
    except ClientError as e:
        logger.error(f'Failed to generate presigned URL for {bucket_name}/{object_key}: {e}')
        return None


def generate_presigned_download_url(
    bucket_name: str,
    object_key: str,
    expiration: int = 3600,
) -> Optional[str]:
    """Convenience wrapper for download URLs."""
    return generate_presigned_url(bucket_name, object_key, expiration, 'get_object')


def generate_presigned_upload_url(
    bucket_name: str,
    object_key: str,
    expiration: int = 3600,
    content_type: Optional[str] = None,
) -> Optional[str]:
    """
    Generate presigned URL for direct S3 upload (client-side).
    
    Args:
        bucket_name: S3 bucket name
        object_key: S3 object key (path)
        expiration: URL expiration time in seconds
        content_type: Optional content type restriction
    
    Returns:
        Presigned URL string or None
    """
    if not BOTO3_AVAILABLE:
        return None
    
    s3_client = get_s3_client()
    if not s3_client:
        return None
    
    try:
        params = {'Bucket': bucket_name, 'Key': object_key}
        if content_type:
            params['ContentType'] = content_type
        url = s3_client.generate_presigned_url(
            'put_object',
            Params=params,
            ExpiresIn=expiration,
        )
        return url
    except ClientError as e:
        logger.error(f'Failed to generate presigned upload URL for {bucket_name}/{object_key}: {e}')
        return None
