import json
import tempfile
from datetime import date, datetime
from pathlib import Path
from unittest import mock

from django.test import TestCase, override_settings
from django.urls import reverse
from pypdf import PdfReader

from accounts.models import User
from verbaende.models import Verband

from .models import Assignment
from .services.engine import CalcInput, Doppelansetzung, calc_expense, is_holiday_saarland
from .services.h360 import drafts_from_rows, parse_csv
from .services.ics import draft_from_event, extract_spielnummer, parse_ics
from .services.pdf import BogenPerson, BogenSpiel, build_bogen
from .services.rules import match_league_key

DATA = Path(__file__).resolve().parent / 'data'
PACK = json.loads((DATA / 'rulepacks' / 'HVS_2026_27.json').read_text(encoding='utf-8'))


def calc(**kw):
    base = dict(league='Bezirksliga', league_key='bezirksliga', date_local=date(2026, 9, 19))
    base.update(kw)
    return calc_expense(CalcInput(**base), PACK)


def amount(res_or_assignment, key):
    items = res_or_assignment.items if hasattr(res_or_assignment, 'items') else res_or_assignment.expense_breakdown
    return next((i['amount'] for i in items if i['key'] == key), None)


class SpesenEngineTests(TestCase):
    """PRD-Testmatrix 9.6 – Sätze lt. Durchführungsbestimmungen 2026/27."""

    def test_bezirksliga_samstag_ohne_wochenspielpauschale(self):
        res = calc()
        self.assertEqual(res.total, 30)
        self.assertIsNone(amount(res, 'weekday'))

    def test_verbandsliga_mittwoch_mit_pauschale(self):
        self.assertEqual(calc(league_key='verbandsliga', date_local=date(2026, 9, 16)).total, 40)

    def test_pauschale_entfaellt_an_feiertag(self):
        self.assertTrue(is_holiday_saarland(date(2026, 5, 1)))
        res = calc(league_key='verbandsliga', date_local=date(2026, 5, 1))
        self.assertEqual(res.total, 35)
        self.assertIn('entfällt', next(i['label'] for i in res.items if i['key'] == 'weekday'))

    def test_doppelansetzung_zusatzspesen_geteilt(self):
        res = calc(league_key='oberliga', block=Doppelansetzung(anzahl=2, km=40))
        self.assertEqual(amount(res, 'base'), 40)
        self.assertEqual(amount(res, 'double'), 2.5)  # 5 € je zusätzlichem Spiel, auf beide Spiele verteilt
        self.assertIsNone(amount(calc(league_key='oberliga'), 'double'))

    def test_pokalrunden(self):
        for runde, satz in [('quali', 25), ('r1', 30), ('r2_3', 35), ('halbfinalturnier', 25), ('final4', 30)]:
            self.assertEqual(calc(competition_type='cup', cup_round=runde, league_key=None).total, satz)

    def test_freundschaftsspiele(self):
        for key, satz in [('oberliga', 20), ('a_liga', 15), ('bundesliga_3liga', 40), ('regionalliga', 30)]:
            self.assertEqual(calc(competition_type='friendly', league_key=key).total, satz)

    def test_ausgefallen_angereist(self):
        res = calc(status='ausgefallen_angereist', travel_km=24)
        self.assertEqual(amount(res, 'base'), 15)
        self.assertEqual(amount(res, 'travel'), 7.2)
        self.assertEqual(res.total, 22.2)

    def test_abgesagt(self):
        self.assertEqual(calc(status='abgesagt').total, 0)
        self.assertEqual(calc(status='ausgefallen_nicht_angereist').total, 0)

    def test_km_saetze(self):
        self.assertEqual(amount(calc(travel_km=40), 'travel'), 12)
        self.assertEqual(amount(calc(travel_km=40, travel_mitfahrer=True), 'travel'), 12.8)

    def test_anteilige_fahrtkosten(self):
        res = calc(travel_km=40, block=Doppelansetzung(anzahl=2, km=40))
        travel = next(i for i in res.items if i['key'] == 'travel')
        self.assertEqual(travel['amount'], 6)
        self.assertIn('anteilig 1/2', travel['detail'])

    def test_pnv_und_sonstige(self):
        res = calc(league_key='oberliga', pnv_cost=9.6, other_cost=3.5)
        self.assertEqual(res.total, 53.1)

    def test_unbekannte_klasse(self):
        res = calc(league_key='gibtsnicht')
        self.assertTrue(res.warnings)
        self.assertEqual(amount(res, 'base'), 0)

    def test_liga_matching(self):
        self.assertEqual(match_league_key('Männer-Bezirksliga', PACK), 'bezirksliga')
        self.assertEqual(match_league_key('Oberliga Saar Jugend A', PACK), 'oberliga_jugend_ab')
        self.assertEqual(match_league_key('Jugend pfeift Jugend', PACK), 'jpj')
        self.assertIsNone(match_league_key('Kreisliga X', PACK))


