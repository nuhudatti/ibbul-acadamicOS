"""
Module 8 — Celery configuration for background task processing.
Production-grade: Redis broker, result backend, task routing, monitoring.
"""
import os
from celery import Celery
from celery.schedules import crontab

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

app = Celery('ibbul_result_checker')
app.config_from_object('django.conf:settings', namespace='CELERY')

# Module 8: Task routing and queues
app.conf.task_routes = {
    'academics.process_upload_batch': {'queue': 'uploads'},
    'academics.*': {'queue': 'default'},
}

# Module 8: Task result backend (Redis)
app.conf.result_backend = os.getenv('CELERY_RESULT_BACKEND', os.getenv('CELERY_BROKER_URL', ''))

# Module 8: Task execution settings
app.conf.task_acks_late = True  # Acknowledge after task completion
app.conf.task_reject_on_worker_lost = True  # Re-queue if worker dies
app.conf.worker_prefetch_multiplier = 1  # One task per worker at a time
app.conf.task_time_limit = 3600  # Hard limit: 1 hour
app.conf.task_soft_time_limit = 3300  # Soft limit: 55 minutes (allows cleanup)

# Module 8: Task retry settings
app.conf.task_default_retry_delay = 60  # 1 minute
app.conf.task_max_retries = 3

# Module 8: Beat schedule (periodic tasks)
app.conf.beat_schedule = {
    'cleanup-expired-sessions': {
        'task': 'apps.accounts.tasks.cleanup_expired_sessions',
        'schedule': crontab(hour=2, minute=0),  # Daily at 2 AM
    },
    'cleanup-old-audit-logs': {
        'task': 'apps.accounts.tasks.archive_old_audit_logs',
        'schedule': crontab(hour=3, minute=0, day_of_month=1),  # Monthly on 1st at 3 AM
    },
    # HOD Module: Audit forwarding tasks
    'generate-daily-audit-digest': {
        'task': 'apps.accounts.audit_forwarding.generate_daily_audit_digest',
        'schedule': crontab(hour=6, minute=0),  # Daily at 6 AM
    },
    'retry-failed-audit-forwards': {
        'task': 'apps.accounts.audit_forwarding.retry_failed_audit_forwards',
        'schedule': crontab(minute='*/15'),  # Every 15 minutes
    },
}

app.autodiscover_tasks()


@app.task(bind=True, name='config.debug_task')
def debug_task(self):
    """Debug task for testing Celery connectivity."""
    return {'status': 'ok', 'request': str(self.request)}
