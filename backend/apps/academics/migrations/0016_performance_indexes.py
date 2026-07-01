from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0015_alter_result_status'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='result',
            index=models.Index(
                fields=['status', 'is_deleted', 'session'],
                name='academics_res_stat_del_sess_idx',
            ),
        ),
        migrations.AddIndex(
            model_name='result',
            index=models.Index(fields=['student', 'session', 'semester'], name='academics_res_stu_sess_sem_idx'),
        ),
        migrations.AddIndex(
            model_name='result',
            index=models.Index(fields=['course', 'session', 'semester'], name='academics_res_crs_sess_sem_idx'),
        ),
        migrations.AddIndex(
            model_name='result',
            index=models.Index(fields=['-created_at'], name='academics_res_created_desc_idx'),
        ),
    ]
