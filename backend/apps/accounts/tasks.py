"""
Module 8 — Periodic Celery tasks for maintenance and cleanup.
"""
from celery import shared_task
from django.utils import timezone
from datetime import timedelta
from django.contrib.sessions.models import Session
import logging

logger = logging.getLogger(__name__)


@shared_task(name='apps.accounts.tasks.cleanup_expired_sessions')
def cleanup_expired_sessions():
    """Clean up expired Django sessions (runs daily)."""
    try:
        expired = Session.objects.filter(expire_date__lt=timezone.now())
        count = expired.count()
        expired.delete()
        logger.info(f'Cleaned up {count} expired sessions')
        return {'deleted': count}
    except Exception as e:
        logger.exception('Session cleanup failed: %s', e)
        raise


@shared_task(name='apps.accounts.tasks.archive_old_audit_logs')
def archive_old_audit_logs():
    """
    Archive audit logs older than 1 year to AuditLogDeletion (runs monthly).
    Only SUPER_ADMIN can delete logs via API; this is automated archival.
    """
    try:
        from .models import AuditLog, AuditLogDeletion
        cutoff = timezone.now() - timedelta(days=365)
        old_logs = AuditLog.objects.filter(created_at__lt=cutoff)
        count = old_logs.count()
        if count > 0:
            for log in old_logs:
                AuditLogDeletion.objects.create(
                    original_id=log.id,
                    user_id=log.user_id,
                    action=log.action,
                    identifier=log.identifier,
                    actor_role=log.actor_role,
                    ip_address=log.ip_address,
                    user_agent=log.user_agent,
                    scope_faculty_id=log.scope_faculty_id,
                    scope_department_id=log.scope_department_id,
                    extra=log.extra,
                )
            old_logs.delete()
            logger.info(f'Archived {count} old audit logs')
        return {'archived': count}
    except Exception as e:
        logger.exception('Audit log archival failed: %s', e)
        raise
