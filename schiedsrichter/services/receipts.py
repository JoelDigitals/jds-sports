"""Quittungen erzeugen (DB 7.2.9/7.2.11) und das PDF (Abrechnungsbogen) bauen."""

import dataclasses
import hashlib
import json

from datetime import datetime
from decimal import Decimal

from django.core.files.base import ContentFile
from django.db import transaction

from ..models import Assignment, Receipt
from .assignments import by_day, calc_with_day_context, doppelansetzungen, recalc_user, season_of
from .pdf import BogenPerson, BogenSpiel, build_bogen
from .rules import pack_for_user
from .travel import auto_fill_missing, partner_travel


class QuittungFehler(Exception):
    pass


def _bogen_spiele(user, assignments: list[Assignment]) -> tuple[list[BogenSpiel], float]:
    # Fehlende km vor der Abrechnung automatisch aus Wohnort und Halle berechnen
    auto_fill_missing(user, [a.pk for a in assignments])
    assignments = [Assignment.objects.get(pk=a.pk) for a in assignments]
    calcs = calc_with_day_context(user, assignments)
    tage = by_day(Assignment.objects.filter(user=user, game_datetime__date__in={a.game_datetime.date() for a in assignments}))
    spiele = []
    for a in assignments:
        calc = calcs[a.pk]
        block = doppelansetzungen(tage[a.game_datetime.date()] or [a])[a.pk]
        pt = partner_travel(user, a) if user.partner_name and not a.travel_mitfahrer and a.role in ('sr1', 'sr2') else None
        spiele.append(BogenSpiel(
            spielnummer=a.spielnummer,
            game_datetime=a.game_datetime,
            home_team=a.home_team,
            away_team=a.away_team,
            league=a.league,
            league_key=a.league_key,
            competition_type=a.competition_type,
            cup_round=a.cup_round,
            tournament_group=a.tournament_group,
            hall=a.hall,
            hall_address=a.hall_address,
            role=a.role,
            items=calc.items,
            travel_km=a.travel_km,
            travel_km_effective=calc.travel_km_effective,
            travel_minutes=a.travel_minutes,
            travel_mitfahrer=a.travel_mitfahrer,
            partner_km=pt.km_round_trip if pt else None,
            partner_minutes=pt.minutes_one_way if pt else None,
            hallennummer=a.hallennummer,
            fahrt_ab_spiel=block[0].game_datetime,
            fahrt_bis_spiel=block[-1].game_datetime,
        ))
    total = round(sum(calcs[a.pk].total for a in assignments), 2)
    return spiele, total


def _person(user) -> BogenPerson:
    return BogenPerson(
        vorname=user.first_name, nachname=user.last_name, strasse=user.strasse, plz=user.plz, ort=user.ort,
        partner_name=user.partner_name, partner_adresse=user.partner_adresse,
    )


def _stand(spiele: list[BogenSpiel], person: BogenPerson, pack: dict) -> str:
    """Fingerabdruck aller Daten, die auf dem Bogen landen – ändert sich einer, wird das PDF neu erzeugt."""
    roh = json.dumps([[dataclasses.asdict(g) for g in spiele], dataclasses.asdict(person), pack['version']], default=str, sort_keys=True)
    return hashlib.sha256(roh.encode()).hexdigest()


def _render(receipt: Receipt, nur_wenn_geaendert: bool = False) -> bool:
    user = receipt.user
    assignments = list(receipt.assignments.order_by('game_datetime'))
    spiele, total = _bogen_spiele(user, assignments)
    person, pack = _person(user), pack_for_user(user)
    stand = _stand(spiele, person, pack)
    if nur_wenn_geaendert and stand == receipt.pdf_stand and receipt.pdf and receipt.pdf.storage.exists(receipt.pdf.name):
        return False
    pdf = build_bogen(spiele, person, pack, titel=f'Reisekostenabrechnung Quittung {receipt.pk}')
    receipt.total = Decimal(str(total))
    receipt.pdf_stand = stand
    if receipt.pdf:
        receipt.pdf.delete(save=False)
    receipt.pdf.save(f'quittung-{receipt.pk}.pdf', ContentFile(pdf), save=False)
    receipt.save()
    return True


def create_receipt(user, ids: list[int], automatisch: bool = False) -> Receipt:
    """Quittung für genau ein Spiel – jeder Bogen bleibt beim jeweiligen Heimverein, Auszahlung wird je Spiel verfolgt."""
    if len(set(ids)) != 1:
        raise QuittungFehler('Eine Quittung gilt immer für genau ein Spiel.')
    a = Assignment.objects.filter(user=user, pk=ids[0]).first()
    if not a:
        raise QuittungFehler('Einsatz nicht gefunden')
    if not a.hat_spesen:
        raise QuittungFehler(f'Einsatz vom {a.game_datetime:%d.%m.%Y} ist „{a.get_status_display()}“ – dafür kann kein Abrechnungsbogen erstellt werden.')
    vorhandene = Receipt.objects.filter(user=user, assignments=a).first()
    if vorhandene:
        raise QuittungFehler(f'Für diesen Einsatz existiert bereits Quittung Nr. {vorhandene.pk}')

    with transaction.atomic():
        # Abrechnung für ein bereits gespieltes Spiel → es wurde geleitet
        if a.game_datetime <= datetime.now() and a.status in ('angesetzt', 'bestätigt', 'verlegt'):
            a.status = 'geleitet'
            a.save(update_fields=['status', 'updated_at'])
            recalc_user(user)
        receipt = Receipt.objects.create(user=user, season=season_of(a.game_datetime), total=0, automatisch=automatisch)
        receipt.assignments.set([a])
        _render(receipt)
    return receipt


def create_receipts(user, ids: list[int]) -> tuple[list[Receipt], list[str]]:
    """Mehrere ausgewählte Spiele → je Spiel eine Quittung. Liefert (erstellt, Fehlermeldungen)."""
    erstellt, fehler = [], []
    for pk in dict.fromkeys(ids):
        try:
            erstellt.append(create_receipt(user, [pk]))
        except QuittungFehler as e:
            fehler.append(str(e))
    return erstellt, fehler


def regenerate(receipt: Receipt) -> None:
    _render(receipt)


def aktualisieren(receipt: Receipt) -> bool:
    """PDF nur neu erzeugen, wenn sich Spiel-, km- oder Profildaten seit dem letzten Stand geändert haben."""
    return _render(receipt, nur_wenn_geaendert=True)
