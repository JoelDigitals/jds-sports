"""Import: Datei/Webcal analysieren (neu/geändert/unverändert) und Auswahl übernehmen."""

import re
import urllib.request
from datetime import datetime

from ..models import Assignment
from . import h360, hallen
from .assignments import recalc_user
from .ics import draft_from_event, parse_ics
from .rules import pack_for_user

USER_MAINTAINED = ('geleitet', 'ausgefallen_angereist', 'ausgefallen_nicht_angereist')


class ImportFehler(Exception):
    pass


def fetch_webcal(url: str) -> str:
    http_url = re.sub(r'^webcal://', 'https://', url.strip(), flags=re.I)
    try:
        with urllib.request.urlopen(urllib.request.Request(http_url, headers={'User-Agent': 'JDS-Sports'}), timeout=15) as res:
            return res.read().decode('utf-8', errors='replace')
    except Exception as e:
        raise ImportFehler(f'Kalender-URL nicht abrufbar ({e})') from e


def _changes(draft: dict, existing: Assignment | None) -> list[str]:
    if not existing:
        return []
    changes = []
    if existing.game_datetime.strftime('%Y-%m-%dT%H:%M') != draft['game_datetime']:
        changes.append('Termin')
    if existing.home_team != draft['home_team']:
        changes.append('Heimmannschaft')
    if existing.away_team != draft['away_team']:
        changes.append('Gastmannschaft')
    if (existing.league_key or None) != draft['league_key'] and (existing.league_key or draft['league_key']):
        changes.append('Spielklasse')
    if existing.hall != draft['hall'] and (existing.hall or draft['hall']):
        changes.append('Halle')
    if existing.status != draft['status'] and draft['status'] == 'abgesagt':
        changes.append('Status: abgesagt')
    if draft['sequence'] > existing.sequence:
        changes.append('Sequenz (nuLiga-Update)')
    return changes


def analyze(user, text: str, source: str) -> dict:
    content = text.lstrip('﻿').lstrip()
    pack = pack_for_user(user)
    skipped = 0
    if re.match(r'BEGIN:VCALENDAR', content, re.I):
        events = parse_ics(content)
        if not events:
            raise ImportFehler('Keine Termine (VEVENT) in der ICS-Datei gefunden. Handelt es sich um einen iCal-Export?')
        drafts = [draft_from_event(e, pack, user.standard_rolle) for e in events]
    elif h360.is_h360_csv(content):
        source = 'handball360'
        drafts, skipped = h360.drafts_from_rows(h360.parse_csv(content), pack, user.standard_rolle)
        if not drafts:
            raise ImportFehler('Keine gültigen Ansetzungen in der CSV-Datei gefunden (Spielnummer/Datum fehlen?).')
    else:
        raise ImportFehler('Unbekanntes Dateiformat. Erwartet: iCal-Export (.ics) oder CSV-Export der Handball360-Schiedsrichterplattform.')

    items = []
    for d in drafts:
        existing = Assignment.objects.filter(user=user, source=source, source_uid=d['source_uid']).first()
        changes = _changes(d, existing)
        action = 'new' if not existing else 'changed' if changes else 'unchanged'
        items.append({'action': action, 'draft': d, 'changes': changes, 'existing_id': existing.pk if existing else None})

    return {
        'source': source,
        'total': len(items),
        'new': sum(i['action'] == 'new' for i in items),
        'changed': sum(i['action'] == 'changed' for i in items),
        'unchanged': sum(i['action'] == 'unchanged' for i in items),
        'skipped': skipped,
        'items': items,
    }


FIELDS = [
    'sequence', 'last_modified', 'spielnummer', 'home_team', 'away_team', 'league', 'league_key', 'competition_type',
    'cup_round', 'tournament_group', 'tournament_tier', 'games_count', 'hall', 'hall_address', 'role', 'notes',
]


def apply(user, source: str, drafts: list[dict]) -> tuple[int, int]:
    created = updated = 0
    for d in drafts:
        dt = datetime.strptime(d['game_datetime'], '%Y-%m-%dT%H:%M')
        existing = Assignment.objects.filter(user=user, source=source, source_uid=d['source_uid']).first()
        values = {f: d.get(f) for f in FIELDS}
        values['last_modified'] = values['last_modified'] or None
        if existing:
            if existing.status in USER_MAINTAINED:
                status = existing.status
            elif d['status'] == 'abgesagt':
                status = 'abgesagt'
            elif existing.game_datetime != dt:
                status = 'verlegt'
            else:
                status = existing.status
            hall_changed = existing.hall_address != d['hall_address']
            for k, v in values.items():
                setattr(existing, k, v)
            existing.game_datetime, existing.status = dt, status
            if hall_changed:
                existing.km_fehler = ''
                if existing.travel_km_auto:
                    existing.travel_km = None  # wird mit neuer Halle neu berechnet
            existing.save()
            updated += 1
        else:
            Assignment.objects.create(user=user, source=source, source_uid=d['source_uid'], game_datetime=dt, status=d['status'], **values)
            created += 1
    hallen.alle_erkennen(Assignment.objects.filter(user=user))  # bekannte Hallennummern übernehmen
    recalc_user(user)
    return created, updated
