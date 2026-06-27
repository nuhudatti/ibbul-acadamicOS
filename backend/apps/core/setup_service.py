"""Enterprise first-run setup — one-time Super Admin creation."""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db import connection, transaction

from apps.accounts.models import UserRole

User = get_user_model()


class SetupAlreadyComplete(Exception):
    pass


def is_setup_required() -> bool:
    """True when no active Super Admin exists (fresh database)."""
    return not User.objects.filter(
        role=UserRole.SUPER_ADMIN,
        is_active=True,
    ).exists()


def database_ok() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


def get_setup_status() -> dict:
    from common.storage.cloudinary_service import is_configured as cloudinary_ok
    from django.conf import settings

    email_ok = bool(
        getattr(settings, 'EMAIL_HOST_USER', '')
        and getattr(settings, 'EMAIL_HOST_PASSWORD', '')
        and 'console' not in (getattr(settings, 'EMAIL_BACKEND', '') or '').lower()
    )
    return {
        'setup_required': is_setup_required(),
        'setup_complete': not is_setup_required(),
        'database_ok': database_ok(),
        'cloudinary_configured': cloudinary_ok(),
        'email_configured': email_ok,
    }


@transaction.atomic
def complete_setup(
    *,
    email: str,
    password: str,
    first_name: str,
    last_name: str,
    platform_name: str = '',
    institution_name: str = '',
    tagline: str = '',
) -> User:
    if not is_setup_required():
        raise SetupAlreadyComplete('Setup has already been completed.')

    email = (email or '').strip().lower()
    if not email:
        raise ValueError('Email is required.')
    if len(password or '') < 8:
        raise ValueError('Password must be at least 8 characters.')
    if User.objects.filter(email__iexact=email).exists():
        raise ValueError('An account with this email already exists.')

    user = User.objects.create_user(
        email=email,
        password=password,
        role=UserRole.SUPER_ADMIN,
        first_name=(first_name or 'Super').strip(),
        last_name=(last_name or 'Admin').strip(),
        is_staff=True,
        is_superuser=True,
        is_active=True,
    )

    if platform_name or institution_name or tagline:
        from apps.core.models import PlatformBranding

        pb = PlatformBranding.load()
        if platform_name:
            pb.platform_name = platform_name.strip()
        if tagline:
            pb.tagline = tagline.strip()
        if institution_name:
            pb.footer_text = institution_name.strip()
        pb.save()

    return user
