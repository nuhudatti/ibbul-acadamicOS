"""
Cloudinary media storage — single integration point for images, video, PDFs, logos.

All user-facing media should be stored as HTTPS URLs (secure_url), never base64 in DB
or local MEDIA_ROOT (except ephemeral result CSV processing — not served as media).
"""
from __future__ import annotations

import logging
import re
from typing import BinaryIO, Optional, Tuple, Union

from django.conf import settings

logger = logging.getLogger(__name__)

FileLike = Union[BinaryIO, bytes]


def is_configured() -> bool:
    return bool(
        getattr(settings, 'CLOUDINARY_CLOUD_NAME', '')
        and getattr(settings, 'CLOUDINARY_API_KEY', '')
        and getattr(settings, 'CLOUDINARY_API_SECRET', '')
    )


def _configure() -> None:
    if not is_configured():
        raise RuntimeError(
            'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, '
            'CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in .env'
        )
    import cloudinary

    cloudinary.config(
        cloud_name=settings.CLOUDINARY_CLOUD_NAME,
        api_key=settings.CLOUDINARY_API_KEY,
        api_secret=settings.CLOUDINARY_API_SECRET,
        secure=True,
    )


def _resource_type(filename: str, content_type: str = '') -> str:
    lower = (filename or '').lower()
    ct = (content_type or '').lower()
    if lower.endswith('.pdf') or 'pdf' in ct:
        return 'raw'
    if any(lower.endswith(ext) for ext in ('.mp4', '.webm', '.mov', '.avi', '.mkv')):
        return 'video'
    if any(lower.endswith(ext) for ext in ('.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg')):
        return 'image'
    if 'video' in ct:
        return 'video'
    if 'image' in ct:
        return 'image'
    return 'auto'


def upload_file(
    file_obj: FileLike,
    *,
    folder: str,
    filename: str = 'file',
    resource_type: str = 'auto',
    public_id: Optional[str] = None,
) -> Tuple[str, str]:
    """Upload file → (secure_url, public_id)."""
    _configure()
    import cloudinary.uploader

    rt = resource_type if resource_type != 'auto' else _resource_type(filename)
    opts = {
        'folder': folder.strip('/'),
        'resource_type': rt,
        'use_filename': True,
        'unique_filename': True,
        'overwrite': False,
    }
    if public_id:
        opts['public_id'] = public_id

    result = cloudinary.uploader.upload(file_obj, **opts)
    return result['secure_url'], result.get('public_id', '')


def upload_data_url(data_url: str, *, folder: str) -> Optional[str]:
    """Upload a data: URL to Cloudinary; return secure_url."""
    if not data_url or not data_url.startswith('data:'):
        return None
    if not is_configured():
        logger.warning('Cloudinary not configured — cannot upload data URL')
        return None
    _configure()
    import cloudinary.uploader

    result = cloudinary.uploader.upload(
        data_url,
        folder=folder.strip('/'),
        resource_type='image',
    )
    return result['secure_url']


def normalize_media_value(
    value: str,
    *,
    folder: str,
) -> str:
    """
    Normalize branding/media field values for DB storage:
    - Empty → ''
    - Already https Cloudinary/local URL → keep
    - data: URL → upload to Cloudinary when configured
    - Legacy local path → keep (backward compat until migrated)
    """
    val = (value or '').strip()
    if not val:
        return ''
    if val.startswith('http://') or val.startswith('https://'):
        return val
    if val.startswith('data:') and is_configured():
        uploaded = upload_data_url(val, folder=folder)
        return uploaded or val
    return val


def delete_by_url(url: str) -> bool:
    """Delete asset from Cloudinary using stored secure_url."""
    if not url or not is_configured():
        return False
    public_id, resource_type = public_id_from_url(url)
    if not public_id:
        return False
    try:
        _configure()
        import cloudinary.uploader

        cloudinary.uploader.destroy(public_id, resource_type=resource_type, invalidate=True)
        return True
    except Exception as exc:
        logger.warning('Cloudinary delete failed for %s: %s', url[:80], exc)
        return False


def public_id_from_url(url: str) -> Tuple[Optional[str], str]:
    """Extract public_id and resource_type from a Cloudinary secure_url."""
    if not url or 'res.cloudinary.com' not in url:
        return None, 'image'
    # .../image/upload/v123/folder/name.ext
    match = re.search(
        r'/([^/]+)/upload/(?:v\d+/)?(.+?)(?:\.[a-zA-Z0-9]+)?$',
        url.split('?')[0],
    )
    if not match:
        return None, 'image'
    resource_type = match.group(1)
    public_id = match.group(2)
    return public_id, resource_type


def resolve_media_url(stored: str) -> str:
    """Return browser-ready URL for a stored file_key or URL."""
    val = (stored or '').strip()
    if not val:
        return ''
    if val.startswith('http://') or val.startswith('https://'):
        return val
    if val.startswith('data:'):
        return val
    base = getattr(settings, 'FRONTEND_BASE_URL', '') or ''
    api = getattr(settings, 'PUBLIC_API_URL', '') or ''
    prefix = api.rstrip('/') if api else ''
    if not prefix:
        from django.conf import settings as dj_settings
        prefix = dj_settings.FRONTEND_BASE_URL.replace(':3000', ':8000') if hasattr(dj_settings, 'FRONTEND_BASE_URL') else ''
    path = val if val.startswith('media/') else f'media/{val.lstrip("/")}'
    return f'{prefix}/{path}' if prefix else f'/{path}'


def get_logo_bytes_from_url(url: str) -> Optional[Tuple[bytes, str]]:
    """Fetch logo bytes from HTTPS URL for email embedding."""
    if not url or url.startswith('data:'):
        from apps.core.branding_service import decode_data_url
        return decode_data_url(url) if url.startswith('data:') else None
    if not url.startswith('http'):
        return None
    try:
        import urllib.request

        with urllib.request.urlopen(url, timeout=15) as resp:
            data = resp.read()
        ext = 'png'
        if '.jpg' in url.lower() or '.jpeg' in url.lower():
            ext = 'jpeg'
        return data, ext
    except Exception as exc:
        logger.warning('Could not fetch logo from URL: %s', exc)
        return None
