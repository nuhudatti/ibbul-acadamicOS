from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0013_result_soft_delete'),
    ]

    operations = [
        migrations.CreateModel(
            name='DepartmentBorrowedCourse',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('course', models.ForeignKey(help_text='Course owned by another department (or shared catalogue entry)', on_delete=django.db.models.deletion.CASCADE, related_name='borrowed_by_departments', to='academics.course')),
                ('department', models.ForeignKey(help_text='Department that may enter results for this borrowed course', on_delete=django.db.models.deletion.CASCADE, related_name='borrowed_course_links', to='academics.department')),
            ],
            options={
                'verbose_name': 'Borrowed course',
                'verbose_name_plural': 'Borrowed courses',
                'unique_together': {('department', 'course')},
            },
        ),
    ]
