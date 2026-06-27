"""
Branded transactional email — invitations, password reset, and system mail.
Uses Super Admin platform branding (DB) + inline logo (CID) for reliable delivery.
"""
from __future__ import annotations

import html
import logging
from email.mime.image import MIMEImage
from typing import Tuple

from django.core.mail import EmailMultiAlternatives

from apps.core.branding_service import LOGO_CID, get_logo_bytes, get_platform_branding_dict

logger = logging.getLogger(__name__)

ROLE_LABELS = {
    'FACULTY_ADMIN': 'Faculty Dean',
    'DEPARTMENT_ADMIN': 'Head of Department',
    'HOD': 'Head of Department',
    'EXAMINER': 'Lecturer / Examiner',
    'STUDENT': 'Student',
}

ROLE_PURPOSE = {
    'FACULTY_ADMIN': (
        'You will oversee academic operations, departments, and governance across your faculty '
        '— including result oversight, staff coordination, and institutional reporting.'
    ),
    'DEPARTMENT_ADMIN': (
        'You will manage your department\'s academic records: inviting students and lecturers, '
        'uploading and approving results, and maintaining the official course catalogue.'
    ),
    'HOD': (
        'You will manage your department\'s academic records: inviting students and lecturers, '
        'uploading and approving results, and maintaining the official course catalogue.'
    ),
    'EXAMINER': (
        'You will access your assigned courses, support teaching and assessment, and review '
        'results within your department on the platform.'
    ),
    'STUDENT': (
        'You will access your official semester results, GPA summaries, and learning resources '
        'once your Head of Department publishes approved results.'
    ),
}


def email_configured() -> bool:
    from django.conf import settings
    backend = getattr(settings, 'EMAIL_BACKEND', '')
    from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', None)
    host_user = getattr(settings, 'EMAIL_HOST_USER', '')
    host_password = getattr(settings, 'EMAIL_HOST_PASSWORD', '')
    if not backend or not from_email:
        return False
    if 'console' in backend.lower() or 'filebased' in backend.lower():
        return False
    return bool(host_user and host_password)


def get_branding() -> dict:
    return get_platform_branding_dict()


def _esc(text: str) -> str:
    return html.escape(str(text or ''), quote=True)


def _bulletproof_button(label: str, url: str, bg: str) -> str:
    return f"""
<table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin:28px 0;">
  <tr>
    <td align="center" bgcolor="{bg}" style="border-radius:10px;mso-padding-alt:14px 32px;">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="{_esc(url)}" style="height:48px;v-text-anchor:middle;width:320px;" arcsize="12%" strokecolor="{bg}" fillcolor="{bg}">
        <w:anchorlock/>
        <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">{_esc(label)}</center>
      </v:roundrect>
      <![endif]-->
      <a href="{_esc(url)}" target="_blank" rel="noopener noreferrer"
         style="display:inline-block;background-color:{bg};color:#ffffff !important;text-decoration:none !important;
                font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;line-height:48px;
                padding:0 32px;border-radius:10px;border:2px solid {bg};mso-hide:all;">
        {_esc(label)}
      </a>
    </td>
  </tr>
</table>"""


