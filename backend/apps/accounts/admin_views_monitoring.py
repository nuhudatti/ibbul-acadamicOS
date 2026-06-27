"""
Module 8 — Admin job dashboard for monitoring Celery tasks.
Shows queued/running/failed tasks with retry capability.
"""
from django.contrib.admin.views.decorators import staff_member_required
from django.shortcuts import render
from django.contrib import admin
from django.http import HttpRequest, HttpResponse
from django.contrib import messages
from django.conf import settings
from django.utils import timezone
from datetime import timedelta

from apps.academics.models import ResultUploadBatch


@staff_member_required
def job_dashboard_view(request: HttpRequest) -> HttpResponse:
    """
    Admin job dashboard: monitor Celery tasks (queued/running/failed), retry failed tasks.
    GET: show dashboard with task status.
    POST: retry failed upload batch.
    """
    celery_broker = getattr(settings, 'CELERY_BROKER_URL', '')
    celery_configured = bool(celery_broker)

    # Get Celery task status
    active_tasks = []
    scheduled_tasks = []
    reserved_tasks = []
    failed_tasks = []
    worker_stats = {}

    if celery_configured:
        try:
            from celery import current_app
            inspect = current_app.control.inspect()

            active = inspect.active()
            scheduled = inspect.scheduled()
            reserved = inspect.reserved()
            stats = inspect.stats()
            registered = inspect.registered()

            if active:
                for worker, tasks in active.items():
                    active_tasks.extend([{**t, 'worker': worker} for t in tasks])
            if scheduled:
                for worker, tasks in scheduled.items():
                    scheduled_tasks.extend([{**t, 'worker': worker} for t in tasks])
            if reserved:
                for worker, tasks in reserved.items():
                    reserved_tasks.extend([{**t, 'worker': worker} for t in tasks])
            if stats:
                worker_stats = stats
        except Exception as e:
            messages.warning(request, f'Could not connect to Celery: {e}')

    # Get recent upload batches (for retry UI)
    recent_batches = ResultUploadBatch.objects.order_by('-created_at')[:50]

    # Retry failed batch
    if request.method == 'POST' and request.POST.get('action') == 'retry':
        batch_id = request.POST.get('batch_id')
        if batch_id:
            try:
                batch = ResultUploadBatch.objects.get(pk=batch_id)
                if batch.status == ResultUploadBatch.Status.FAILED:
                    from apps.academics.tasks import process_upload_batch_task
                    process_upload_batch_task.delay(batch.id)
                    messages.success(request, f'Retrying batch {batch.id}...')
                else:
                    messages.warning(request, f'Batch {batch.id} is not in FAILED status.')
            except ResultUploadBatch.DoesNotExist:
                messages.error(request, 'Batch not found.')
            except Exception as e:
                messages.error(request, f'Retry failed: {e}')

    context = {
        **admin.site.each_context(request),
        'title': 'Job Dashboard',
        'celery_configured': celery_configured,
        'celery_broker': celery_broker if celery_configured else None,
        'active_tasks': active_tasks,
        'scheduled_tasks': scheduled_tasks,
        'reserved_tasks': reserved_tasks,
        'worker_stats': worker_stats,
        'recent_batches': recent_batches,
    }
    return render(request, 'admin/accounts/job_dashboard.html', context)