class DoppelansetzungTests(TestCase):
    """Nur direkt aufeinanderfolgende Spiele in derselben Halle teilen sich km und Zusatzspesen."""

    def setUp(self):
        self.user = User.objects.create_user('sr@example.de', 'handball-2026!', first_name='S', last_name='R',
                                             verband=Verband.objects.get(kuerzel='HVS'))

    def spiel(self, stunde, minute=0, halle='Halle Bous, 66763 Bous', km=18, **kw):
        return Assignment.objects.create(user=self.user, game_datetime=datetime(2026, 10, 3, stunde, minute), home_team=f'H{stunde}',
                                         league='Bezirksliga', league_key='bezirksliga', hall_address=halle, travel_km=km,
                                         status=kw.pop('status', 'bestätigt'), **kw)

    def werte(self, a):
        from .services.assignments import recalc_user

        recalc_user(self.user)
        a.refresh_from_db()
        return amount(a, 'travel'), amount(a, 'double'), float(a.expense_total)

    def test_zwei_spiele_hintereinander_gleiche_halle(self):
        a, b = self.spiel(14), self.spiel(15, 45)
        # 30 € + 9 km × 0,30 € + 2,50 € Zusatzspesen – je Spiel
        self.assertEqual(self.werte(a), (2.7, 2.5, 35.2))
        self.assertEqual(self.werte(b), (2.7, 2.5, 35.2))

    def test_verschiedene_hallen_normal(self):
        a, b = self.spiel(14), self.spiel(16, halle='Sporthalle Kirkel, 66459 Kirkel', km=90)
        self.assertEqual(self.werte(a), (5.4, None, 35.4))   # volle 18 km
        self.assertEqual(self.werte(b), (27.0, None, 57.0))  # volle 90 km

    def test_grosse_pause_normal(self):
        a, b = self.spiel(10), self.spiel(18)
        self.assertEqual(self.werte(a), (5.4, None, 35.4))
        self.assertEqual(self.werte(b), (5.4, None, 35.4))

    def test_drei_spiele_mit_hallenwechsel_dazwischen(self):
        a, b, c = self.spiel(12), self.spiel(14, halle='Andere Halle, 66111 Saarbrücken', km=30), self.spiel(16)
        self.assertEqual(self.werte(a)[1], None)
        self.assertEqual(self.werte(c)[1], None)  # nicht direkt nach Spiel a

    def test_abgesagtes_spiel_zaehlt_nicht(self):
        a, _ = self.spiel(14), self.spiel(15, 45, status='abgesagt')
        self.assertEqual(self.werte(a), (5.4, None, 35.4))


class HallenTests(TestCase):
    """Hallen werden automatisch angelegt und wiedererkannt; die Nummer kommt aus dem zuletzt gespielten Spiel."""

    def setUp(self):
        self.user = User.objects.create_user('sr@example.de', 'handball-2026!', first_name='S', last_name='R',
                                             verband=Verband.objects.get(kuerzel='HVS'))

    def spiel(self, tag, hall='SPORTHALLE BOUS', adresse='', nummer='', user=None):
        return Assignment.objects.create(user=user or self.user, game_datetime=datetime(2026, 10, tag, 15), home_team='A',
                                         league='L', hall=hall, hall_address=adresse, hallennummer=nummer)

    def test_halle_wird_angelegt_und_nummer_gelernt(self):
        from .models import Halle
        from .services import hallen

        self.spiel(1, nummer='5558')
        neu = self.spiel(8, hall='Sporthalle Bous')  # andere Schreibweise, keine Nummer
        hallen.alle_erkennen()
        neu.refresh_from_db()
        self.assertEqual(neu.hallennummer, '5558')
        self.assertEqual(Halle.objects.count(), 1)
        self.assertEqual(Halle.objects.get().nummer, '5558')

    def test_neuestes_spiel_bestimmt_nummer(self):
        from .models import Halle
        from .services import hallen

        self.spiel(1, nummer='1111')
        self.spiel(5, nummer='2222')
        self.spiel(3, nummer='1111')  # später erfasst, aber älteres Spiel
        hallen.alle_erkennen()
        self.assertEqual(Halle.objects.get().nummer, '2222')
        zukunft = self.spiel(20)
        hallen.erkennen(zukunft)
        self.assertEqual(zukunft.hallennummer, '2222')

    def test_ueber_adresse_erkannt_und_fuer_alle_nutzer(self):
        from .services import hallen

        anderer = User.objects.create_user('b@example.de', 'handball-2026!', first_name='B', last_name='C')
        fremd = self.spiel(1, hall='Halle am Markt', adresse='Am Markt 1, 66557 Illingen', nummer='210064', user=anderer)
        hallen.erkennen(fremd)  # passiert beim Speichern/Import des anderen Nutzers
        meins = self.spiel(9, hall='Illtalhalle', adresse='Am Markt 1, 66557 Illingen')
        hallen.alle_erkennen(Assignment.objects.filter(user=self.user))
        meins.refresh_from_db()
        self.assertEqual(meins.hallennummer, '210064')

    def test_ohne_nummer_steht_hallenname_auf_bogen(self):
        spiel = BogenSpiel(
            spielnummer='X', game_datetime=datetime(2026, 10, 3, 14), home_team='A', away_team='B', league='Bezirksliga',
            league_key='bezirksliga', competition_type='championship', cup_round=None, tournament_group=None,
            hall='Sporthalle Bous', hall_address='', role='sr1', items=[{'key': 'base', 'amount': 30}], travel_km=None,
            travel_km_effective=None, travel_minutes=None, travel_mitfahrer=False, partner_km=None, partner_minutes=None,
        )
        person = BogenPerson('Joel', 'Nicolay', '', '', 'Lebach', '', '')
        text = PdfReader(__import__('io').BytesIO(build_bogen([spiel], person, PACK))).pages[0].extract_text()
        self.assertIn('Sporthalle Bous', text)
        spiel.hallennummer = '5558'
        text = PdfReader(__import__('io').BytesIO(build_bogen([spiel], person, PACK))).pages[0].extract_text()
        self.assertIn('5558', text)
        self.assertNotIn('Sporthalle Bous', text)


