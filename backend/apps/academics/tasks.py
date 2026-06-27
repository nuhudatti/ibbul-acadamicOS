"""
Module 3 — Celery tasks for background result upload processing.
"""
import logging
from celery import shared_task
from django.conf import settings

logger = logging.getLogger(__name__)


@shared_task(bind=True, name='academics.process_upload_batch')
def process_upload_batch_task(self, batch_id: int):
    """
    Process ResultUploadBatch from stored file: chunked CSV/Excel, validate rows,
    create Result, ResultRow errors, update progress; generate failed_rows CSV,
    one-time TTL download token; AuditLog.
    """
    from apps.academics.services import ResultUploadService
    from apps.academics.models import ResultUploadBatch
    from apps.accounts.audit import log_audit
    from apps.accounts.models import AuditLog

    try:
        batch = ResultUploadService.process_upload_batch_from_file(batch_id)
        log_audit(
            AuditLog.Action.RESULT_UPLOAD_COMPLETED,
            user=batch.uploaded_by,
            identifier=batch.filename,
            extra={
                'batch_id': batch.id,
                'success_count': batch.success_count,
                'error_count': batch.error_count,
                'filename': batch.filename,
            },
        )
        return {'batch_id': batch.id, 'status': batch.status, 'success_count': batch.success_count, 'error_count': batch.error_count}
    except Exception as e:
        logger.exception('process_upload_batch_task failed: batch_id=%s', batch_id)
        try:
            ResultUploadBatch.objects.filter(pk=batch_id).update(status=ResultUploadBatch.Status.FAILED)
        except Exception:
            pass
        raise
