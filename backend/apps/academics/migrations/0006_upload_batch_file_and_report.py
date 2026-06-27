# Generated for Module 3 — Upload API + background processing

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0005_enterprise_course_assignment_and_batch_progress'),
    ]

    operations = [
        migrations.AddField(
            model_name='resultuploadbatch',
            name='upload_file_path',
            field=models.CharField(blank=True, help_text='Path to uploaded file for background processing', max_length=500, null=True),
        ),
        migrations.AddField(
            model_name='resultuploadbatch',
            name='report_download_token',
            field=models.CharField(blank=True, help_text='One-time token for error report download (TTL)', max_length=64, null=True),
        ),
        migrations.AddField(
            model_name='resultuploadbatch',
            name='report_download_expires_at',
            field=models.DateTimeField(blank=True, help_text='When the error report download link expires', null=True),
        ),
    ]
