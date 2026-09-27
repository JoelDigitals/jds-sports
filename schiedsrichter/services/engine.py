"""Spesen-Regel-Engine (deterministisch, mit vollständiger Herleitung je Betrag).

Grundlage: Durchführungsbestimmungen des Verbands, als Regelwerk-JSON versioniert (siehe verbaende.RulePack).
"""

import re
from dataclasses import dataclass, field
from datetime import date, timedelta


def round2(n: float) -> float:
    return round(n + 1e-9, 2) if n >= 0 else round(n - 1e-9, 2)


def easter_sunday(year: int) -> date:
    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day = ((h + l - 7 * m + 114) % 31) + 1
    return date(year, month, day)


def is_holiday_saarland(d: date) -> bool:
    y = d.year
    fixed = {date(y, 1, 1), date(y, 5, 1), date(y, 10, 3), date(y, 11, 1), date(y, 12, 25), date(y, 12, 26)}
    easter = easter_sunday(y)
    # Karfreitag, Ostermontag, Christi Himmelfahrt, Pfingstmontag, Fronleichnam (+ Mariä Himmelfahrt im Saarland)
    movable = {easter + timedelta(days=n) for n in (-2, 1, 39, 50, 60)}
    return d in fixed or d in movable or d == date(y, 8, 15)


def is_youth_league(text: str) -> bool:
    return bool(re.search(r'jugend|jpj|\b[a-e]-jugend\b|weibl\.?\s+jugend|männl\.?\s+jugend', text, re.I))


@dataclass
class Doppelansetzung:
    """Direkt aufeinanderfolgende Spiele in derselben Halle (DB 7.2.8/7.2.11).

    Nur innerhalb eines solchen Blocks werden Fahrt-km und Zusatzspesen anteilig auf die Spiele verteilt.
    Einzelspiele (auch mehrere am Tag in verschiedenen Hallen) haben anzahl=1 und werden normal abgerechnet.
    """

    anzahl: int = 1
    km: float | None = None  # Hin- + Rückfahrt des Blocks (einmal gefahren)


@dataclass
class CalcInput:
    status: str = 'geleitet'
    role: str = 'sr1'
    league: str = ''
    league_key: str | None = None
    competition_type: str = 'championship'
    cup_round: str | None = None
    tournament_group: str | None = None
    tournament_tier: str | None = None
    games_count: int = 1
    date_local: date = field(default_factory=date.today)
    hall: str = ''
    travel_km: float | None = None
    travel_km_manual: bool = False
    travel_mitfahrer: bool = False
    pnv_cost: float | None = None
    other_cost: float | None = None
    block: Doppelansetzung = field(default_factory=Doppelansetzung)


@dataclass
class CalcResult:
    total: float
    items: list[dict]
    warnings: list[str]


def _class_rate(pack: dict, class_key: str | None, role: str) -> tuple[float | None, dict | None, str | None]:
    cls = next((c for c in pack['classes'] if c['key'] == class_key), None)
    if not cls:
        return None, None, f'Spielklasse "{class_key or "–"}" nicht im Regelwerk gefunden'
    if role == 'esr':
        return cls['rates']['sr_einzel'], cls, None
    if role == 'zns':
        if cls['rates'].get('zns') is None:
            return 0, cls, f'Kein ZNS-Satz für "{cls["name"]}" hinterlegt (ZNS-Sätze lt. DB 7.3.7 nur Pokalfinale Ostermontag)'
        return cls['rates']['zns'], cls, None
    return cls['rates']['sr_gespann'], cls, None