def render_email_html(
    *,
    preheader: str,
    headline: str,
    greeting: str,
    body_paragraphs: list[str],
    cta_label: str,
    cta_url: str,
    footer_note: str = '',
    extra_html: str = '',
    has_logo: bool = True,
) -> str:
    b = get_branding()
    primary = b['primary_color']
    accent = b['accent_color']
    navy = '#062b1a'

    if has_logo:
        logo_block = (
            f'<img src="cid:{LOGO_CID}" alt="{_esc(b["institution_short"])}" width="72" height="72" '
            f'style="display:block;margin:0 auto 14px;border-radius:14px;border:3px solid {accent};" />'
        )
    else:
        logo_block = (
            f'<div style="width:72px;height:72px;margin:0 auto 14px;border-radius:14px;'
            f'background:{primary};border:3px solid {accent};color:#fff;font-size:24px;font-weight:700;'
            f'line-height:66px;text-align:center;font-family:Georgia,serif;">'
            f'{_esc(b["institution_short"][:4])}</div>'
        )

    paragraphs = ''.join(
        f'<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155;font-family:Georgia,serif;">{p}</p>'
        for p in body_paragraphs
    )
    footer = (
        f'<p style="margin:16px 0 0;font-size:12px;color:#64748b;font-family:Arial,sans-serif;">{_esc(footer_note)}</p>'
        if footer_note else ''
    )
    link_box = (
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        f'style="margin:8px 0 24px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">'
        f'<tr><td style="padding:14px 16px;">'
        f'<p style="margin:0 0 6px;font-size:11px;font-weight:700;text-transform:uppercase;'
        f'letter-spacing:0.08em;color:#64748b;font-family:Arial,sans-serif;">Direct link (copy if button is hidden)</p>'
        f'<p style="margin:0;font-size:13px;line-height:1.5;word-break:break-all;font-family:monospace;">'
        f'<a href="{_esc(cta_url)}" style="color:{primary};text-decoration:underline;">{_esc(cta_url)}</a></p>'
        f'</td></tr></table>'
    )

    return f"""<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light" />
<title>{_esc(headline)}</title>
</head>
<body style="margin:0;padding:0;background:#eef2f0;-webkit-text-size-adjust:100%;">
<span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;">{_esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f0;padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #dce3de;">
<tr>
  <td style="background:linear-gradient(145deg,{primary} 0%,{navy} 100%);padding:32px 28px;text-align:center;border-bottom:4px solid {accent};">
    {logo_block}
    <p style="margin:0;font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:{accent};font-family:Arial,sans-serif;font-weight:600;">{_esc(b['institution_short'])} · {_esc(b['tagline'])}</p>
    <h1 style="margin:10px 0 0;font-size:22px;font-weight:700;color:#ffffff;font-family:Georgia,serif;">{_esc(b['platform_name'])}</h1>
    <p style="margin:8px 0 0;font-size:12px;color:rgba(255,255,255,0.85);font-family:Arial,sans-serif;">Official Academic Communication</p>
  </td>
</tr>
<tr>
  <td style="padding:32px 28px 12px;font-family:Arial,Helvetica,sans-serif;">
    <p style="margin:0 0 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:{primary};">{_esc(headline)}</p>
    <p style="margin:0 0 22px;font-size:17px;color:#0f172a;font-family:Georgia,serif;">{_esc(greeting)}</p>
    {paragraphs}
    {extra_html}
    {_bulletproof_button(cta_label, cta_url, primary)}
    {link_box}
    {footer}
  </td>
</tr>
<tr>
  <td style="padding:22px 28px 28px;border-top:1px solid #e2e8f0;background:#f8fafc;">
    <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.65;text-align:center;font-family:Arial,sans-serif;">
      <strong style="color:#64748b;">{_esc(b['institution_name'])}</strong><br />
      Office of Academic Records · Transactional message — do not share this link<br />
      <a href="mailto:{_esc(b['support_email'])}" style="color:{primary};">{_esc(b['support_email'])}</a>
    </p>
    <p style="margin:12px 0 0;font-size:10px;color:#cbd5e1;text-align:center;font-family:Arial,sans-serif;">{_esc(b['footer_text'])}</p>
  </td>
</tr>
</table>
</td></tr></table>
</body></html>"""


