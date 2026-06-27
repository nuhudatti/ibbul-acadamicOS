from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('learning', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='lmsoffering',
            name='enrollment_pin',
            field=models.CharField(
                blank=True,
                default='',
                help_text='Optional 4-digit PIN students must enter to enroll',
                max_length=4,
            ),
        ),
    ]
