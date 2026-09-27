import json
import re
from unittest import mock

from django.core import mail
from django.core.mail import EmailMultiAlternatives
from django.test import TestCase, override_settings
from django.urls import reverse

from jds.mail import MailjetBackend
from verbaende.models import Verband

from .models import User

PW = 'handball-2026!'


class PasswortTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('joel@example.de', PW, first_name='Joel', last_name='Nicolay',
                                             verband=Verband.objects.get(kuerzel='HVS'))

    def test_login_seite_verlinkt_passwort_vergessen(self):
        self.assertContains(self.client.get(reverse('login')), reverse('password_reset'))

    def test_passwort_zuruecksetzen_komplett(self):
        res = self.client.post(reverse('password_reset'), {'email': 'Joel@Example.de'})
        self.assertRedirects(res, reverse('password_reset_done'))
        self.assertEqual(len(mail.outbox), 1)
        m = mail.outbox[0]
        self.assertEqual(m.to, ['joel@example.de'])
        self.assertEqual(m.subject, 'JDS Sports – Passwort zurücksetzen')
        self.assertIn('Hallo Joel', m.body)
        self.assertEqual(m.alternatives[0][1], 'text/html')

        link = re.search(r'http://testserver(/passwort-zuruecksetzen/\S+/)', m.body).group(1)
        res = self.client.get(link, follow=True)  # Django leitet auf .../set-password/ um
        self.assertTrue(res.context['validlink'])
        res = self.client.post(res.redirect_chain[-1][0], {'new_password1': 'neues-passwort-42', 'new_password2': 'neues-passwort-42'})
        self.assertRedirects(res, reverse('password_reset_complete'))
        self.assertTrue(self.client.login(username='joel@example.de', password='neues-passwort-42'))

        # Link ist danach verbraucht
        self.client.logout()
        self.assertFalse(self.client.get(link, follow=True).context['validlink'])

    def test_unbekannte_adresse_verraet_nichts(self):
        res = self.client.post(reverse('password_reset'), {'email': 'gibtsnicht@example.de'})
        self.assertRedirects(res, reverse('password_reset_done'))
        self.assertEqual(len(mail.outbox), 0)

    def test_passwort_aendern(self):
        self.client.force_login(self.user)
        res = self.client.post(reverse('password_change'), {'old_password': PW, 'new_password1': 'neues-passwort-42', 'new_password2': 'neues-passwort-42'})
        self.assertRedirects(res, reverse('einstellungen'))
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('neues-passwort-42'))

    def test_passwort_aendern_falsches_altes(self):
        self.client.force_login(self.user)
        res = self.client.post(reverse('password_change'), {'old_password': 'falsch', 'new_password1': 'neues-passwort-42', 'new_password2': 'neues-passwort-42'})
        self.assertEqual(res.status_code, 200)
        self.assertIn('old_password', res.context['form'].errors)

    def test_altes_bcrypt_passwort_aus_node_app(self):
        # Hash wie von bcryptjs (Node) erzeugt – Import über import_legacy
        import bcrypt
        u = User.objects.create(email='alt@example.de', first_name='A', last_name='B',
                                password='bcrypt$' + bcrypt.hashpw(b'demo1234', bcrypt.gensalt(10, prefix=b'2a')).decode())
        self.assertTrue(u.check_password('demo1234'))


@override_settings(MAILJET_API_KEY='key', MAILJET_SECRET_KEY='secret', DEFAULT_FROM_EMAIL='JDS Sports <noreply@example.de>')
class MailjetBackendTests(TestCase):
    def test_sendet_ueber_api(self):
        antwort = mock.MagicMock()
        antwort.__enter__.return_value.read.return_value = json.dumps({'Messages': [{'Status': 'success'}]}).encode()
        msg = EmailMultiAlternatives('Betreff', 'Text', to=['Joel <joel@example.de>'])
        msg.attach_alternative('<b>HTML</b>', 'text/html')
        msg.attach('quittung.pdf', b'%PDF-1.4', 'application/pdf')
        with mock.patch('jds.mail.urllib.request.urlopen', return_value=antwort) as urlopen:
            self.assertEqual(MailjetBackend().send_messages([msg]), 1)
        req = urlopen.call_args[0][0]
        self.assertEqual(req.full_url, 'https://api.mailjet.com/v3.1/send')
        self.assertEqual(req.get_header('Authorization'), 'Basic a2V5OnNlY3JldA==')
        payload = json.loads(req.data)['Messages'][0]
        self.assertEqual(payload['From'], {'Email': 'noreply@example.de', 'Name': 'JDS Sports'})
        self.assertEqual(payload['To'], [{'Email': 'joel@example.de', 'Name': 'Joel'}])
        self.assertEqual(payload['HTMLPart'], '<b>HTML</b>')
        self.assertEqual(payload['Attachments'][0]['Filename'], 'quittung.pdf')

    def test_fehler_wird_gemeldet(self):
        import urllib.error

        err = urllib.error.HTTPError('https://api.mailjet.com/v3.1/send', 401, 'Unauthorized', {}, None)
        err.read = lambda: b'{"ErrorMessage":"API key authentication/authorization failure"}'
        with mock.patch('jds.mail.urllib.request.urlopen', side_effect=err):
            with self.assertRaises(urllib.error.HTTPError):
                MailjetBackend().send_messages([EmailMultiAlternatives('B', 'T', to=['a@example.de'])])
            self.assertEqual(MailjetBackend(fail_silently=True).send_messages([EmailMultiAlternatives('B', 'T', to=['a@example.de'])]), 0)