class ImportTests(TestCase):
    def test_spielnummer(self):
        self.assertEqual(extract_spielnummer('Ansetzung, Spielnummer 2627SAROLCJMA0501'), '2627SAROLCJMA0501')
        self.assertEqual(extract_spielnummer('', 'handball360-2627SARBKRKERMA0104'), '2627SARBKRKERMA0104')
        self.assertEqual(extract_spielnummer('Schiedsrichteransetzung nuLiga HVSaar, Spielnummer 1001'), '1001')

    def test_ics(self):
        events = parse_ics((DATA / 'samples' / 'sample-nuliga.ics').read_text(encoding='utf-8'))
        self.assertTrue(events)
        d = draft_from_event(events[0], PACK, 'sr1')
        self.assertEqual(d['game_datetime'], '2026-10-10T15:00')
        self.assertEqual((d['home_team'], d['away_team']), ('SG Blieskastel', 'TV Kirkel'))
        self.assertEqual(d['league_key'], 'bezirksliga')
        self.assertEqual(d['spielnummer'], '1001')

    def test_h360_csv(self):
        rows = parse_csv((DATA / 'samples' / 'sample-h360.csv').read_text(encoding='utf-8'))
        self.assertEqual(len(rows), 9)
        drafts, skipped = drafts_from_rows(rows, PACK, 'sr1')
        self.assertEqual((len(drafts), skipped), (9, 0))
        d = drafts[0]
        self.assertEqual(d['spielnummer'], '2627SARBKRKERMA0104')
        self.assertEqual(d['league_key'], 'a_liga')
        self.assertEqual(d['game_datetime'], '2026-10-31T15:00')
        self.assertTrue(any(x['status'] == 'geleitet' for x in drafts))

    def test_h360_csv_neue_spalte_spielfeld(self):
        # neuer Handball360-Export: Hallenspalte heißt „Spielfeld“ statt „Halle“
        rows = parse_csv((DATA / 'samples' / 'sample-h360-spielfeld.csv').read_text(encoding='utf-8'))
        drafts, skipped = drafts_from_rows(rows, PACK, 'sr1')
        self.assertEqual((len(drafts), skipped), (9, 0))
        self.assertTrue(all(d['hall'] and d['hall_address'] for d in drafts))
        d = drafts[0]
        self.assertEqual(d['hall'], 'SPORTHALLE SCHULZENTRUM')
        self.assertEqual(d['hall_address'], 'SPORTHALLE SCHULZENTRUM AM ROßBERG, 66869 KUSEL')


class PdfTests(TestCase):
    def test_bogen_enthaelt_daten(self):
        spiel = BogenSpiel(
            spielnummer='2627SAROLCJMA0501', game_datetime=datetime(2026, 2, 28, 14, 0), home_team='JSG Saarbrücken W.',
            away_team='HC Perl', league='Oberliga männliche C Jugend', league_key='oberliga_jugend_cd',
            competition_type='championship', cup_round=None, tournament_group=None, hall='210048',
            hall_address='Sporthalle, 66121 Saarbrücken', role='sr1',
            items=[{'key': 'base', 'amount': 30}, {'key': 'travel', 'amount': 20.4}],
            travel_km=68, travel_km_effective=68, travel_minutes=55, travel_mitfahrer=False, partner_km=16, partner_minutes=15,
        )
        person = BogenPerson('Joel', 'Nicolay', 'Niederwiesstraße 20', '66822', 'Lebach', 'Otto, Simon', 'Birkenweg 38, 66127 Saarbrücken')
        text = PdfReader(__import__('io').BytesIO(build_bogen([spiel], person, PACK))).pages[0].extract_text()
        for erwartet in ['2627SAROLCJMA0501', 'Nicolay, Joel', 'Otto, Simon', '50,40', '34,80', '85,20', 'Reisekostenabrechnung']:
            self.assertIn(erwartet, text)


