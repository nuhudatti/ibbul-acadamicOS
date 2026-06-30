"""
Module 8 — Health check and metrics endpoints for monitoring.
Production-grade: system health, database connectivity, Celery status, basic metrics.
"""
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.db import connection
from django.core.cache import cache
from django.conf import settings
from django.utils import timezone
from datetime import timedelta

from .models import User, AuditLog
from apps.academics.models import Result, ResultUploadBatch


@api_view(['GET', 'HEAD'])
@permission_classes([AllowAny])
def health_check_view(request):
    """
    GET /health — JSON keep-alive probe.
    HEAD /health — empty 200 for UptimeRobot and similar monitors.
    """
    if request.method == 'HEAD':
        return Response(status=status.HTTP_200_OK)
    return Response({
        'status': 'ok',
        'service': 'IBBUL Academic OS',
        'timestamp': timezone.now().isoformat(),
    }, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([AllowAny])
def health_deep_check_view(request):
    """
    GET /health/deep
    Optional deep health check with database, cache, and Celery probes.
    """
    health_status = {
        'status': 'healthy',
        'timestamp': timezone.now().isoformat(),
        'checks': {},
    }
    all_healthy = True

    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
            health_status['checks']['database'] = 'ok'
    except Exception as e:
        health_status['checks']['database'] = f'error: {str(e)}'
        all_healthy = False

    try:
        cache.set('health_check', 'ok', 10)
        if cache.get('health_check') == 'ok':
            health_status['checks']['cache'] = 'ok'
        else:
            health_status['checks']['cache'] = 'error: cache not responding'
            all_healthy = False
    except Exception as e:
        health_status['checks']['cache'] = f'error: {str(e)}'
        all_healthy = False

    celery_broker = getattr(settings, 'CELERY_BROKER_URL', '')
    if celery_broker:
        try:
            from celery import current_app
            inspect = current_app.control.inspect()
            stats = inspect.stats()
            if stats:
                health_status['checks']['celery'] = 'ok'
            else:
                health_status['checks']['celery'] = 'warning: no workers connected'
        except Exception as e:
            health_status['checks']['celery'] = f'warning: {str(e)}'
    else:
        health_status['checks']['celery'] = 'not_configured'

    if not all_healthy:
        health_status['status'] = 'degraded'

    http_status = status.HTTP_503_SERVICE_UNAVAILABLE if not all_healthy else status.HTTP_200_OK
    return Response(health_status, status=http_status)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def metrics_view(request):
    """
    GET /metrics
    Staff-only metrics endpoint (basic system stats).
    Returns counts, recent activity, task queue status.
    """
    user = request.user
    if not user.is_staff:
        return Response(
            {'detail': 'Only staff can access metrics.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    now = timezone.now()
    last_24h = now - timedelta(hours=24)
    last_7d = now - timedelta(days=7)

    metrics = {
        'timestamp': now.isoformat(),
        'users': {
            'total': User.objects.count(),
            'students': User.objects.filter(role='STUDENT').count(),
            'staff': User.objects.exclude(role='STUDENT').count(),
            'active': User.objects.filter(is_active=True).count(),
            'never_logged_in': User.objects.filter(last_login__isnull=True).count(),
        },
        'results': {
            'total': Result.objects.count(),
            'approved': Result.objects.filter(status='APPROVED').count(),
            'pending': Result.objects.filter(status='PENDING').count(),
            'created_last_24h': Result.objects.filter(created_at__gte=last_24h).count(),
        },
        'upload_batches': {
            'total': ResultUploadBatch.objects.count(),
            'completed': ResultUploadBatch.objects.filter(status='COMPLETED').count(),
            'failed': ResultUploadBatch.objects.filter(status='FAILED').count(),
            'processing': ResultUploadBatch.objects.filter(status='PROCESSING').count(),
        },
        'audit_logs': {
            'total': AuditLog.objects.count(),
            'last_24h': AuditLog.objects.filter(created_at__gte=last_24h).count(),
            'last_7d': AuditLog.objects.filter(created_at__gte=last_7d).count(),
        },
    }

    # Celery task queue status (if configured)
    celery_broker = getattr(settings, 'CELERY_BROKER_URL', '')
    if celery_broker:
        try:
            from celery import current_app
            inspect = current_app.control.inspect()
            active = inspect.active()
            scheduled = inspect.scheduled()
            reserved = inspect.reserved()
            stats = inspect.stats()

            metrics['celery'] = {
                'workers_connected': len(stats) if stats else 0,
                'active_tasks': sum(len(tasks) for tasks in (active or {}).values()),
                'scheduled_tasks': sum(len(tasks) for tasks in (scheduled or {}).values()),
                'reserved_tasks': sum(len(tasks) for tasks in (reserved or {}).values()),
            }
        except Exception as e:
            metrics['celery'] = {'error': str(e)}
    else:
        metrics['celery'] = {'status': 'not_configured'}

    return Response(metrics, status=status.HTTP_200_OK)
