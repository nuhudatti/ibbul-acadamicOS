# Generated for Module 4 — Approval & Publishing: lock results when approved

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0006_upload_batch_file_and_report'),
    ]

    operations = [
        migrations.AddField(
            model_name='result',
            name='is_editable',
            field=models.BooleanField(
                default=True,
                help_text='False when batch is approved; locked for editing',
            ),
        ),
    ]
