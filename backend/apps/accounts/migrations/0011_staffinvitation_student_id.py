from django.db import migrations, models

import common.validators.student_id_validator


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0010_staffinvitation'),
    ]

    operations = [
        migrations.AddField(
            model_name='staffinvitation',
            name='student_id',
            field=models.CharField(
                blank=True,
                db_index=True,
                help_text='Matric number for student invitations',
                max_length=20,
                null=True,
                validators=[common.validators.student_id_validator.validate_student_id_format],
            ),
        ),
    ]
