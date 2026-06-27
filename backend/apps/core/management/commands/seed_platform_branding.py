"""Seed default platform branding — uploads logo to Cloudinary when configured."""
import os

from django.conf import settings
from django.core.management.base import BaseCommand

from apps.core.models import PlatformBranding
from common.storage.cloudinary_service import is_configured, upload_file


class Command(BaseCommand):
    help = 'Ensure PlatformBranding singleton exists and seed logo on Cloudinary when empty.'

    def handle(self, *args, **options):
        pb = PlatformBranding.load()
        updated = []

        logo_path = os.path.join(settings.BASE_DIR, 'ibbul-logo.png')
        if not pb.logo_data and os.path.isfile(logo_path):
            if is_configured():
                base = getattr(settings, 'CLOUDINARY_BRANDING_FOLDER', 'ibbul/branding')
                with open(logo_path, 'rb') as fh:
                    url, _ = upload_file(fh, folder=f'{base}/logo', filename='ibbul-logo.png')
                pb.logo_data = url
                updated.append('logo (Cloudinary)')
            else:
                self.stdout.write(
                    self.style.WARNING(
                        'Cloudinary not configured — skip logo seed. '
                        'Set CLOUDINARY_* then run migrate_media_to_cloudinary'
                    )
                )

        if updated:
            pb.save()
            self.stdout.write(self.style.SUCCESS(f'Seeded platform branding: {", ".join(updated)}'))
        else:
            self.stdout.write('Platform branding already configured.')
