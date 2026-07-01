# Generated migration — performance indexes for learning + results

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('learning', '0004_assignment_builder_extensions'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='enrollment',
            index=models.Index(fields=['offering', 'is_active'], name='learning_enr_off_act_idx'),
        ),
        migrations.AddIndex(
            model_name='enrollment',
            index=models.Index(fields=['student', 'is_active'], name='learning_enr_stu_act_idx'),
        ),
        migrations.AddIndex(
            model_name='lessonprogress',
            index=models.Index(fields=['student', 'completed'], name='learning_lp_stu_done_idx'),
        ),
        migrations.AddIndex(
            model_name='lessonprogress',
            index=models.Index(fields=['lesson', 'student'], name='learning_lp_les_stu_idx'),
        ),
        migrations.AddIndex(
            model_name='quizattempt',
            index=models.Index(fields=['quiz', 'student', 'status'], name='learning_qa_q_st_stat_idx'),
        ),
        migrations.AddIndex(
            model_name='submission',
            index=models.Index(fields=['assignment', 'student'], name='learning_sub_asg_stu_idx'),
        ),
        migrations.AddIndex(
            model_name='submission',
            index=models.Index(fields=['assignment', 'graded_at'], name='learning_sub_asg_grad_idx'),
        ),
        migrations.AddIndex(
            model_name='lesson',
            index=models.Index(fields=['module', 'content_type', 'is_published'], name='learning_les_mod_ct_pub_idx'),
        ),
        migrations.AddIndex(
            model_name='lmsoffering',
            index=models.Index(fields=['instructor', 'is_published'], name='learning_off_inst_pub_idx'),
        ),
    ]
