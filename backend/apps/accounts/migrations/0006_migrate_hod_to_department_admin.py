# Data migration: map legacy HOD role to DEPARTMENT_ADMIN
from django.db import migrations


def migrate_hod_to_department_admin(apps, schema_editor):
    User = apps.get_model('accounts', 'User')
    User.objects.filter(role='HOD').update(role='DEPARTMENT_ADMIN')


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0005_enterprise_roles_scope_audit'),
    ]

    operations = [
        migrations.RunPython(migrate_hod_to_department_admin, noop),
    ]
