# Generated migration for Result soft delete fields

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0012_add_semester_summary_upload_batch'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='result',
            name='is_deleted',
            field=models.BooleanField(db_index=True, default=False, help_text='Soft delete — hidden from HOD/student views when True'),
        ),
        migrations.AddField(
            model_name='result',
            name='deleted_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='result',
            name='deleted_by',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='deleted_results',
                to=settings.AUTH_USER_MODEL,
                help_text='HOD who soft-deleted this result',
            ),
        ),
    ]
