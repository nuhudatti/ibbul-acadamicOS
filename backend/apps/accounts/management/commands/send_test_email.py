"""Send a test branded email to verify SMTP .env configuration."""
from django.core.management.base import BaseCommand, CommandError

from apps.accounts.email_service import email_configured, get_branding, render_email_html, send_branded_email


class Command(BaseCommand):
    help = 'Send a test email to verify SMTP settings in .env'

    def add_arguments(self, parser):
        parser.add_argument('recipient', type=str, help='Email address to send the test to')

    def handle(self, *args, **options):
        recipient = options['recipient'].strip()
        if not recipient or '@' not in recipient:
            raise CommandError('Provide a valid email address')

        b = get_branding()
        if not email_configured():
            self.stdout.write(self.style.WARNING(
                'SMTP is NOT configured. Set EMAIL_BACKEND=smtp, EMAIL_HOST_USER, '
                'EMAIL_HOST_PASSWORD in .env — see .env.example'
            ))

        html = render_email_html(
            preheader='SMTP configuration test',
            headline='Email delivery test',
            greeting='Hello,',
            body_paragraphs=[
                f'This confirms that <strong>{b["platform_name"]}</strong> can send mail from your server.',
                'Invitations, bulk student invites, lecturer onboarding, and password reset emails will use this configuration.',
            ],
            cta_label='Open platform',
            cta_url=b['frontend_url'],
            footer_note='If you received this, your .env email settings are working.',
        )
        plain = (
            f'{b["platform_name"]} — email test successful.\n'
            f'Institution: {b["institution_name"]}\n'
            f'Platform: {b["frontend_url"]}\n'
        )
        ok, msg = send_branded_email(
            to=[recipient],
            subject=f'{b["platform_name"]} — Email test',
            plain_body=plain,
            html_body=html,
        )
        if ok:
            self.stdout.write(self.style.SUCCESS(f'Test email sent to {recipient}'))
        else:
            self.stdout.write(self.style.ERROR(msg))