def calc_expense(inp: CalcInput, pack: dict) -> CalcResult:
    items: list[dict] = []
    warnings: list[str] = []

    if inp.status in ('abgesagt', 'ausgefallen_nicht_angereist'):
        label = 'Keine Spesen (Spiel abgesagt)' if inp.status == 'abgesagt' else 'Keine Spesen (nicht angereist)'
        return CalcResult(0, [{'key': 'no_fee', 'label': label, 'amount': 0}], warnings)

    cancelled = inp.status == 'ausgefallen_angereist'
    factor = pack['cancellation']['factor'] if cancelled else 1
    base = 0.0
    detail = ''

    if inp.competition_type == 'championship':
        rate, cls, warning = _class_rate(pack, inp.league_key, inp.role)
        if warning:
            warnings.append(warning)
        base = (rate or 0) * factor
        detail = cls['name'] if cls else inp.league
    elif inp.competition_type == 'cup':
        rnd = next((r for r in pack['cupRounds'] if r['key'] == inp.cup_round), None)
        if not rnd:
            warnings.append('Pokalrunde nicht angegeben oder unbekannt – Satz 0 €, bitte Runde wählen')
        else:
            rate = rnd['rate']
            detail = rnd['name']
            if pack.get('cupCapClass'):
                cap = _class_rate(pack, pack['cupCapClass'], inp.role)[0]
                if cap is not None and rate > cap:
                    rate = cap
                    detail += f' (Obergrenze {pack["cupCapClass"]}-Satz)'
            base = rate * factor
    elif inp.competition_type == 'friendly':
        explicit = next((e for e in pack['friendlies']['explicit'] if e['key'] == inp.league_key), None)
        if explicit:
            base = explicit['rate'] * factor
            detail = explicit['name']
        else:
            cls = next((c for c in pack['classes'] if c['key'] == inp.league_key), None)
            rate = pack['friendlies']['classRates'].get(inp.league_key or '')
            if rate is not None and cls:
                base = rate * factor
                detail = f'Freundschaftsspiel: {cls["name"]} (fester Satz lt. DB 7.2.3)'
            else:
                warnings.append('Klasse des Heimvereins unbekannt – Freundschaftsspiel-Satz nicht ermittelbar')
    elif inp.competition_type == 'tournament':
        group = next((g for g in pack['tournamentGroups'] if g['key'] == (inp.tournament_group or 'turnier')), None)
        tier = next((t for t in group['tiers'] if t['key'] == inp.tournament_tier), None) if group else None
        if not group or not tier:
            warnings.append('Turnier-Art oder Spielzeit-Staffel nicht gewählt – Satz 0 €')
        else:
            youth = is_youth_league(inp.league)
            rate = tier['jugend'] if youth else tier['aktive']
            if rate is None:
                warnings.append(f'Staffel „{tier["name"]}“ gilt nur für Jugend-Turniere')
            else:
                count = max(1, inp.games_count)
                base = rate * count * factor
                detail = f'{group["name"].split(" (")[0]}: {tier["name"]} × {count} Spiel(e){", Jugend-Satz" if youth else ""}'

    suffix = ' (Einzelschiedsrichter)' if inp.role == 'esr' else ' (Z/S)' if inp.role == 'zns' else ''
    items.append({
        'key': 'base',
        'label': 'Spielleitungsentschädigung' + (' – 50 % (Spiel ausgefallen, angereist)' if cancelled else ''),
        'amount': round2(base),
        'detail': f'{detail}{suffix}',
    })

    if base > 0:
        wb = pack['weekdayBonus']
        js_dow = (inp.date_local.weekday() + 1) % 7  # Regelwerk nutzt JS-Wochentage (0 = Sonntag)
        if js_dow in wb['days']:
            if is_holiday_saarland(inp.date_local) and wb['skipHolidays']:
                items.append({'key': 'weekday', 'label': 'Wochenspielpauschale entfällt (gesetzlicher Feiertag)', 'amount': 0})
            else:
                items.append({'key': 'weekday', 'label': 'Wochenspielpauschale (Mo–Fr)', 'amount': wb['amount']})
        n = inp.block.anzahl
        if n >= 2:
            # Zusatzspesen je zusätzlichem Spiel, gleichmäßig auf alle Spiele des Blocks verteilt (2 Spiele: 2,50 € + 2,50 €)
            gesamt = pack['doubleBonus']['amount'] * (n - 1)
            items.append({
                'key': 'double',
                'label': 'Zusatzspesen Doppelansetzung (anteilig)',
                'amount': round2(gesamt / n),
                'detail': f'{gesamt:.2f} € auf {n} direkt aufeinanderfolgende Spiele in derselben Halle verteilt'.replace('.', ','),
            })

    if inp.travel_km is not None and inp.travel_km > 0:
        km = inp.travel_km
        share = ''
        if not inp.travel_km_manual and inp.block.anzahl > 1 and inp.block.km is not None:
            km = round2(inp.block.km / inp.block.anzahl)
            share = f' – anteilig 1/{inp.block.anzahl} der Fahrt zur Doppelansetzung ({inp.block.km:g} km)'
        rate = pack['travel']['kmRateMitfahrer'] if inp.travel_mitfahrer else pack['travel']['kmRate']
        items.append({
            'key': 'travel',
            'label': 'Fahrtkosten PKW' + (' (Gespann/Mitfahrer)' if inp.travel_mitfahrer else ' (Einzelfahrt)'),
            'amount': round2(km * rate),
            'detail': f'{km:g} km × {rate:.2f} €/km{share}',
        })
    elif inp.status in ('geleitet', 'ausgefallen_angereist'):
        warnings.append('Fahrtkosten noch nicht erfasst')

    if inp.pnv_cost:
        items.append({
            'key': 'pnv',
            'label': 'Fahrtkosten – PNV (Öffentliche)',
            'amount': round2(float(inp.pnv_cost)),
            'detail': 'Einzelfahrtkosten öffentliche Verkehrsmittel lt. Abrechnungsbogen',
        })
    if inp.other_cost:
        items.append({'key': 'other', 'label': 'Sonstige Auslagen', 'amount': round2(float(inp.other_cost))})

    return CalcResult(round2(sum(i['amount'] for i in items)), items, warnings)
