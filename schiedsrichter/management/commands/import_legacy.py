"""Übernimmt Konten, Einsätze und Quittungen aus der alten Node-App (SQLite)."""

import json
import sqlite3
from datetime import datetime
from decimal import Decimal
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from accounts.models import User
from schiedsrichter.models import Assignment, Receipt
from schiedsrichter.services.assignments import recalc_user
from schiedsrichter.services.ics import extract_spielnummer
from verbaende.models import Verband

DEFAULT_DB = Path(settings.BASE_DIR) / 'apps' / 'api' / 'data' / 'jds.db'


class Command(BaseCommand):
    help = 'Importiert Daten aus der alten Node-App (apps/api/data/jds.db). Bereits vorhandene E-Mail-Adressen werden übersprungen.'

    def add_arguments(self, parser):
        parser.add_argument('--db', default=str(DEFAULT_DB))

    def handle(self, *args, db: str, **opts):
        if not Path(db).exists():
            raise CommandError(f'Datenbank nicht gefunden: {db}')
        con = sqlite3.connect(db)
        con.row_factory = sqlite3.Row
        hvs = Verband.objects.get(kuerzel='HVS')

        with transaction.atomic():
            for u in con.execute('SELECT * FROM users'):
                if User.objects.filter(email=u['email'].lower()).exists():
                    self.stdout.write(f'übersprungen (existiert): {u["email"]}')
                    continue
                user = User(
                    email=u['email'].lower(),
                    password=f'bcrypt${u["password_hash"]}',  # bcryptjs-Hash, von Django direkt prüfbar
                    first_name=u['first_name'], last_name=u['last_name'],
                    strasse=u['street'] or '', plz=u['zip'] or '', ort=u['city'] or '', telefon=u['phone'] or '',
                    iban=u['iban'] or '', verein=u['club'] or '', standard_rolle=u['default_role'] or 'sr1',
                    partner_name=u['partner_name'] or '', partner_adresse=u['partner_address'] or '',
                    verband=hvs, saison=u['season'] or '2026/27', ist_schiedsrichter=True,
                    is_staff=bool(u['is_admin']), is_superuser=bool(u['is_admin']),
                )
                user.save()

                id_map: dict[int, Assignment] = {}
                cols = {r[1] for r in con.execute('PRAGMA table_info(assignments)')}
                for a in con.execute('SELECT * FROM assignments WHERE user_id = ?', (u['id'],)):
                    get = lambda k, d=None: a[k] if k in cols else d  # noqa: E731
                    id_map[a['id']] = Assignment.objects.create(
                        user=user, source=a['source'], source_uid=a['source_uid'], sequence=a['sequence'],
                        last_modified=a['last_modified'],
                        spielnummer=extract_spielnummer(a['notes'] or '', a['source_uid'] or ''),
                        game_datetime=datetime.strptime(a['game_datetime'][:16], '%Y-%m-%dT%H:%M'),
                        home_team=a['home_team'], away_team=a['away_team'] or '', league=a['league'],
                        league_key=a['league_key'], competition_type=a['competition_type'], cup_round=a['cup_round'],
                        tournament_group=get('tournament_group'), tournament_tier=a['tournament_tier'],
                        games_count=a['games_count'], hall=a['hall'] or '', hall_address=a['hall_address'] or '',
                        role=a['role'], status=a['status'], notes=a['notes'] or '',
                        travel_km=a['travel_km'], travel_km_manual=bool(a['travel_km_manual']),
                        travel_km_auto=bool(get('travel_km_auto', 0)), travel_minutes=get('travel_minutes'),
                        travel_mitfahrer=bool(get('travel_mitfahrer', 0)),
                        pnv_cost=get('pnv_cost'), other_cost=get('other_cost'),
                    )
                recalc_user(user)

                n_receipts = 0
                for r in con.execute('SELECT * FROM receipts WHERE user_id = ?', (u['id'],)):
                    ids = [i for i in json.loads(r['assignment_ids']) if i in id_map]
                    if not ids:
                        continue
                    receipt = Receipt.objects.create(
                        user=user, season=r['season'], total=Decimal(str(r['total'])), payout_status=r['payout_status'],
                        payout_date=r['payout_date'] or None, payer=r['payer'] or '',
                    )
                    receipt.assignments.set([id_map[i] for i in ids])
                    n_receipts += 1  # PDF wird beim ersten Öffnen im neuen Layout erzeugt
                self.stdout.write(self.style.SUCCESS(f'{user.email}: {len(id_map)} Einsätze, {n_receipts} Quittungen übernommen'))
