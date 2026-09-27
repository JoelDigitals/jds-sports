"""CSV-Export der Handball360-Schiedsrichterplattform (MISQUAD) → Einsatz-Entwürfe."""

import csv
import io
import re

from .ics import detect_competition, detect_cup_round
from .rules import match_league_key


def is_h360_csv(text: str) -> bool:
    return 'Spielnummer' in text and 'Datum und Uhrzeit' in text


def parse_csv(text: str) -> list[dict]:
    clean = text.lstrip('﻿')
    return [{(k or '').strip(): (v or '').strip() for k, v in row.items()} for row in csv.DictReader(io.StringIO(clean))]


def _league(wettbewerb: str) -> str:
    idx = wettbewerb.upper().find('GRUPO')
    if idx >= 0:
        return re.sub(r'^[\s:;-]+', '', wettbewerb[idx + 5:]).strip()
    return re.sub(r'\s{2,}', ' ', wettbewerb).strip()


def _teams(spiel: str) -> tuple[str, str]:
    parts = spiel.split('Heimmannschaft')
    home = re.sub(r'\s{2,}', ' ', parts[0]).strip()
    rest = parts[1] if len(parts) > 1 else ''
    away = rest.split('Gastmannschaft')[0]
    away = re.sub(r'Aufstellung ansehen\s*\(\d+\)', '', away, flags=re.I)
    away = re.sub(r'\s*-\s*$', '', re.sub(r'\s{2,}', ' ', away)).strip()
    return home, away


def _datetime(cell: str) -> str | None:
    m = re.search(r'(\d{1,2})/(\d{1,2})/(\d{4})\s+(\d{1,2}):(\d{2})', re.sub(r'\s+', ' ', cell))
    if not m:
        return None
    d, mo, y, h, mi = m.groups()
    return f'{y}-{int(mo):02d}-{int(d):02d}T{int(h):02d}:{mi}'


# Handball360 hat die Hallenspalte umbenannt („Halle“ → „Spielfeld“) – alle bekannten Namen akzeptieren
HALLEN_SPALTEN = ('Spielfeld', 'Halle', 'Spielstätte', 'Spielort')


def _hallen_zelle(row: dict) -> str:
    return next((row[k] for k in HALLEN_SPALTEN if row.get(k, '').strip()), '')


def _hall(cell: str) -> tuple[str, str]:
    raw = cell.strip()
    chunks = re.split(r'\s{2,}', raw)
    hall = chunks[0].strip()
    if len(chunks) < 2 and ',' in hall:
        hall = hall.split(',')[0].strip()
    return hall, re.sub(r'\s{2,}', ' ', raw).strip()


def _status(ansetzungen: str, status_col: str) -> tuple[str, str]:
    if status_col.strip().lower().startswith('abgeschlossen'):
        return 'geleitet', 'Spiel lt. H360 abgeschlossen'
    first = re.split(r'\s{2,}|\.\.\.', ansetzungen)[0].lower().strip()
    ans = ansetzungen.lower()
    if 'akzeptiert' in first or 'aceptada' in first:
        return 'bestätigt', 'Ansetzung akzeptiert'
    if 'rechazada' in first or 'abgelehnt' in first:
        return 'abgesagt', 'Ansetzung abgelehnt'
    if 'akzeptiert' in ans or ('aceptada' in ans and 'rechazada' not in ans):
        return 'bestätigt', 'Ansetzung akzeptiert'
    return 'angesetzt', 'noch keine Rückmeldung'


def drafts_from_rows(rows: list[dict], pack: dict, default_role: str) -> tuple[list[dict], int]:
    drafts, skipped = [], 0
    for row in rows:
        nummer = row.get('Spielnummer', '').strip()
        dt = _datetime(row.get('Datum und Uhrzeit', ''))
        if not nummer or not dt:
            skipped += 1
            continue
        league = _league(row.get('Wettbewerbe', ''))
        home, away = _teams(row.get('Spiel', ''))
        hall, hall_address = _hall(_hallen_zelle(row))
        blob = f'{league} {row.get("Wettbewerbe", "")}'
        comp = detect_competition(blob)
        status, note = _status(row.get('Ansetzungen', ''), row.get('Status', ''))
        drafts.append({
            'source_uid': nummer,
            'sequence': 0,
            'last_modified': None,
            'spielnummer': nummer,
            'game_datetime': dt,
            'home_team': home,
            'away_team': away,
            'league': league or 'Unbekannte Liga',
            'league_key': match_league_key(league, pack),
            'competition_type': comp,
            'cup_round': detect_cup_round(blob) if comp == 'cup' else None,
            'tournament_group': None,
            'tournament_tier': None,
            'games_count': 1,
            'hall': hall,
            'hall_address': hall_address,
            'role': default_role,
            'status': status,
            'notes': f'Handball360: {note}',
        })
    return drafts, skipped
