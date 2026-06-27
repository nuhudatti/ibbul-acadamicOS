# Add OUTSTANDING COURSES and REMARKS to SemesterSummary (exact from file)

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0009_batch_approval_enterprise'),
    ]

    operations = [
        migrations.AddField(
            model_name='semestersummary',
            name='outstanding_courses',
            field=models.CharField(blank=True, help_text='OUTSTANDING COURSES from file', max_length=255),
        ),
        migrations.AddField(
            model_name='semestersummary',
            name='remarks',
            field=models.CharField(blank=True, help_text='REMARKS from file', max_length=255),
        ),
    ]