@override_settings(MEDIA_ROOT=tempfile.mkdtemp(prefix='jds-test-media-'))
class WebTests(TestCase):
    def setUp(self):
        self.hvs = Verband.objects.get(kuerzel='HVS')

    def test_registrierung_mit_verband(self):
        res = self.client.post(reverse('registrieren'), {
            'first_name': 'Erika', 'last_name': 'Muster', 'email': 'Erika@Example.de', 'verband': self.hvs.pk,
            'password1': 'handball-2026!', 'password2': 'handball-2026!',
        })
        self.assertRedirects(res, reverse('hub:dashboard'))
        u = User.objects.get(email='erika@example.de')
        self.assertEqual(u.verband, self.hvs)
        self.assertTrue(u.ist_schiedsrichter)
        page = self.client.get(reverse('hub:dashboard')).content.decode()
        self.assertIn('Schiedsrichter', page)
        self.assertNotIn('Weitere Bereiche', page)
        self.assertEqual(self.client.get(reverse('hub:modul', args=['spieler'])).status_code, 404)

    def test_registrierung_verband_fest_hv_saar(self):
        seite = self.client.get(reverse('registrieren')).content.decode()
        self.assertIn('Handball-Verband Saar e.V.', seite)
        self.assertNotIn('Badischer Handball-Verband', seite)
        # auch ein manipuliertes Formular landet beim HV Saar
        anderer = Verband.objects.exclude(kuerzel='HVS').first()
        self.client.post(reverse('registrieren'), {
            'first_name': 'A', 'last_name': 'B', 'email': 'a@b.de', 'verband': anderer.pk,
            'password1': 'handball-2026!', 'password2': 'handball-2026!',
        })
        self.assertEqual(User.objects.get(email='a@b.de').verband, self.hvs)

    def test_login_und_sr_bereich(self):
        User.objects.create_user('sr@example.de', 'handball-2026!', first_name='S', last_name='R', verband=self.hvs)
        res = self.client.post(reverse('login'), {'username': 'SR@example.de', 'password': 'handball-2026!'})
        self.assertRedirects(res, reverse('hub:dashboard'))
        for name in ['sr:dashboard', 'sr:einsaetze', 'sr:einsatz_neu', 'sr:import', 'sr:quittungen', 'sr:auswertung', 'einstellungen']:
            self.assertEqual(self.client.get(reverse(name)).status_code, 200, name)

    def test_einsatz_und_quittung(self):
        user = User.objects.create_user('sr@example.de', 'handball-2026!', first_name='Joel', last_name='Nicolay', verband=self.hvs,
                                        ist_schiedsrichter=True, strasse='Niederwiesstraße 20', plz='66822', ort='Lebach')
        self.client.force_login(user)
        with mock.patch('schiedsrichter.services.travel.travel_between') as tb:
            tb.return_value = mock.Mock(km_round_trip=38, km_one_way=18.8, minutes_one_way=22)
            res = self.client.post(reverse('sr:einsatz_neu'), {
                'game_datetime': '2026-10-10T15:00', 'role': 'sr1', 'spielnummer': '2627SARBLMA0101', 'home_team': 'TV A',
                'away_team': 'TV B', 'competition_type': 'championship', 'league_key': 'bezirksliga', 'league': 'Bezirksliga',
                'hall': 'Halle', 'hall_address': 'Am Markt 1, 66557 Illingen', 'status': 'bestätigt', 'games_count': 1,
            })
            a = Assignment.objects.get()
            self.assertRedirects(res, reverse('sr:einsatz', args=[a.pk]))
            self.assertEqual(a.travel_km, 38)
            self.assertTrue(a.travel_km_auto)
            self.assertEqual(float(a.expense_total), 30 + 11.4)

            res = self.client.post(reverse('sr:quittung_neu'), {'ids': [a.pk]})
        receipt = user.quittungen.get()
        self.assertEqual(float(receipt.total), 41.4)
        pdf = self.client.get(reverse('sr:quittung_pdf', args=[receipt.pk]))
        self.assertEqual(pdf['Content-Type'], 'application/pdf')
        self.assertIn('2627SARBLMA0101', PdfReader(__import__('io').BytesIO(pdf.content)).pages[0].extract_text())


