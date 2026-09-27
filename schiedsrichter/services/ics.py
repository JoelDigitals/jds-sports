"""RFC-5545-Parser (UID, SEQUENCE, TZID/UTC, Folding, CANCELLED) und Muster-Extraktion für SR-Ansetzungen."""

import re
from dataclasses import dataclass
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from .rules import match_league_key

BERLIN = ZoneInfo('Europe/Berlin')


@dataclass
class IcsEvent:
    uid: str
    sequence: int
    last_modified: str | None
    dt_start: str  # lokal, 'YYYY-MM-DDTHH:MM'
    summary: str
    description: str
    location: str
    status: str | None


def _unfold(text: str) -> list[str]:
    t = text.replace('\r\n', '\n').replace('\r', '\n')
    t = re.sub(r'\n[ \t]', '', t)
    return [l for l in t.split('\n') if l.strip()]


def _parse_prop(line: str):
    m = re.match(r'^([A-Za-z0-9-]+)((?:;[^:]*)*):([\s\S]*)$', line)
    if not m:
        return None
    params = {}
    for p in filter(None, (m.group(2) or '').split(';')):
        if '=' in p:
            k, v = p.split('=', 1)
            params[k.upper()] = v.strip('"')
    return m.group(1).upper(), params, m.group(3)


def _unescape(v: str) -> str:
    return re.sub(r'\\n', '\n', v, flags=re.I).replace('\\,', ',').replace('\\;', ';').replace('\\\\', '\\')


def _parse_dtstart(params: dict, value: str) -> str:
    v = value.strip()
    if re.fullmatch(r'\d{8}', v):
        return f'{v[:4]}-{v[4:6]}-{v[6:8]}T00:00'
    m = re.fullmatch(r'(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)', v)
    if not m:
        return datetime.now().strftime('%Y-%m-%dT%H:%M')
    y, mo, d, h, mi, s, z = m.groups()
    naive = datetime(int(y), int(mo), int(d), int(h), int(mi), int(s))
    if z == 'Z':
        return naive.replace(tzinfo=timezone.utc).astimezone(BERLIN).strftime('%Y-%m-%dT%H:%M')
    tzid = params.get('TZID')
    if tzid and not re.search(r'berlin|cet|cest|europe', tzid, re.I):
        try:
            return naive.replace(tzinfo=ZoneInfo(tzid)).astimezone(BERLIN).strftime('%Y-%m-%dT%H:%M')
        except Exception:
            pass  # unbekannte TZID: als Europe/Berlin behandeln
    return naive.strftime('%Y-%m-%dT%H:%M')


def parse_ics(text: str) -> list[IcsEvent]:
    events: list[IcsEvent] = []
    current: dict | None = None
    for line in _unfold(text):
        prop = _parse_prop(line)
        if not prop:
            continue
        name, params, value = prop
        if name == 'BEGIN' and value.strip().upper() == 'VEVENT':
            current = {}
        elif name == 'END' and value.strip().upper() == 'VEVENT':
            if current and 'UID' in current and 'DTSTART' in current:
                get = lambda n: current.get(n, (None, None))  # noqa: E731
                seq = get('SEQUENCE')[1]
                status = get('STATUS')[1]
                events.append(IcsEvent(
                    uid=_unescape(current['UID'][1]).strip(),
                    sequence=int(seq) if seq and seq.strip().isdigit() else 0,
                    last_modified=get('LAST-MODIFIED')[1],
                    dt_start=_parse_dtstart(*current['DTSTART']),
                    summary=_unescape(get('SUMMARY')[1] or ''),
                    description=_unescape(get('DESCRIPTION')[1] or ''),
                    location=_unescape(get('LOCATION')[1] or ''),
                    status=status.strip().upper() if status else None,
                ))
            current = None
        elif current is not None and name not in current:
            current[name] = (params, value)
    return events


# Handball360/nuLiga-Spielnummern: Saison (z. B. 2627) + Buchstaben (Verband/Klasse/Staffel) + laufende Nummer
SPIELNUMMER_RE = re.compile(r'\b(\d{4}[A-Z]{2,}[A-Z0-9]*\d{2,})\b')


def extract_spielnummer(*texts: str) -> str:
    for t in texts:
        if not t:
            continue
        m = re.search(r'spiel(?:nummer|-?nr\.?)\s*:?\s*([A-Za-z0-9][A-Za-z0-9/-]*)', t, re.I)
        if m:
            return m.group(1)
    for t in texts:
        m = SPIELNUMMER_RE.search(t or '')
        if m:
            return m.group(1)
    return ''


def detect_competition(blob: str) -> str:
    if re.search(r'turnier|hallenmasters|hallen-master', blob, re.I):
        return 'tournament'
    if re.search(r'pokal', blob, re.I):
        return 'cup'
    if re.search(r'freundschaft|vorbereitung|testspiel', blob, re.I):
        return 'friendly'
    return 'championship'


def detect_cup_round(blob: str) -> str | None:
    checks = [
        (r'quali', 'quali'),
        (r'halbfinal', 'halbfinalturnier'),
        (r'final\s*4|finale\s*4|final4', 'final4'),
        (r'3\.\s*runde|runde\s*3', 'r2_3'),
        (r'2\.\s*runde|runde\s*2', 'r2_3'),
        (r'1\.\s*runde|runde\s*1|erste runde', 'r1'),
    ]
    for pattern, key in checks:
        if re.search(pattern, blob, re.I):
            return key
    return None


def split_teams(teams: str) -> tuple[str, str]:
    for sep, pattern in [(' – ', r' – '), (' vs. ', r'\svs\.\s'), (' vs ', r'\svs\s'), (' gegen ', r'\sgegen\s'), (' - ', r'\s-\s')]:
        m = re.search(pattern, teams, re.I)
        if m and m.start() > 0:
            home, away = teams[: m.start()].strip(), teams[m.start() + len(sep):].strip()
            if home and away:
                return home, away
    return teams.strip(), ''


def draft_from_event(event: IcsEvent, pack: dict, default_role: str) -> dict:
    text = re.sub(r'^\s*(sr|schiedsrichter|schiedsrichterin|einsatz)\s*:\s*', '', event.summary, flags=re.I).strip()
    league_part, teams_part = '', text
    idx = text.find(':')
    if 2 < idx < 60:
        league_part, teams_part = text[:idx].strip(), text[idx + 1:].strip()
    home, away = split_teams(teams_part)
    blob = f'{league_part} {teams_part} {event.description}'
    comp = detect_competition(blob)
    league_key = match_league_key(f'{league_part} {event.description}', pack)
    league = league_part or next((c['name'] for c in pack['classes'] if c['key'] == league_key), None) or 'Unbekannte Liga'
    return {
        'source_uid': event.uid,
        'sequence': event.sequence,
        'last_modified': event.last_modified,
        'spielnummer': extract_spielnummer(event.description, event.summary, event.uid),
        'game_datetime': event.dt_start,
        'home_team': home,
        'away_team': away,
        'league': league,
        'league_key': league_key,
        'competition_type': comp,
        'cup_round': detect_cup_round(blob) if comp == 'cup' else None,
        'tournament_group': None,
        'tournament_tier': None,
        'games_count': 1,
        'hall': event.location.split(',')[0].strip(),
        'hall_address': event.location.strip(),
        'role': default_role,
        'status': 'abgesagt' if event.status == 'CANCELLED' else 'angesetzt',
        'notes': event.description[:500],
    }
