# Generated manually for PlatformBranding singleton

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='PlatformBranding',
            fields=[
                ('singleton_id', models.PositiveSmallIntegerField(default=1, editable=False, primary_key=True, serialize=False)),
                ('platform_name', models.CharField(default='IBBUL Academic OS', max_length=160)),
                ('platform_short_name', models.CharField(default='IBBUL', max_length=40)),
                ('tagline', models.CharField(default='Learning for Service', max_length=160)),
                ('footer_text', models.TextField(blank=True, default='Ibrahim Badamasi Babangida University, Lapai · Niger State, Nigeria')),
                ('primary_color', models.CharField(default='#0F6B3E', max_length=7)),
                ('accent_color', models.CharField(default='#C9A227', max_length=7)),
                ('logo_data', models.TextField(blank=True, help_text='Data URL (base64) for logo')),
                ('login_background_data', models.TextField(blank=True, help_text='Data URL for login hero')),
                ('dashboard_banner_data', models.TextField(blank=True, help_text='Data URL for dashboard banner')),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Platform branding',
                'verbose_name_plural': 'Platform branding',
                'db_table': 'core_platform_branding',
            },
        ),
    ]
