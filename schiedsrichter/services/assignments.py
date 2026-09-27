"""Spesen je Einsatz im Tageskontext berechnen und am Einsatz speichern."""

from collections import defaultdict
from dataclasses import dataclass
from datetime import timedelta
from decimal import Decimal

from ..models import Assignment
from .engine import CalcInput, Doppelansetzung, calc_expense
from .rules import pack_for_user

# „Direkt aufeinanderfolgend“: nächstes Spiel beginnt spätestens so lange nach dem Anpfiff des vorherigen
DOPPEL_MAX_ABSTAND_MIN = 180


@dataclass
class CalcExtended:
    total: float
    items: list[dict]
    warnings: list[str]
    travel_km_effective: float | None


def _halle(a: Assignment) -> str:
    return (a.hall_address or a.hall).strip().lower()


def doppelansetzungen(all_of_day: list[Assignment], pack: dict | None = None) -> dict[int, list[Assignment]]:
    """Ordnet jedem Einsatz seinen Block zu: direkt aufeinanderfolgende Spiele in derselben Halle.

    Spiele in anderen Hallen oder mit größerer Pause bilden einen eigenen Block (= Einzelspiel, normale Abrechnung).
    Abgesagte/nicht angereiste Spiele zählen nicht mit.
    """
    max_min = ((pack or {}).get('doubleBonus') or {}).get('maxAbstandMinuten', DOPPEL_MAX_ABSTAND_MIN)
    spiele = sorted((a for a in all_of_day if a.hat_spesen), key=lambda a: a.game_datetime)
    bloecke: list[list[Assignment]] = []
    for a in spiele:
        vorher = bloecke[-1][-1] if bloecke else None
        if (
            vorher is not None
            and _halle(a) and _halle(a) == _halle(vorher)
            and a.game_datetime - vorher.game_datetime <= timedelta(minutes=max_min)
        ):
            bloecke[-1].append(a)
        else:
            bloecke.append([a])
    zuordnung = {a.pk: block for block in bloecke for a in block}
    for a in all_of_day:
        zuordnung.setdefault(a.pk, [a])
    return zuordnung


def calc_for_assignment(a: Assignment, all_of_day: list[Assignment], pack: dict) -> CalcExtended:
    """DB 7.2.8/7.2.11: Bei Doppelansetzung (direkt hintereinander, gleiche Halle) werden Fahrt-km und
    Zusatzspesen anteilig verteilt. Alle anderen Spiele werden normal mit voller Hin- und Rückfahrt abgerechnet."""
    block = doppelansetzungen(all_of_day, pack)[a.pk]
    with_km = [r.travel_km for r in block if r.travel_km]
    block_km = max(with_km) if with_km else None

    res = calc_expense(
        CalcInput(
            status=a.status,
            role=a.role,
            league=a.league,
            league_key=a.league_key,
            competition_type=a.competition_type,
            cup_round=a.cup_round,
            tournament_group=a.tournament_group,
            tournament_tier=a.tournament_tier,
            games_count=a.games_count,
            date_local=a.game_datetime.date(),
            hall=a.hall,
            travel_km=a.travel_km,
            travel_km_manual=a.travel_km_manual,
            travel_mitfahrer=a.travel_mitfahrer,
            pnv_cost=float(a.pnv_cost) if a.pnv_cost is not None else None,
            other_cost=float(a.other_cost) if a.other_cost is not None else None,
            block=Doppelansetzung(anzahl=len(block), km=block_km),
        ),
        pack,
    )

    effective = None
    if a.travel_km:
        effective = a.travel_km if a.travel_km_manual or len(block) <= 1 else round(block_km / len(block), 2)
    return CalcExtended(res.total, res.items, res.warnings, effective)


def by_day(rows) -> dict:
    days = defaultdict(list)
    for r in rows:
        days[r.game_datetime.date()].append(r)
    return days


def calc_with_day_context(user, assignments: list[Assignment]) -> dict[int, CalcExtended]:
    pack = pack_for_user(user)
    dates = {a.game_datetime.date() for a in assignments}
    context = by_day(Assignment.objects.filter(user=user, game_datetime__date__in=dates))
    return {a.pk: calc_for_assignment(a, context[a.game_datetime.date()] or [a], pack) for a in assignments}


def recalc_user(user) -> None:
    pack = pack_for_user(user)
    rows = list(Assignment.objects.filter(user=user).order_by('game_datetime'))
    days = by_day(rows)
    for r in rows:
        res = calc_for_assignment(r, days[r.game_datetime.date()], pack)
        r.expense_total = Decimal(str(res.total))
        r.expense_breakdown = res.items
        r.expense_warnings = res.warnings
        r.rulepack_version = pack['version']
    Assignment.objects.bulk_update(rows, ['expense_total', 'expense_breakdown', 'expense_warnings', 'rulepack_version'])


def season_of(dt) -> str:
    start = dt.year if dt.month >= 7 else dt.year - 1
    return f'{start}/{(start + 1) % 100:02d}'