def send_branded_email(
    *,
    to: list[str],
    subject: str,
    plain_body: str,
    html_body: str,
) -> Tuple[bool, str]:
    b = get_branding()
    if not email_configured():
        logger.info('Email (dev/console): to=%s subject=%s', to, subject)
        logger.info('Plain body:\n%s', plain_body[:1200])
        return False, 'Email not configured — set SMTP variables in .env'

    try:
        msg = EmailMultiAlternatives(
            subject=subject,
            body=plain_body,
            from_email=b['from_email'],
            to=to,
            headers={
                'Reply-To': b['support_email'],
                'X-Mailer': b['platform_name'],
            },
        )
        logo = get_logo_bytes()
        if logo:
            img_bytes, subtype = logo
            mime_img = MIMEImage(img_bytes, _subtype=subtype)
            mime_img.add_header('Content-ID', f'<{LOGO_CID}>')
            mime_img.add_header('Content-Disposition', 'inline', filename=f'logo.{subtype}')
            msg.attach(mime_img)
        else:
            html_body = html_body.replace(f'cid:{LOGO_CID}', '')
        msg.attach_alternative(html_body, 'text/html')
        msg.send(fail_silently=False)
        return True, 'Email sent'
    except Exception as exc:
        logger.exception('Branded email failed to %s: %s', to, exc)
        return False, str(exc)[:500]


def build_invitation_email(invitation) -> Tuple[str, str, str]:
    b = get_branding()
    role = getattr(invitation, 'role', '') or ''
    role_key = str(role).upper()
    role_label = ROLE_LABELS.get(role, ROLE_LABELS.get(role_key, role_key.replace('_', ' ').title()))
    purpose = ROLE_PURPOSE.get(role, ROLE_PURPOSE.get(role_key, 'You have been invited to join the academic platform.'))

    scope_parts = []
    if getattr(invitation, 'faculty', None):
        scope_parts.append(invitation.faculty.name)
    if getattr(invitation, 'department', None):
        scope_parts.append(invitation.department.name)
    scope_line = ' · '.join(scope_parts) if scope_parts else b['institution_name']

    accept_url = f"{b['frontend_url']}/invite/accept?token={invitation.token}"
    expires = invitation.expires_at.strftime('%d %B %Y') if invitation.expires_at else '7 days'
    is_student = role_key == 'STUDENT'
    login_hint = (
        f'Matric number (login ID): {invitation.student_id}'
        if is_student and invitation.student_id
        else f'Login email: {invitation.email}'
    )

    subject = f'{b["platform_name"]} — {role_label} invitation · {scope_line}'

    plain = (
        f'{b["institution_name"]}\n{b["platform_name"]}\n'
        f'OFFICIAL ONBOARDING INVITATION\n\n'
        f'ACTION REQUIRED — activate your account:\n{accept_url}\n\n'
        f'Dear {invitation.first_name} {invitation.last_name},\n\n'
        f'You are invited as {role_label} for {scope_line}.\n\n'
        f'{purpose}\n\n'
        f'{login_hint}\n'
        f'Link expires: {expires}\n\n'
        f'If you did not expect this, contact {b["support_email"]}.\n\n'
        f'— Office of Academic Records\n{b["institution_name"]}\n'
    )

    extra = (
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        f'style="margin:0 0 18px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;">'
        f'<tr><td style="padding:14px 16px;font-family:Arial,sans-serif;font-size:13px;color:#14532d;">'
        f'<strong>Academic scope:</strong> {_esc(scope_line)}<br/>'
        f'<strong>Role:</strong> {_esc(role_label)}</td></tr></table>'
    )
    if is_student and invitation.student_id:
        extra += (
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
            f'style="margin:0 0 18px;background:#fffbeb;border:1px solid {b["accent_color"]};border-radius:10px;">'
            f'<tr><td style="padding:14px 16px;font-family:Arial,sans-serif;font-size:14px;color:#78350f;">'
            f'<strong>Matric number:</strong> <span style="font-family:monospace;font-size:15px;">'
            f'{_esc(invitation.student_id)}</span><br/>'
            f'<span style="font-size:12px;color:#92400e;">Use this as your login ID after activation.</span>'
            f'</td></tr></table>'
        )

    html_body = render_email_html(
        preheader=f'{role_label} invitation — {scope_line}',
        headline='Official onboarding invitation',
        greeting=f'Dear {invitation.first_name} {invitation.last_name},',
        body_paragraphs=[
            f'The <strong>{_esc(b["institution_name"])}</strong> invites you to '
            f'<strong>{_esc(b["platform_name"])}</strong> as <strong>{_esc(role_label)}</strong>.',
            purpose,
            f'{login_hint}. This secure link expires on <strong>{expires}</strong>.',
        ],
        cta_label='Accept invitation & set password',
        cta_url=accept_url,
        footer_note='This is a one-time onboarding link. Do not forward or share it.',
        extra_html=extra,
        has_logo=bool(get_logo_bytes()),
    )
    return subject, plain, html_body


