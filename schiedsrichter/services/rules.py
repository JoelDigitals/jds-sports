"""Regelwerk-Zugriff und Liga-Erkennung."""

import re

from verbaende.models import RulePack, Verband


class KeinRegelwerk(Exception):
    pass


def pack_for_user(user) -> dict:
    """Aktives Regelwerk des Nutzer-Verbands (JSON). Fällt auf HVS zurück, solange andere Verbände keines haben."""
    verband = user.verband or Verband.objects.filter(kuerzel='HVS').first()
    pack = verband.aktives_regelwerk(user.saison) if verband else None
    if pack is None:
        pack = RulePack.objects.filter(aktiv=True).order_by('-id').first()
    if pack is None:
        raise KeinRegelwerk('Kein aktives Regelwerk vorhanden')
    return pack.daten


def hat_eigenes_regelwerk(user) -> bool:
    return bool(user.verband and user.verband.regelwerke.filter(aktiv=True).exists())


GENDER_WORDS = [
    'männer', 'frauen', 'herren', 'damen', 'maenner', 'männlich', 'weiblich',
    'männliche', 'weibliche', 'maennlich', 'maennliche', 'jungen', 'maedchen', 'mädchen', 'weibl', 'männl',
]


def normalize_league_text(s: str) -> str:
    t = s.lower()
    t = re.sub(r'\[[^\]]*\]', ' ', t)
    t = re.sub(r'\([^)]*\)', ' ', t)
    t = t.replace('ä', 'ae').replace('ö', 'oe').replace('ü', 'ue').replace('ß', 'ss')
    t = re.sub(r'[^a-z0-9]+', ' ', t).strip()
    for w in GENDER_WORDS:
        w = w.replace('ä', 'ae').replace('ö', 'oe').replace('ü', 'ue')
        t = re.sub(rf'\b{w}\b', ' ', t)
    return re.sub(r'\s+', ' ', t).strip()


def match_league_key(league_text: str, pack: dict) -> str | None:
    norm = normalize_league_text(league_text)
    if not norm:
        return None
    candidates: list[tuple[str, str]] = []
    for cls in pack['classes']:
        candidates.append((cls['key'], normalize_league_text(cls['name'])))
        for alias in cls['aliases']:
            candidates.append((cls['key'], normalize_league_text(alias)))
    candidates.sort(key=lambda c: len(c[1]), reverse=True)
    for key, needle in candidates:
        if needle and needle in norm:
            return key
    return None


def class_name(pack: dict, key: str | None) -> str | None:
    return next((c['name'] for c in pack['classes'] if c['key'] == key), None)
