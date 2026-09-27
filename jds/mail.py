"""E-Mail-Versand über die Mailjet Send API v3.1 (https://dev.mailjet.com/email/guides/send-api-v31/).

Aktiv, sobald MAILJET_API_KEY und MAILJET_SECRET_KEY gesetzt sind (siehe .env.example).
Der Absender (DEFAULT_FROM_EMAIL) muss in Mailjet als Sender bzw. Domain verifiziert sein.
"""

import base64
import json
import logging
import urllib.error
import urllib.request
from email.utils import parseaddr

from django.conf import settings
from django.core.mail.backends.base import BaseEmailBackend

logger = logging.getLogger(__name__)

API_URL = 'https://api.mailjet.com/v3.1/send'


def _address(value: str) -> dict:
    name, email = parseaddr(value)
    return {'Email': email, 'Name': name} if name else {'Email': email}


class MailjetBackend(BaseEmailBackend):
    def __init__(self, fail_silently=False, **kwargs):
        super().__init__(fail_silently=fail_silently, **kwargs)
        self.api_key = settings.MAILJET_API_KEY
        self.secret_key = settings.MAILJET_SECRET_KEY
        self.timeout = getattr(settings, 'EMAIL_TIMEOUT', None) or 15

    def _payload(self, message) -> dict:
        msg = {
            'From': _address(message.from_email or settings.DEFAULT_FROM_EMAIL),
            'To': [_address(a) for a in message.to],
            'Subject': message.subject,
            'TextPart': message.body,
        }
        if message.cc:
            msg['Cc'] = [_address(a) for a in message.cc]
        if message.bcc:
            msg['Bcc'] = [_address(a) for a in message.bcc]
        if message.reply_to:
            msg['ReplyTo'] = _address(message.reply_to[0])
        for content, mimetype in getattr(message, 'alternatives', []) or []:
            if mimetype == 'text/html':
                msg['HTMLPart'] = content
        attachments = []
        for att in message.attachments:
            if isinstance(att, tuple):
                filename, content, mimetype = att
                data = content.encode() if isinstance(content, str) else content
                attachments.append({
                    'Filename': filename,
                    'ContentType': mimetype or 'application/octet-stream',
                    'Base64Content': base64.b64encode(data).decode('ascii'),
                })
        if attachments:
            msg['Attachments'] = attachments
        return msg

    def send_messages(self, email_messages) -> int:
        messages = [m for m in email_messages if m.recipients()]
        if not messages:
            return 0
        body = json.dumps({'Messages': [self._payload(m) for m in messages]}).encode('utf-8')
        token = base64.b64encode(f'{self.api_key}:{self.secret_key}'.encode()).decode('ascii')
        req = urllib.request.Request(
            API_URL, data=body, method='POST',
            headers={'Content-Type': 'application/json', 'Authorization': f'Basic {token}'},
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as res:
                result = json.loads(res.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            detail = e.read().decode('utf-8', errors='replace')
            logger.error('Mailjet-Versand fehlgeschlagen (%s): %s', e.code, detail)
            if not self.fail_silently:
                raise
            return 0
        except (urllib.error.URLError, TimeoutError):
            logger.exception('Mailjet nicht erreichbar')
            if not self.fail_silently:
                raise
            return 0
        sent = sum(1 for m in result.get('Messages', []) if m.get('Status') == 'success')
        if sent < len(messages):
            logger.error('Mailjet hat nicht alle Nachrichten angenommen: %s', result)
        return sent
