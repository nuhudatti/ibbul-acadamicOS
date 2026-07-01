# Generated migration — secure assessment, short answers, similarity, AI grading flags

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('learning', '0002_lmsoffering_enrollment_pin'),
    ]

    operations = [
        migrations.AddField(
            model_name='quiz',
            name='secure_mode_enabled',
            field=models.BooleanField(default=True, help_text='Enable secure assessment mode for this quiz'),
        ),
        migrations.AddField(
            model_name='quiz',
            name='max_violations',
            field=models.PositiveIntegerField(default=3, help_text='Violations before auto-submit (tab switch, fullscreen exit, etc.)'),
        ),
        migrations.AddField(
            model_name='quiz',
            name='auto_submit_on_violations',
            field=models.BooleanField(default=True, help_text='Auto-submit when max violations reached'),
        ),
        migrations.AddField(
            model_name='quizquestion',
            name='question_type',
            field=models.CharField(
                choices=[('mcq', 'Multiple Choice'), ('short_answer', 'Short Answer')],
                default='mcq',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='quizquestion',
            name='model_answer',
            field=models.TextField(blank=True, help_text='Reference answer for short-answer auto/similarity grading'),
        ),
        migrations.AddField(
            model_name='quizattempt',
            name='violation_log',
            field=models.JSONField(default=list, help_text='List of secure-mode violation events'),
        ),
        migrations.AddField(
            model_name='quizattempt',
            name='auto_submitted',
            field=models.BooleanField(default=False, help_text='True if auto-submitted by timeout or violations'),
        ),
        migrations.AddField(
            model_name='assignment',
            name='enable_ai_grading',
            field=models.BooleanField(default=False, help_text='Allow AI-assisted grading suggestions for lecturer'),
        ),
        migrations.AddField(
            model_name='assignment',
            name='similarity_check_enabled',
            field=models.BooleanField(default=True, help_text='Run plagiarism/similarity check on submit'),
        ),
        migrations.AddField(
            model_name='assignment',
            name='rubric',
            field=models.TextField(blank=True, help_text='Grading rubric for AI-assisted grading'),
        ),
        migrations.AddField(
            model_name='submission',
            name='similarity_score',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True),
        ),
        migrations.AddField(
            model_name='submission',
            name='similarity_report',
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name='submission',
            name='ai_suggested_score',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True),
        ),
        migrations.AddField(
            model_name='submission',
            name='ai_feedback',
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name='submission',
            name='ai_graded',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='submission',
            name='violation_log',
            field=models.JSONField(default=list),
        ),
    ]
