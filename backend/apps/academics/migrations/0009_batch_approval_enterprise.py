# Enterprise: batch-level approval (approve/reject entire upload batch)

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0008_enhance_hod_module'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='resultuploadbatch',
            name='approval_status',
            field=models.CharField(
                choices=[
                    ('PENDING_APPROVAL', 'Pending HOD approval'),
                    ('APPROVED', 'Approved'),
                    ('REJECTED', 'Rejected'),
                ],
                db_index=True,
                default='PENDING_APPROVAL',
                help_text='HOD approval: pending, approved, or rejected for the entire batch',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='resultuploadbatch',
            name='approved_by',
            field=models.ForeignKey(
                blank=True,
                help_text='HOD who approved or rejected this batch',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='approved_upload_batches',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name='resultuploadbatch',
            name='approved_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='resultuploadbatch',
            name='rejection_reason',
            field=models.TextField(
                blank=True,
                help_text='Reason for rejection (if batch rejected)',
            ),
        ),
    ]
