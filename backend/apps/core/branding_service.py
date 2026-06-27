"""Platform branding for UI and transactional emails."""
from __future__ import annotations

import base64
import logging
import os
import re
from typing import Optional, Tuple

from django.conf import settings

logger = logging.getLogger(__name__)

LOGO_CID = 'institution-logo'


def _normalize_hex(color: str, default: str) -> str:
    c = (color or '').strip()
    if not c:
        return default
    if not c.startswith('#'):
        c = f'#{c}'
    return c[:7] if len(c) >= 7 else default


def get_platform_branding_dict() -> dict:
    """Merge DB branding (Super Admin) with .env defaults."""
    defaults = {
        'institution_name': getattr(
            settings, 'INSTITUTION_NAME',
            'Ibrahim Badamasi Babangida University, Lapai',
        ),
        'institution_short': getattr(settings, 'INSTITUTION_SHORT_NAME', 'IBBUL'),
        'platform_name': getattr(settings, 'PLATFORM_NAME', 'IBBUL Academic OS'),
        'tagline': getattr(settings, 'PLATFORM_TAGLINE', 'Learning for Service'),
        'footer_text': getattr(
            settings, 'INSTITUTION_NAME',
            'Ibrahim Badamasi Babangida University, Lapai · Niger State, Nigeria',
        ),
        'primary_color': _normalize_hex(getattr(settings, 'EMAIL_PRIMARY_COLOR', ''), '#0F6B3E'),
        'accent_color': _normalize_hex(getattr(settings, 'EMAIL_ACCENT_COLOR', ''), '#C9A227'),
        'logo_data': '',
        'login_background_data': '',
        'support_email': getattr(settings, 'SUPPORT_EMAIL', 'ict@ibbul.edu.ng'),
        'from_email': getattr(settings, 'DEFAULT_FROM_EMAIL', 'IBBUL Academic OS <noreply@ibbul.edu.ng>'),
        'frontend_url': getattr(settings, 'FRONTEND_BASE_URL', 'http://localhost:3000').rstrip('/'),
    }

    try:
        from apps.core.models import PlatformBranding
        pb = PlatformBranding.load()
        if pb.platform_name:
            defaults['platform_name'] = pb.platform_name
        if pb.platform_short_name:
            defaults['institution_short'] = pb.platform_short_name
        if pb.tagline:
            defaults['tagline'] = pb.tagline
        if pb.footer_text:
            defaults['footer_text'] = pb.footer_text
        if pb.primary_color:
            defaults['primary_color'] = _normalize_hex(pb.primary_color, defaults['primary_color'])
        if pb.accent_color:
            defaults['accent_color'] = _normalize_hex(pb.accent_color, defaults['accent_color'])
        if pb.logo_data:
            defaults['logo_data'] = pb.logo_data
        if pb.login_background_data:
            defaults['login_background_data'] = pb.login_background_data
    except Exception as exc:
        logger.debug('PlatformBranding not loaded: %s', exc)

    return defaults


def decode_data_url(data_url: str) -> Optional[Tuple[bytes, str]]:
    if not data_url or not data_url.startswith('data:'):
        return None
    match = re.match(r'data:image/([\w+.-]+);base64,(.+)', data_url, re.DOTALL)
    if not match:
        return None
    subtype = match.group(1).replace('svg+xml', 'png').split('+')[0]
    if subtype == 'jpeg':
        subtype = 'jpg'
    try:
        return base64.b64decode(match.group(2)), subtype
    except Exception:
        return None


def get_logo_bytes() -> Optional[Tuple[bytes, str]]:
    branding = get_platform_branding_dict()
    logo_val = branding.get('logo_data') or ''

    if logo_val.startswith('http://') or logo_val.startswith('https://'):
        from common.storage.cloudinary_service import get_logo_bytes_from_url
        fetched = get_logo_bytes_from_url(logo_val)
        if fetched:
            return fetched

    decoded = decode_data_url(logo_val)
    if decoded:
        return decoded

    logo_url = getattr(settings, 'EMAIL_LOGO_URL', '').strip()
    if logo_url and not logo_url.startswith('http') and not logo_url.startswith('data:'):
        path = logo_url if os.path.isabs(logo_url) else os.path.join(settings.BASE_DIR, logo_url)
        if os.path.isfile(path):
            with open(path, 'rb') as fh:
                ext = os.path.splitext(path)[1].lower().lstrip('.') or 'png'
                return fh.read(), ext.replace('jpg', 'jpeg')

    default_path = os.path.join(settings.BASE_DIR, 'ibbul-logo.png')
    if os.path.isfile(default_path):
        with open(default_path, 'rb') as fh:
            return fh.read(), 'png'
    return None
