# Generated migration for StaffInvitation

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0012_add_semester_summary_upload_batch'),
        ('accounts', '0009_user_module_access_user_phone_number_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='StaffInvitation',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('email', models.EmailField(db_index=True, max_length=254)),
                ('first_name', models.CharField(max_length=150)),
                ('last_name', models.CharField(max_length=150)),
                ('role', models.CharField(choices=[('SUPER_ADMIN', 'Super Admin (ICT/Registrar)'), ('FACULTY_ADMIN', 'Faculty Admin (Dean)'), ('DEPARTMENT_ADMIN', 'Department Admin (HOD)'), ('EXAMINER', 'Examiner (Lecturer)'), ('STUDENT', 'Student'), ('HOD', 'Head of Department (legacy)')], max_length=30)),
                ('token', models.CharField(db_index=True, max_length=64, unique=True)),
                ('status', models.CharField(choices=[('PENDING', 'Pending'), ('SENT', 'Sent'), ('ACCEPTED', 'Accepted'), ('EXPIRED', 'Expired'), ('REVOKED', 'Revoked'), ('FAILED', 'Delivery failed')], db_index=True, default='PENDING', max_length=20)),
                ('delivery_status', models.CharField(choices=[('QUEUED', 'Queued'), ('SENT', 'Sent to inbox'), ('FAILED', 'Failed')], default='QUEUED', max_length=20)),
                ('delivery_error', models.CharField(blank=True, max_length=500)),
                ('send_count', models.PositiveIntegerField(default=0)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('sent_at', models.DateTimeField(blank=True, null=True)),
                ('accepted_at', models.DateTimeField(blank=True, null=True)),
                ('expires_at', models.DateTimeField(db_index=True)),
                ('last_sent_at', models.DateTimeField(blank=True, null=True)),
                ('department', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='staff_invitations', to='academics.department')),
                ('faculty', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='staff_invitations', to='academics.faculty')),
                ('invited_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='sent_invitations', to=settings.AUTH_USER_MODEL)),
                ('user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='staff_invitation', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'staff_invitations',
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='staffinvitation',
            index=models.Index(fields=['email', 'status'], name='staff_invit_email_status_idx'),
        ),
        migrations.AddIndex(
            model_name='staffinvitation',
            index=models.Index(fields=['role', 'status'], name='staff_invit_role_status_idx'),
        ),
    ]