def build_password_reset_email(*, user, reset_url: str) -> Tuple[str, str, str]:
    b = get_branding()
    name = user.get_full_name() or user.first_name or 'Colleague'
    role_key = str(getattr(user, 'role', '') or '').upper()
    role_label = ROLE_LABELS.get(role_key, 'Platform user')

    scope_parts = []
    if getattr(user, 'faculty', None):
        scope_parts.append(user.faculty.name)
    dept = getattr(user, 'department_fk', None)
    if dept:
        scope_parts.append(dept.name)
    elif getattr(user, 'department', None):
        scope_parts.append(user.department)
    scope_line = ' · '.join(scope_parts) if scope_parts else b['institution_name']
    login_id = user.student_id if role_key == 'STUDENT' and user.student_id else user.email

    subject = f'{b["platform_name"]} — Password reset'

    plain = (
        f'{b["institution_name"]}\n{b["platform_name"]}\n\n'
        f'PASSWORD RESET\n\n'
        f'Reset your password here (valid 1 hour):\n{reset_url}\n\n'
        f'Dear {name},\n\n'
        f'Role: {role_label}\nScope: {scope_line}\nLogin ID: {login_id}\n\n'
        f'If you did not request this, ignore this email.\n\n'
        f'— {b["institution_name"]}\n'
    )

    html_body = render_email_html(
        preheader='Reset your academic platform password',
        headline='Password reset request',
        greeting=f'Dear {name},',
        body_paragraphs=[
            f'A password reset was requested for your <strong>{_esc(role_label)}</strong> account '
            f'on <strong>{_esc(b["platform_name"])}</strong>.',
            f'Login ID: <strong>{_esc(login_id)}</strong> · Scope: <strong>{_esc(scope_line)}</strong>.',
            'This link is valid for <strong>one hour</strong>. If you did not request a reset, no action is needed.',
        ],
        cta_label='Reset my password',
        cta_url=reset_url,
        footer_note='Never share this link. Official message from the Office of Academic Records.',
        has_logo=bool(get_logo_bytes()),
    )
    return subject, plain, html_body


def send_invitation_email_branded(invitation) -> Tuple[bool, str]:
    subject, plain, html_body = build_invitation_email(invitation)
    ok, msg = send_branded_email(to=[invitation.email], subject=subject, plain_body=plain, html_body=html_body)
    if ok:
        return True, 'Invitation email sent'
    if not email_configured():
        url = f"{get_branding()['frontend_url']}/invite/accept?token={invitation.token}"
        logger.info('Invitation link (dev): %s -> %s', invitation.email, url)
        return True, 'Email not configured — invitation link available for copy on dashboard'
    return False, msg


def send_password_reset_email(*, user, reset_url: str) -> Tuple[bool, str]:
    if not user.email or '@placeholder.ibbul.edu.ng' in (user.email or ''):
        return False, 'No sendable email on account'
    subject, plain, html_body = build_password_reset_email(user=user, reset_url=reset_url)
    ok, msg = send_branded_email(to=[user.email], subject=subject, plain_body=plain, html_body=html_body)
    if ok:
        return True, 'Password reset email sent'
    if not email_configured():
        logger.info('Password reset link (dev): %s -> %s', user.email, reset_url)
        return True, 'Email not configured — reset link logged on server console'
    return False, msg
