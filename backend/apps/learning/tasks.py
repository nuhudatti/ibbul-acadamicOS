"""Background tasks for learning module — AI bulk grading and Excel export."""
import io
import logging
import uuid

from django.core.cache import cache

logger = logging.getLogger(__name__)

JOB_TTL = 3600


def _job_key(job_id: str) -> str:
    return f'lms_job_{job_id}'


def create_job(job_type: str, total: int = 0) -> str:
    job_id = str(uuid.uuid4())
    cache.set(_job_key(job_id), {
        'type': job_type,
        'status': 'queued',
        'processed': 0,
        'total': total,
        'error': None,
        'result': None,
    }, timeout=JOB_TTL)
    return job_id


def update_job(job_id: str, **fields) -> None:
    key = _job_key(job_id)
    data = cache.get(key) or {}
    data.update(fields)
    cache.set(key, data, timeout=JOB_TTL)


def get_job(job_id: str) -> dict | None:
    return cache.get(_job_key(job_id))


def run_ai_bulk_job(job_id: str, assignment_id: int) -> None:
    from apps.learning.models import Assignment, Submission
    from apps.learning.views import _run_ai_suggestion

    update_job(job_id, status='running')
    try:
        assignment = Assignment.objects.select_related(
            'lesson__module__offering__course', 'lesson__module__offering__instructor'
        ).get(pk=assignment_id)
        subs = list(
            assignment.submissions.filter(score__isnull=True).exclude(content='').select_related('student')
        )
        update_job(job_id, total=len(subs))
        processed = 0
        errors = []
        for i, sub in enumerate(subs, 1):
            ok, result = _run_ai_suggestion(assignment, sub)
            if ok:
                processed += 1
            else:
                errors.append({'student_id': sub.student_id, 'error': result.get('error', 'failed')})
            update_job(job_id, processed=i, errors=errors)
        from apps.learning.cache_utils import invalidate_offering_cache_from_assignment
        invalidate_offering_cache_from_assignment(assignment)
        update_job(job_id, status='complete', processed=processed, result={
            'processed': processed,
            'total_pending': len(subs),
            'errors': errors,
        })
    except Exception as exc:
        logger.exception('AI bulk job failed')
        update_job(job_id, status='failed', error=str(exc)[:300])


def run_export_job(job_id: str, offering_id: int, user_id: int) -> None:
    from django.test import RequestFactory
    from apps.accounts.models import User
    from apps.learning import engine_views

    update_job(job_id, status='running', total=1)
    try:
        user = User.objects.get(pk=user_id)
        factory = RequestFactory()
        request = factory.get(f'/api/learning/offerings/{offering_id}/grade-sheet/')
        request.user = user
        response = engine_views.export_grade_sheet(request, offering_id)
        if response.status_code != 200:
            update_job(job_id, status='failed', error='Export failed')
            return
        import base64
        payload = base64.b64encode(response.content).decode('ascii')
        filename = response.get('Content-Disposition', 'attachment; filename="grade_sheet.xlsx"')
        update_job(job_id, status='complete', processed=1, result={
            'filename': filename,
            'data_base64': payload,
        })
    except Exception as exc:
        logger.exception('Export job failed')
        update_job(job_id, status='failed', error=str(exc)[:300])


try:
    from celery import shared_task

    @shared_task
    def ai_bulk_grade_task(job_id: str, assignment_id: int):
        run_ai_bulk_job(job_id, assignment_id)

    @shared_task
    def export_grade_sheet_task(job_id: str, offering_id: int, user_id: int):
        run_export_job(job_id, offering_id, user_id)

    CELERY_AVAILABLE = True
except ImportError:
    CELERY_AVAILABLE = False


def enqueue_ai_bulk(job_id: str, assignment_id: int) -> bool:
    if CELERY_AVAILABLE:
        try:
            from django.conf import settings
            broker = getattr(settings, 'CELERY_BROKER_URL', '') or ''
            if broker:
                ai_bulk_grade_task.delay(job_id, assignment_id)
                return True
        except Exception:
            pass
    import threading
    threading.Thread(target=run_ai_bulk_job, args=(job_id, assignment_id), daemon=True).start()
    return False


def enqueue_export(job_id: str, offering_id: int, user_id: int) -> bool:
    if CELERY_AVAILABLE:
        try:
            from django.conf import settings
            broker = getattr(settings, 'CELERY_BROKER_URL', '') or ''
            if broker:
                export_grade_sheet_task.delay(job_id, offering_id, user_id)
                return True
        except Exception:
            pass
    import threading
    threading.Thread(target=run_export_job, args=(job_id, offering_id, user_id), daemon=True).start()
    return False
