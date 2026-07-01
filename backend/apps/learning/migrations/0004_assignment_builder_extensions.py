from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('learning', '0003_secure_assessment_extensions'),
    ]

    operations = [
        migrations.AddField(
            model_name='assignment',
            name='assignment_type',
            field=models.CharField(
                choices=[
                    ('essay', 'Essay'),
                    ('short_answer', 'Short Answer'),
                    ('file_upload', 'File Upload'),
                ],
                default='essay',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='assignment',
            name='allow_resubmission',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='assignment',
            name='resource_attachments',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='assignment',
            name='allowed_file_types',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='assignment',
            name='max_file_size_mb',
            field=models.PositiveIntegerField(default=10),
        ),
        migrations.AddField(
            model_name='assignment',
            name='allow_multiple_files',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='submission',
            name='ai_confidence_score',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True),
        ),
        migrations.AddField(
            model_name='submission',
            name='ai_strengths',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='submission',
            name='ai_weaknesses',
            field=models.JSONField(blank=True, default=list),
        ),
    ]
