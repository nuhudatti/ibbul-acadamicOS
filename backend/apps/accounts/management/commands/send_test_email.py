"""Send a test branded email to verify SMTP / SendGrid configuration."""
import json

from django.core.management.base import BaseCommand, CommandError

from apps.accounts.email_service import (
    email_config_summary,
    email_configured,
    get_branding,
    render_email_html,
    send_branded_email,
)


class Command(BaseCommand):
    help = 'Send a test email to verify SendGrid / SMTP settings'

    def add_arguments(self, parser):
        parser.add_argument('recipient', type=str, help='Email address to send the test to')
        parser.add_argument(
            '--show-config',
            action='store_true',
            help='Print email configuration diagnostics (no secrets)',
        )

    def handle(self, *args, **options):
        recipient = options['recipient'].strip()
        if not recipient or '@' not in recipient:
            raise CommandError('Provide a valid email address')

        summary = email_config_summary()
        if options['show_config'] or not email_configured():
            self.stdout.write(json.dumps(summary, indent=2))

        if not email_configured():
            raise CommandError(
                'SMTP is NOT configured. Set on Render:\n'
                '  EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend\n'
                '  EMAIL_HOST=smtp.sendgrid.net\n'
                '  EMAIL_PORT=587\n'
                '  EMAIL_USE_TLS=true\n'
                '  EMAIL_HOST_USER=apikey\n'
                '  EMAIL_HOST_PASSWORD=<SendGrid API key>\n'
                '  DEFAULT_FROM_EMAIL=Your Name <verified-sender@yourdomain.com>\n'
                'Or use SMTP_HOST, SMTP_PASS, SMTP_FROM (same values).'
            )

        b = get_branding()
        html = render_email_html(
            preheader='SMTP configuration test',
            headline='Email delivery test',
            greeting='Hello,',
            body_paragraphs=[
                f'This confirms that <strong>{b["platform_name"]}</strong> can send mail from your server.',
                'Invitations, student onboarding, and password reset emails use this configuration.',
            ],
            cta_label='Open platform',
            cta_url=b['frontend_url'],
            footer_note='If you received this in your inbox (check spam), SMTP is working.',
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
            self.stdout.write(self.style.SUCCESS(f'Test email sent to {recipient}. Check inbox and spam folder.'))
        else:
            raise CommandError(msg)
