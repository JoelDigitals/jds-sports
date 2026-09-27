"""Hallen-Verzeichnis: Hallen automatisch anlegen, wiedererkennen und die Hallennummer merken/übernehmen."""

import re

from ..models import Assignment, Halle


def schluessel(text: str) -> str:
    """„SPORTHALLE Bous“, „Sporthalle bous.“ → „sporthalle bous“ (Groß-/Kleinschreibung und Satzzeichen egal)."""
    t = (text or '').lower().replace('ß', 'ss').replace('ä', 'ae').replace('ö', 'oe').replace('ü', 'ue')
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9]+', ' ', t)).strip()


def finden(a: Assignment) -> Halle | None:
    name_key, adresse_key = schluessel(a.hall), schluessel(a.hall_address)
    halle = None
    if adresse_key:
        halle = Halle.objects.filter(adresse_key=adresse_key).first()
    if not halle and name_key:
        halle = Halle.objects.filter(name_key=name_key).first()
    return halle


def erkennen(a: Assignment, speichern: bool = True) -> Halle | None:
    """Halle zum Einsatz anlegen bzw. finden, Nummer lernen (neuestes Spiel gewinnt) oder übernehmen."""
    if not (a.hall.strip() or a.hall_address.strip()):
        return None
    halle = finden(a)
    if not halle:
        halle = Halle.objects.create(
            name=a.hall.strip() or a.hall_address.split(',')[0].strip(),
            name_key=schluessel(a.hall), adresse=a.hall_address.strip(), adresse_key=schluessel(a.hall_address),
        )
    else:
        # fehlende Angaben der Halle ergänzen
        geaendert = False
        if not halle.adresse and a.hall_address.strip():
            halle.adresse, halle.adresse_key, geaendert = a.hall_address.strip(), schluessel(a.hall_address), True
        if not halle.name_key and a.hall.strip():
            halle.name, halle.name_key, geaendert = a.hall.strip(), schluessel(a.hall), True
        if geaendert:
            halle.save()

    nummer = a.hallennummer.strip()
    if nummer:
        # Nummer lernen – maßgeblich ist das zuletzt gespielte Spiel
        if not halle.nummer or halle.nummer_stand is None or a.game_datetime >= halle.nummer_stand:
            if (halle.nummer, halle.nummer_stand) != (nummer, a.game_datetime):
                halle.nummer, halle.nummer_stand = nummer, a.game_datetime
                halle.save(update_fields=['nummer', 'nummer_stand', 'aktualisiert'])
    elif halle.nummer:
        a.hallennummer = halle.nummer
        if speichern and a.pk:
            Assignment.objects.filter(pk=a.pk).update(hallennummer=halle.nummer)
    return halle


def alle_erkennen(qs=None) -> int:
    """Alle Einsätze durchgehen: erst Nummern lernen (chronologisch), dann fehlende Nummern ergänzen."""
    qs = Assignment.objects.all() if qs is None else qs
    spiele = list(qs.order_by('game_datetime'))
    for a in spiele:
        if a.hallennummer:
            erkennen(a)
    ergaenzt = 0
    for a in spiele:
        if not a.hallennummer:
            erkennen(a)
            ergaenzt += bool(a.hallennummer)
    return ergaenzt
