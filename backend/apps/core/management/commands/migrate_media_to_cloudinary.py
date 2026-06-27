"""Migrate existing base64 branding and local lesson media to Cloudinary URLs."""
from django.conf import settings
from django.core.management.base import BaseCommand

from apps.core.models import PlatformBranding
from common.storage.cloudinary_service import is_configured, normalize_media_value, upload_file


class Command(BaseCommand):
    help = 'Upload existing branding data URLs and local lesson files to Cloudinary.'

    def handle(self, *args, **options):
        if not is_configured():
            self.stderr.write(self.style.ERROR(
                'Cloudinary not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, '
                'CLOUDINARY_API_SECRET in .env'
            ))
            return

        base = getattr(settings, 'CLOUDINARY_BRANDING_FOLDER', 'ibbul/branding')
        pb = PlatformBranding.load()
        updated = []

        for field, sub in (
            ('logo_data', 'logo'),
            ('login_background_data', 'background'),
            ('dashboard_banner_data', 'banner'),
        ):
            val = getattr(pb, field, '') or ''
            if not val or val.startswith('https://'):
                continue
            new_val = normalize_media_value(val, folder=f'{base}/{sub}')
            if new_val and new_val != val:
                setattr(pb, field, new_val)
                updated.append(sub)

        if updated:
            pb.save()
            self.stdout.write(self.style.SUCCESS(f'Branding migrated: {", ".join(updated)}'))
        else:
            self.stdout.write('Branding already on Cloudinary or empty.')

        # Optional: seed logo from file if empty
        if not pb.logo_data:
            import os
            path = os.path.join(settings.BASE_DIR, 'ibbul-logo.png')
            if os.path.isfile(path):
                with open(path, 'rb') as fh:
                    url, _ = upload_file(fh, folder=f'{base}/logo', filename='ibbul-logo.png')
                pb.logo_data = url
                pb.save(update_fields=['logo_data'])
                self.stdout.write(self.style.SUCCESS(f'Seeded logo → {url[:60]}…'))

        # Lesson local files → Cloudinary
        from apps.learning.models import Lesson
        import os

        learn_base = getattr(settings, 'CLOUDINARY_LEARNING_FOLDER', 'ibbul/learning')
        migrated_lessons = 0
        for lesson in Lesson.objects.exclude(file_key='').exclude(file_key__startswith='http'):
            key = lesson.file_key
            abs_path = os.path.join(settings.MEDIA_ROOT, key)
            if not os.path.isfile(abs_path):
                continue
            with open(abs_path, 'rb') as fh:
                url, _ = upload_file(
                    fh,
                    folder=f'{learn_base}/lessons/{lesson.id}',
                    filename=os.path.basename(key),
                )
            lesson.file_key = url
            lesson.save(update_fields=['file_key'])
            migrated_lessons += 1

        if migrated_lessons:
            self.stdout.write(self.style.SUCCESS(f'Migrated {migrated_lessons} lesson media file(s).'))