@override_settings(MEDIA_ROOT=tempfile.mkdtemp(prefix='jds-test-media-'))
class AblaufTests(TestCase):
    """Alle Funktionen des SR-Bereichs einmal durchspielen (km-Berechnung gemockt, kein Netz)."""

    def setUp(self):
        self.user = User.objects.create_user(
            'sr@example.de', 'handball-2026!', first_name='Joel', last_name='Nicolay', verband=Verband.objects.get(kuerzel='HVS'),
            strasse='Niederwiesstraße 20', plz='66822', ort='Lebach', iban='DE02120300000000202051',
        )
        self.client.force_login(self.user)
        p = mock.patch('schiedsrichter.services.travel.travel_between',
                       return_value=mock.Mock(km_round_trip=40, km_one_way=20, minutes_one_way=25))
        self.travel = p.start()
        self.addCleanup(p.stop)

    def _import(self, datei, source):
        with open(DATA / 'samples' / datei, 'rb') as f:
            res = self.client.post(reverse('sr:import'), {'source': source, 'datei': f})
        self.assertRedirects(res, reverse('sr:import_pruefen'))
        seite = self.client.get(reverse('sr:import_pruefen'))
        self.assertEqual(seite.status_code, 200)
        n = seite.context['a']['total']
        return self.client.post(reverse('sr:import_pruefen'), {'auswahl': [str(i) for i in range(n)]})

    def test_ics_import_update_und_km(self):
        self.assertRedirects(self._import('sample-nuliga.ics', 'nuliga'), reverse('sr:einsaetze'))
        n = Assignment.objects.filter(user=self.user).count()
        self.assertGreater(n, 0)
        self.assertFalse(Assignment.objects.filter(user=self.user, travel_km__isnull=True).exists())

        # Update-Datei (1001 verlegt, 1002 abgesagt, 1006 neu): bekannte UIDs werden aktualisiert, nicht dupliziert
        self._import('sample-nuliga-update.ics', 'nuliga')
        self.assertEqual(Assignment.objects.filter(user=self.user, source='nuliga').count(), n + 1)
        self.assertEqual(Assignment.objects.filter(user=self.user, source_uid='nuliga-hvs-2026-4471-1001').count(), 1)
        self.assertTrue(Assignment.objects.filter(user=self.user, status='verlegt').exists())
        self.assertTrue(Assignment.objects.filter(user=self.user, status='abgesagt').exists())

    def test_h360_import_mit_spielnummer(self):
        self._import('sample-h360.csv', 'handball360')
        a = Assignment.objects.get(user=self.user, spielnummer='2627SARBKRKERMA0104')
        self.assertEqual(a.source, 'handball360')
        self.assertEqual(a.league_key, 'a_liga')

    def test_import_ohne_datei(self):
        res = self.client.post(reverse('sr:import'), {'source': 'nuliga'})
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.context['form'].non_field_errors())

    def test_quittung_auszahlung_neu_erzeugen_loeschen(self):
        self._import('sample-h360.csv', 'handball360')
        a = Assignment.objects.filter(user=self.user, status='bestätigt').first()
        res = self.client.post(reverse('sr:quittung_neu'), {'ids': [a.pk]})
        r = self.user.quittungen.get()
        self.assertRedirects(res, f"{reverse('sr:quittungen')}?neu={r.pk}")
        self.assertContains(self.client.get(reverse('sr:quittungen')), f'Quittung Nr. {r.pk}')

        # Doppelte Quittung verhindert
        self.client.post(reverse('sr:quittung_neu'), {'ids': [a.pk]})
        self.assertEqual(self.user.quittungen.count(), 1)

        self.client.post(reverse('sr:quittung_auszahlung', args=[r.pk]), {
            f'r{r.pk}-payout_status': 'nicht_ausgezahlt', f'r{r.pk}-payout_date': '', f'r{r.pk}-payer': '',
        })
        r.refresh_from_db()
        self.assertEqual(r.payout_status, 'nicht_ausgezahlt')
        self.assertIn('mailto:hvs-schiedsrichterwart@hvsaar.de', self.client.get(reverse('sr:quittungen')).content.decode())

        self.client.post(reverse('sr:quittung_neu_erzeugen', args=[r.pk]))
        self.assertEqual(self.client.get(reverse('sr:quittung_pdf', args=[r.pk]))['Content-Type'], 'application/pdf')
        self.client.post(reverse('sr:quittung_loeschen', args=[r.pk]))
        self.assertFalse(self.user.quittungen.exists())

    def test_mehrfachauswahl_je_spiel_eine_quittung(self):
        self._import('sample-h360.csv', 'handball360')
        ids = list(Assignment.objects.filter(user=self.user, status='bestätigt').order_by('game_datetime').values_list('pk', flat=True)[:3])
        self.client.post(reverse('sr:quittung_neu'), {'ids': ids})
        self.assertEqual(self.user.quittungen.count(), 3)
        for r in self.user.quittungen.all():
            self.assertEqual(r.assignments.count(), 1)

    def test_spielnummer_pflicht(self):
        res = self.client.post(reverse('sr:einsatz_neu'), {
            'game_datetime': '2030-10-10T15:00', 'role': 'sr1', 'home_team': 'A', 'competition_type': 'championship',
            'league': 'L', 'status': 'angesetzt', 'games_count': 1,
        })
        self.assertEqual(res.status_code, 200)
        self.assertIn('spielnummer', res.context['form'].errors)

    def test_km_automatisch_und_manuelle_km(self):
        a = Assignment.objects.create(user=self.user, game_datetime=datetime(2026, 10, 10, 15), home_team='A', away_team='B',
                                      league='Bezirksliga', league_key='bezirksliga', hall='Halle', hall_address='Am Markt 1, 66557 Illingen')
        self.client.get(reverse('sr:einsaetze'))  # berechnet fehlende km automatisch
        a.refresh_from_db()
        self.assertEqual((a.travel_km, a.travel_km_auto), (40, True))

        # Von Hand geänderte km werden nicht mehr überschrieben – auch nicht bei neuer Hallenadresse
        daten = {'game_datetime': '2026-10-10T15:00', 'role': 'sr1', 'spielnummer': '2627SARBLMA0102', 'home_team': 'A', 'away_team': 'B', 'competition_type': 'championship',
                 'league_key': 'bezirksliga', 'league': 'Bezirksliga', 'hall': 'Halle', 'hall_address': 'Neue Str. 2, 66557 Illingen',
                 'status': 'geleitet', 'games_count': 1, 'travel_km': 55}
        self.client.post(reverse('sr:einsatz', args=[a.pk]), daten)
        a.refresh_from_db()
        self.assertEqual((a.travel_km, a.travel_km_auto), (55, False))
        self.assertEqual(float(a.expense_total), 30 + 16.5)

        # „km berechnen“ überschreibt bewusst
        self.client.post(reverse('sr:einsatz', args=[a.pk]), {**daten, 'aktion': 'km'})
        a.refresh_from_db()
        self.assertEqual((a.travel_km, a.travel_km_auto), (40, True))

        self.client.post(reverse('sr:einsatz', args=[a.pk]), {'aktion': 'loeschen'})
        self.assertFalse(Assignment.objects.filter(pk=a.pk).exists())

    def test_auszahlung_erhalten_markiert_geleitet(self):
        a = Assignment.objects.create(user=self.user, game_datetime=datetime(2030, 10, 10, 15), home_team='A', away_team='B',
                                      league='Bezirksliga', league_key='bezirksliga', status='bestätigt', travel_km=20)
        self.client.post(reverse('sr:quittung_neu'), {'ids': [a.pk]})
        r = self.user.quittungen.get()
        self.client.post(reverse('sr:quittung_auszahlung', args=[r.pk]), {
            f'r{r.pk}-payout_status': 'erhalten', f'r{r.pk}-payout_date': '', f'r{r.pk}-payer': 'HSG A',
        })
        a.refresh_from_db()
        r.refresh_from_db()
        self.assertEqual(a.status, 'geleitet')
        self.assertEqual(r.payout_date, date.today())

    def test_vergangene_spiele_automatisch_geleitet(self):
        alt = Assignment.objects.create(user=self.user, game_datetime=datetime(2026, 1, 10, 15), home_team='A', league='L', status='bestätigt', travel_km=10)
        offen = Assignment.objects.create(user=self.user, game_datetime=datetime(2026, 1, 11, 15), home_team='B', league='L', status='angesetzt', travel_km=10)
        zukunft = Assignment.objects.create(user=self.user, game_datetime=datetime(2030, 1, 10, 15), home_team='C', league='L', status='bestätigt', travel_km=10)
        self.client.get(reverse('sr:dashboard'))
        for x in (alt, offen, zukunft):
            x.refresh_from_db()
        self.assertEqual((alt.status, offen.status, zukunft.status), ('geleitet', 'angesetzt', 'bestätigt'))

        # Quittung für ein vergangenes, nur angesetztes Spiel → geleitet
        self.client.post(reverse('sr:quittung_neu'), {'ids': [offen.pk]})
        offen.refresh_from_db()
        self.assertEqual(offen.status, 'geleitet')

    def test_neue_adresse_berechnet_km_neu(self):
        a = Assignment.objects.create(user=self.user, game_datetime=datetime(2030, 10, 10, 15), home_team='A', league='L',
                                      hall_address='Am Markt 1, 66557 Illingen', travel_km=12, travel_km_auto=True)
        manuell = Assignment.objects.create(user=self.user, game_datetime=datetime(2030, 10, 11, 15), home_team='B', league='L',
                                            hall_address='Am Markt 1, 66557 Illingen', travel_km=99)
        daten = {'first_name': 'Joel', 'last_name': 'Nicolay', 'verein': '', 'strasse': 'Neue Straße 1', 'plz': '66111',
                 'ort': 'Saarbrücken', 'telefon': '', 'iban': '', 'standard_rolle': 'sr1', 'partner_name': '', 'partner_adresse': ''}
        self.client.post(reverse('einstellungen'), daten)
        a.refresh_from_db()
        manuell.refresh_from_db()
        self.assertEqual((a.travel_km, a.travel_km_auto), (40, True))
        self.assertEqual(manuell.travel_km, 99)
        self.assertEqual(self.travel.call_args[0][0], 'Neue Straße 1, 66111 Saarbrücken')

    def _spiel(self, tage: float, status='bestätigt', **kw):
        from datetime import timedelta

        return Assignment.objects.create(user=self.user, game_datetime=(datetime.now() + timedelta(days=tage)).replace(second=0, microsecond=0),
                                         home_team=kw.pop('home_team', 'Heim'), away_team='Gast', league='Bezirksliga', league_key='bezirksliga',
                                         status=status, hall='Halle', hall_address='Am Markt 1, 66557 Illingen', **kw)

    def test_quittung_automatisch_3_tage_vorher(self):
        bald = self._spiel(2)                        # in 2 Tagen → Quittung
        genau = self._spiel(2.9, home_team='Genau')  # knapp innerhalb 3 Tage → Quittung
        spaeter = self._spiel(5)                     # in 5 Tagen → noch nicht
        abgesagt = self._spiel(1, status='abgesagt')
        verpasst = self._spiel(-2)                   # vor 2 Tagen gespielt, App nicht geöffnet → nachträglich
        nie_zugesagt = self._spiel(-2, status='angesetzt', home_team='Offen')
        res = self.client.get(reverse('sr:dashboard'))
        self.assertContains(res, 'Abrechnungsbogen bereit')

        for a in (bald, genau, verpasst):
            self.assertTrue(a.quittungen.exists(), a.home_team)
        for a in (spaeter, abgesagt, nie_zugesagt):
            self.assertFalse(a.quittungen.exists(), a.home_team)
        q = bald.quittungen.get()
        self.assertTrue(q.automatisch)
        self.assertTrue(q.pdf)

        # zweiter Aufruf erstellt nichts doppelt
        anzahl = self.user.quittungen.count()
        self.client.get(reverse('sr:einsaetze'))
        self.assertEqual(self.user.quittungen.count(), anzahl)

    def test_doppelansetzung_je_spiel_quittung_und_aktuelles_pdf(self):
        from datetime import timedelta

        erstes = self._spiel(1, spielnummer='2627SARBLMA0201', hallennummer='210048')
        zweites = self._spiel(1, home_team='Zweites', spielnummer='2627SARBLMA0202')
        morgen = (datetime.now() + timedelta(days=1)).replace(hour=14, minute=0, second=0, microsecond=0)
        erstes.game_datetime, zweites.game_datetime = morgen, morgen + timedelta(minutes=105)  # 14:00 + 15:45, gleiche Halle
        erstes.save()
        zweites.save()
        self.client.get(reverse('sr:einsaetze'))
        q1, q2 = erstes.quittungen.get(), zweites.quittungen.get()
        self.assertNotEqual(q1.pk, q2.pk)  # je Spiel eine Quittung (Auszahlung je Heimverein)

        # Hallennummer wurde für das zweite Spiel in derselben Halle übernommen
        zweites.refresh_from_db()
        self.assertEqual(zweites.hallennummer, '210048')

        text = PdfReader(__import__('io').BytesIO(self.client.get(reverse('sr:quittung_pdf', args=[q2.pk])).content)).pages[0].extract_text()
        tag = morgen.strftime('%d.%m.%Y')
        self.assertIn('2627SARBLMA0202', text)
        self.assertIn('210048', text)
        # gemeinsame Fahrt: Abfahrt vor dem 1. Spiel (14:00 − 60 − 25 min), Rückkehr nach dem 2. Spiel (15:45 + 120 + 25 min)
        self.assertIn(f'{tag} 12:35 Uhr', text)
        self.assertIn(f'{tag} 18:10 Uhr', text)
        self.assertIn(f'Lebach, {tag}', text)  # Ort, Datum = Spieltag
        self.assertIn('\n20\n6,00', text)  # 40 km anteilig auf 2 Spiele = 20 km × 0,30 €

        # km geändert → PDF wird beim Öffnen automatisch neu erzeugt
        stand = q1.pdf_stand
        daten = {'game_datetime': erstes.game_datetime.strftime('%Y-%m-%dT%H:%M'), 'role': 'sr1', 'spielnummer': '2627SARBLMA0201',
                 'home_team': 'Heim', 'away_team': 'Gast', 'competition_type': 'championship', 'league_key': 'bezirksliga',
                 'league': 'Bezirksliga', 'hall': 'Halle', 'hallennummer': '210048', 'hall_address': 'Am Markt 1, 66557 Illingen',
                 'status': 'bestätigt', 'games_count': 1, 'travel_km': 100}
        self.client.post(reverse('sr:einsatz', args=[erstes.pk]), daten)
        pdf = self.client.get(reverse('sr:quittung_pdf', args=[q1.pk]))
        q1.refresh_from_db()
        self.assertNotEqual(q1.pdf_stand, stand)
        self.assertIn('\n50\n15,00', PdfReader(__import__('io').BytesIO(pdf.content)).pages[0].extract_text())

        # unverändert → kein neues PDF
        stand, name = q1.pdf_stand, q1.pdf.name
        self.client.get(reverse('sr:quittung_pdf', args=[q1.pk]))
        q1.refresh_from_db()
        self.assertEqual((q1.pdf_stand, q1.pdf.name), (stand, name))

        # „Abrechnungsbogen (PDF)“ im Dashboard öffnet die vorhandene Quittung
        self.assertRedirects(self.client.post(reverse('sr:quittung_vorbereiten', args=[zweites.pk])), reverse('sr:quittung_pdf', args=[q2.pk]))

    def test_unauffindbare_halle_wird_nicht_endlos_versucht(self):
        from .services.distance import DistanceError

        a = Assignment.objects.create(user=self.user, game_datetime=datetime(2030, 10, 10, 15), home_team='A', league='L',
                                      hall_address='Musterstraße 12, 66333 Musterstadt')
        self.travel.side_effect = DistanceError('Adresse nicht gefunden')
        self.client.get(reverse('sr:einsaetze'))
        self.client.get(reverse('sr:einsaetze'))
        self.assertEqual(self.travel.call_count, 1)
        a.refresh_from_db()
        self.assertEqual(a.km_fehler, 'Adresse nicht gefunden')
        self.assertContains(self.client.get(reverse('sr:einsaetze')), 'km: Adresse prüfen')

        # Neue Hallenadresse → neuer Versuch
        self.travel.side_effect = None
        self.client.post(reverse('sr:einsatz', args=[a.pk]), {
            'game_datetime': '2030-10-10T15:00', 'role': 'sr1', 'spielnummer': '3031SARBLMA0103', 'home_team': 'A', 'competition_type': 'championship',
            'league': 'L', 'hall_address': 'Am Markt 1, 66557 Illingen', 'status': 'angesetzt', 'games_count': 1,
        })
        a.refresh_from_db()
        self.assertEqual((a.travel_km, a.km_fehler), (40, ''))

    def test_auswertung_csv_und_dashboard(self):
        self._import('sample-h360.csv', 'handball360')
        self.assertContains(self.client.get(reverse('sr:auswertung')), 'Spesen nach Spielklasse')
        csv_res = self.client.get(reverse('sr:export_csv'))
        self.assertEqual(csv_res['Content-Type'], 'text/csv; charset=utf-8')
        self.assertIn('2627SARBKRKERMA0104', csv_res.content.decode('utf-8-sig'))
        self.assertEqual(self.client.get(reverse('sr:dashboard')).status_code, 200)
        self.assertEqual(self.client.get(reverse('hub:dashboard')).status_code, 200)

    def test_einstellungen_speichern_und_logout(self):
        daten = {
            'first_name': 'Joel', 'last_name': 'Nicolay', 'verein': 'RW Schaumberg',
            'strasse': 'Niederwiesstraße 20', 'plz': '66822', 'ort': 'Lebach', 'telefon': '', 'iban': '',
            'standard_rolle': 'sr2', 'partner_name': 'Otto, Simon', 'partner_adresse': 'Birkenweg 38, 66127 Saarbrücken',
        }
        self.assertRedirects(self.client.post(reverse('einstellungen'), daten), reverse('einstellungen'))
        self.user.refresh_from_db()
        self.assertEqual((self.user.standard_rolle, self.user.partner_name), ('sr2', 'Otto, Simon'))
        self.assertRedirects(self.client.post(reverse('logout')), reverse('login'))
        self.assertRedirects(self.client.get(reverse('sr:dashboard')), f"{reverse('login')}?next={reverse('sr:dashboard')}")

    def test_fremde_daten_nicht_sichtbar(self):
        fremd = User.objects.create_user('x@example.de', 'handball-2026!', first_name='X', last_name='Y')
        a = Assignment.objects.create(user=fremd, game_datetime=datetime(2026, 10, 10, 15), home_team='A', league='L')
        self.assertEqual(self.client.get(reverse('sr:einsatz', args=[a.pk])).status_code, 404)

    def test_admin(self):
        self.user.is_staff = self.user.is_superuser = True
        self.user.save()
        for url in ['admin:index', 'admin:accounts_user_changelist', 'admin:schiedsrichter_assignment_changelist',
                    'admin:schiedsrichter_receipt_changelist', 'admin:verbaende_verband_changelist',
                    'admin:verbaende_rulepack_changelist', 'admin:waffle_flag_changelist']:
            self.assertEqual(self.client.get(reverse(url)).status_code, 200, url)
