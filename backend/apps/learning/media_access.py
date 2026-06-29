"""Signed lesson media access — never expose Cloudinary URLs in API JSON."""
from __future__ import annotations

import hashlib
import hmac
import time

from django.conf import settings

from apps.accounts.models import UserRole
from apps.learning.models import Enrollment, Lesson


def can_access_lesson_media(lesson: Lesson, user) -> bool:
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    if user.role == UserRole.SUPER_ADMIN:
        return True
    if user.role in (UserRole.DEPARTMENT_ADMIN, UserRole.HOD, UserRole.FACULTY_ADMIN):
        return True

    offering = lesson.module.offering
    if user.role == UserRole.EXAMINER:
        return offering.instructor_id == user.id
    if user.role == UserRole.STUDENT:
        if not lesson.is_published and not lesson.is_preview:
            return False
        if lesson.is_preview:
            return offering.is_published
        return Enrollment.objects.filter(
            student=user,
            offering=offering,
            is_active=True,
        ).exists()
    return False


def lesson_media_filename(lesson: Lesson) -> str:
    key = (lesson.file_key or '').strip()
    if key.startswith('http'):
        name = key.rsplit('/', 1)[-1].split('?')[0]
        if name:
            return name
    if key:
        return key.rsplit('/', 1)[-1]
    ext = 'pdf' if lesson.content_type == 'pdf' else 'mp4' if lesson.content_type == 'video' else 'file'
    safe = ''.join(c if c.isalnum() or c in '._- ' else '_' for c in (lesson.title or 'lesson'))
    return f'{safe}.{ext}'


def make_media_token(lesson_id: int, user_id: int, ttl: int = 7200) -> str:
    expires = int(time.time()) + ttl
    payload = f'{lesson_id}:{user_id}:{expires}'
    sig = hmac.new(settings.SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f'{payload}:{sig}'


def verify_media_token(token: str, lesson_id: int) -> int | None:
    if not token:
        return None
    try:
        payload, sig = token.rsplit(':', 1)
        expected = hmac.new(
            settings.SECRET_KEY.encode(),
            payload.encode(),
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return None
        lid, uid, exp = payload.split(':')
        if int(lid) != int(lesson_id) or int(time.time()) > int(exp):
            return None
        return int(uid)
    except (ValueError, TypeError):
        return None
