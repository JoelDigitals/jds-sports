"""Kennzahlen für Dashboard, Auswertung und CSV-Export."""

from collections import OrderedDict
from datetime import datetime

from ..models import Assignment, Receipt
from .rules import class_name, pack_for_user

AKTIV = ('angesetzt', 'bestätigt', 'verlegt')


def saison_start(saison: str) -> int:
    return int(saison[:4])


def in_saison(user):
    start = saison_start(user.saison)
    return Assignment.objects.filter(
        user=user, game_datetime__gte=datetime(start, 7, 1), game_datetime__lt=datetime(start + 1, 7, 1)
    )


def _effective_km(a: Assignment) -> float:
    travel = next((i for i in a.expense_breakdown if i['key'] == 'travel'), None)
    if not travel:
        return 0
    try:
        return float(travel['detail'].split(' km')[0].replace(',', '.'))
    except (ValueError, KeyError):
        return 0


def kurzuebersicht(user) -> dict:
    rows = list(in_saison(user))
    naechster = Assignment.objects.filter(user=user, game_datetime__gte=datetime.now(), status__in=AKTIV).order_by('game_datetime').first()
    offen = Receipt.objects.filter(user=user, payout_status__in=('offen', 'nicht_ausgezahlt'))
    return {
        'spesen': round(sum(float(r.expense_total or 0) for r in rows), 2),
        'einsaetze': sum(1 for r in rows if r.hat_spesen),
        'naechster': naechster,
        'offen_anzahl': offen.count(),
        'offen_summe': round(sum(float(r.total) for r in offen), 2),
    }


def dashboard(user) -> dict:
    pack = pack_for_user(user)
    rows = list(in_saison(user))
    receipts = list(Receipt.objects.filter(user=user).prefetch_related('assignments'))
    offen = [r for r in receipts if r.payout_status in ('offen', 'nicht_ausgezahlt')]

    naechste = list(Assignment.objects.filter(user=user, game_datetime__gte=datetime.now(), status__in=AKTIV).order_by('game_datetime'))

    fristen: dict[int, dict] = {}
    for r in offen:
        first = min((a.game_datetime for a in r.assignments.all()), default=r.created_at)
        agg = fristen.setdefault(first.year, {'jahr': first.year, 'frist': f'31.01.{first.year + 1}', 'anzahl': 0, 'summe': 0.0})
        agg['anzahl'] += 1
        agg['summe'] = round(agg['summe'] + float(r.total), 2)

    limit = pack['deadlines']['nonPaymentDays']
    ueberfaellig = []
    for r in receipts:
        if r.payout_status == 'nicht_ausgezahlt':
            tage = (datetime.now() - r.created_at).days
            if tage > limit:
                ueberfaellig.append({'receipt': r, 'tage': tage, 'limit': limit})

    return {
        'saison': user.saison,
        'version': pack['version'],
        'spesen': round(sum(float(r.expense_total or 0) for r in rows), 2),
        'einsaetze': sum(1 for r in rows if r.hat_spesen),
        'geleitet': sum(1 for r in rows if r.status == 'geleitet'),
        'offen_summe': round(sum(float(r.total) for r in offen), 2),
        'offen_anzahl': len(offen),
        'km': round(sum(_effective_km(r) for r in rows), 1),
        'naechste': naechste[:10],
        'naechste_gesamt': len(naechste),
        'fristen': sorted(fristen.values(), key=lambda f: f['jahr']),
        'ueberfaellig': ueberfaellig,
        'nichtauszahlung_email': pack['deadlines']['nonPaymentEmail'],
        'letzte_quittungen': receipts[:5],
    }


def zusammenfassung(user) -> dict:
    pack = pack_for_user(user)
    by_class: dict[str, dict] = {}
    by_month: dict[str, dict] = OrderedDict()
    for r in in_saison(user).order_by('game_datetime'):
        name = class_name(pack, r.league_key) or r.league
        c = by_class.setdefault(name, {'name': name, 'anzahl': 0, 'summe': 0.0})
        c['anzahl'] += 1
        c['summe'] = round(c['summe'] + float(r.expense_total or 0), 2)
        key = r.game_datetime.strftime('%Y-%m')
        m = by_month.setdefault(key, {'monat': r.game_datetime.replace(day=1), 'anzahl': 0, 'summe': 0.0})
        m['anzahl'] += 1
        m['summe'] = round(m['summe'] + float(r.expense_total or 0), 2)
    klassen = sorted(by_class.values(), key=lambda c: -c['summe'])
    monate = list(by_month.values())
    max_monat = max((m['summe'] for m in monate), default=0) or 1
    for m in monate:
        m['anteil'] = round(m['summe'] / max_monat * 100)
    return {'klassen': klassen, 'monate': monate, 'gesamt': round(sum(c['summe'] for c in klassen), 2)}
