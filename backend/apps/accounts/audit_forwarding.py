"""
Audit Forwarding System
Real-time webhook + email forwarding to SuperAdmin
Daily digest generation with CSV attachment
"""
import json
import csv
from io import StringIO
from typing import List, Dict, Optional
from django.conf import settings
from django.utils import timezone
from django.core.mail import send_mail
from django.db.models import Q
from datetime import timedelta

try:
    import requests
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False

try:
    from celery import shared_task
    CELERY_AVAILABLE = True
except ImportError:
    CELERY_AVAILABLE = False
    # Fallback decorator if Celery not available
    def shared_task(*args, **kwargs):
        def decorator(func):
            return func
        return decorator

from .models import AuditLog, User, UserRole
from apps.academics.models import AuditForwardingLog


# Configuration (can be moved to settings.py)
SUPERADMIN_WEBHOOK_URL = getattr(settings, 'SUPERADMIN_WEBHOOK_URL', '')
SUPERADMIN_EMAIL = getattr(settings, 'SUPERADMIN_EMAIL', 'admin@ibbul.edu.ng')
AUDIT_FORWARDING_ENABLED = getattr(settings, 'AUDIT_FORWARDING_ENABLED', True)
WEBHOOK_RETRY_MAX_ATTEMPTS = 3
WEBHOOK_RETRY_BACKOFF_SECONDS = [60, 300, 900]  # 1min, 5min, 15min


def forward_audit_to_superadmin(audit_log: AuditLog, event_type: str = 'WEBHOOK') -> bool:
    """
    Forward audit log to SuperAdmin via webhook and/or email.
    Returns True if successful, False otherwise.
    """
    if not AUDIT_FORWARDING_ENABLED:
        return False
    
    # Critical events that should be forwarded
    critical_events = [
        AuditLog.Action.RESULT_UPLOAD_COMPLETED,
        AuditLog.Action.RESULT_BATCH_APPROVED,
        AuditLog.Action.RESULT_BATCH_REJECTED,
        AuditLog.Action.LOCKED_PUBLISHED,
        AuditLog.Action.EMERGENCY_UNLOCK,
    ]
    
    if audit_log.action not in critical_events:
        return True  # Not a critical event, skip forwarding
    
    # Prepare payload
    payload = {
        'audit_log_id': audit_log.id,
        'action': audit_log.action,
        'action_display': audit_log.get_action_display(),
        'user': {
            'id': audit_log.user.id if audit_log.user else None,
            'email': audit_log.user.email if audit_log.user else None,
            'role': audit_log.actor_role,
        } if audit_log.user else None,
        'identifier': audit_log.identifier,
        'ip_address': audit_log.ip_address,
        'user_agent': audit_log.user_agent,
        'scope_faculty': audit_log.scope_faculty.name if audit_log.scope_faculty else None,
        'scope_department': audit_log.scope_department.name if audit_log.scope_department else None,
        'extra': audit_log.extra,
        'created_at': audit_log.created_at.isoformat(),
    }
    
    success = True
    
    # Forward via webhook
    if SUPERADMIN_WEBHOOK_URL and event_type == 'WEBHOOK':
        webhook_success = forward_webhook(SUPERADMIN_WEBHOOK_URL, payload, audit_log)
        if not webhook_success:
            success = False
    
    # Forward via email (for critical events)
    if SUPERADMIN_EMAIL and event_type == 'EMAIL':
        email_success = forward_email(audit_log, payload)
        if not email_success:
            success = False
    
    return success


def forward_webhook(url: str, payload: Dict, audit_log: AuditLog) -> bool:
    """Forward payload to webhook URL with retry logic."""
    if not REQUESTS_AVAILABLE:
        return False
    
    forwarding_log = AuditForwardingLog.objects.create(
        audit_log=audit_log,
        forwarding_type='WEBHOOK',
        status=AuditForwardingLog.Status.PENDING,
        endpoint_url=url,
        payload=payload,
    )
    
    for attempt in range(WEBHOOK_RETRY_MAX_ATTEMPTS):
        try:
            response = requests.post(
                url,
                json=payload,
                headers={'Content-Type': 'application/json'},
                timeout=10
            )
            
            forwarding_log.response_status = response.status_code
            forwarding_log.response_body = response.text[:1000]  # Limit size
            
            if response.status_code == 200:
                forwarding_log.status = AuditForwardingLog.Status.SENT
                forwarding_log.sent_at = timezone.now()
                forwarding_log.save()
                return True
            else:
                forwarding_log.error_message = f'HTTP {response.status_code}: {response.text[:500]}'
                forwarding_log.status = AuditForwardingLog.Status.FAILED
                forwarding_log.retry_count = attempt + 1
                
                if attempt < WEBHOOK_RETRY_MAX_ATTEMPTS - 1:
                    forwarding_log.status = AuditForwardingLog.Status.RETRYING
                    forwarding_log.next_retry_at = timezone.now() + timedelta(
                        seconds=WEBHOOK_RETRY_BACKOFF_SECONDS[attempt]
                    )
                
                forwarding_log.save()
        
        except Exception as e:
            forwarding_log.error_message = str(e)[:500]
            forwarding_log.status = AuditForwardingLog.Status.FAILED
            forwarding_log.retry_count = attempt + 1
            
            if attempt < WEBHOOK_RETRY_MAX_ATTEMPTS - 1:
                forwarding_log.status = AuditForwardingLog.Status.RETRYING
                forwarding_log.next_retry_at = timezone.now() + timedelta(
                    seconds=WEBHOOK_RETRY_BACKOFF_SECONDS[attempt]
                )
            
            forwarding_log.save()
    
    return False


def forward_email(audit_log: AuditLog, payload: Dict) -> bool:
    """Send email notification to SuperAdmin."""
    forwarding_log = AuditForwardingLog.objects.create(
        audit_log=audit_log,
        forwarding_type='EMAIL',
        status=AuditForwardingLog.Status.PENDING,
        payload=payload,
    )
    
    try:
        subject = f'[IBBUL Result System] {audit_log.get_action_display()}'
        
        message = f"""
Critical audit event detected:

Action: {audit_log.get_action_display()}
User: {audit_log.user.email if audit_log.user else 'System'}
Role: {audit_log.actor_role}
Identifier: {audit_log.identifier}
IP Address: {audit_log.ip_address}
Time: {audit_log.created_at}

Details:
{json.dumps(payload.get('extra', {}), indent=2)}

---
This is an automated notification from IBBUL Result Management System.
"""
        
        send_mail(
            subject,
            message,
            settings.DEFAULT_FROM_EMAIL,
            [SUPERADMIN_EMAIL],
            fail_silently=False,
        )
        
        forwarding_log.status = AuditForwardingLog.Status.SENT
        forwarding_log.sent_at = timezone.now()
        forwarding_log.save()
        return True
    
    except Exception as e:
        forwarding_log.status = AuditForwardingLog.Status.FAILED
        forwarding_log.error_message = str(e)[:500]
        forwarding_log.save()
        return False


def generate_daily_audit_digest():
    """
    Generate daily audit digest CSV and email to SuperAdmin.
    Runs daily via Celery Beat.
    """
    if not AUDIT_FORWARDING_ENABLED or not SUPERADMIN_EMAIL:
        return
    
    yesterday = timezone.now() - timedelta(days=1)
    start_of_day = yesterday.replace(hour=0, minute=0, second=0, microsecond=0)
    end_of_day = yesterday.replace(hour=23, minute=59, second=59, microsecond=999999)
    
    # Get audit logs from yesterday
    audit_logs = AuditLog.objects.filter(
        created_at__gte=start_of_day,
        created_at__lte=end_of_day
    ).order_by('-created_at')
    
    if not audit_logs.exists():
        return  # No logs to digest
    
    # Generate CSV
    csv_buffer = StringIO()
    writer = csv.writer(csv_buffer)
    writer.writerow([
        'ID', 'Action', 'User', 'Role', 'Identifier', 'IP Address',
        'Scope Faculty', 'Scope Department', 'Created At', 'Extra'
    ])
    
    for log in audit_logs:
        writer.writerow([
            log.id,
            log.get_action_display(),
            log.user.email if log.user else 'System',
            log.actor_role,
            log.identifier,
            log.ip_address or '',
            log.scope_faculty.name if log.scope_faculty else '',
            log.scope_department.name if log.scope_department else '',
            log.created_at.isoformat(),
            json.dumps(log.extra) if log.extra else '',
        ])
    
    csv_content = csv_buffer.getvalue()
    
    # Email digest
    subject = f'[IBBUL Result System] Daily Audit Digest - {yesterday.date()}'
    message = f"""
Daily audit digest for {yesterday.date()}

Total events: {audit_logs.count()}

Summary:
- Uploads: {audit_logs.filter(action=AuditLog.Action.RESULT_UPLOAD_COMPLETED).count()}
- Approvals: {audit_logs.filter(action=AuditLog.Action.RESULT_BATCH_APPROVED).count()}
- Rejections: {audit_logs.filter(action=AuditLog.Action.RESULT_BATCH_REJECTED).count()}

See attached CSV for full details.
"""
    
    try:
        from django.core.mail import EmailMessage
        email = EmailMessage(
            subject,
            message,
            settings.DEFAULT_FROM_EMAIL,
            [SUPERADMIN_EMAIL],
        )
        email.attach(
            f'audit_digest_{yesterday.date()}.csv',
            csv_content,
            'text/csv'
        )
        email.send()
        
        # Create forwarding log
        AuditForwardingLog.objects.create(
            audit_log=audit_logs.first(),  # Reference first log
            forwarding_type='DAILY_DIGEST',
            status=AuditForwardingLog.Status.SENT,
            sent_at=timezone.now(),
            payload={'date': yesterday.date().isoformat(), 'count': audit_logs.count()},
        )
        
        return {'sent': True, 'count': audit_logs.count()}
    
    except Exception as e:
        return {'sent': False, 'error': str(e)}


def retry_failed_audit_forwards():
    """
    Retry failed audit forwarding attempts.
    Runs periodically via Celery Beat.
    """
    failed_forwards = AuditForwardingLog.objects.filter(
        status=AuditForwardingLog.Status.FAILED,
        retry_count__lt=WEBHOOK_RETRY_MAX_ATTEMPTS,
        next_retry_at__lte=timezone.now()
    )
    
    retried_count = 0
    for forwarding_log in failed_forwards:
        if forwarding_log.forwarding_type == 'WEBHOOK' and forwarding_log.endpoint_url:
            success = forward_webhook(
                forwarding_log.endpoint_url,
                forwarding_log.payload,
                forwarding_log.audit_log
            )
            if success:
                retried_count += 1
    
    return {'retried': retried_count}


# Register as Celery tasks if available
if CELERY_AVAILABLE:
    generate_daily_audit_digest = shared_task(name='accounts.generate_daily_audit_digest')(generate_daily_audit_digest)
    retry_failed_audit_forwards = shared_task(name='accounts.retry_failed_audit_forwards')(retry_failed_audit_forwards)
