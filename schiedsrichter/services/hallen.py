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


class _Verzeichnis:
    """Alle Hallen einmal laden und im Speicher nachschlagen – statt je Einsatz eine Datenbankabfrage."""

    def __init__(self):
        self.hallen = list(Halle.objects.all())
        self.nach_adresse = {h.adresse_key: h for h in self.hallen if h.adresse_key}
        self.nach_name = {h.name_key: h for h in self.hallen if h.name_key}

    def finden(self, a: Assignment) -> Halle | None:
        adresse_key, name_key = schluessel(a.hall_address), schluessel(a.hall)
        return (adresse_key and self.nach_adresse.get(adresse_key)) or (name_key and self.nach_name.get(name_key)) or None

    def merken(self, h: Halle) -> None:
        if h.adresse_key:
            self.nach_adresse.setdefault(h.adresse_key, h)
        if h.name_key:
            self.nach_name.setdefault(h.name_key, h)


def alle_erkennen(qs=None) -> int:
    """Alle Einsätze durchgehen: Hallen anlegen, Nummern lernen (neuestes Spiel gewinnt), fehlende Nummern ergänzen.

    Schreibt nur, wenn sich etwas ändert – bei unverändertem Stand genügen zwei Abfragen.
    """
    qs = Assignment.objects.all() if qs is None else qs
    spiele = [a for a in qs.order_by('game_datetime').only('id', 'hall', 'hall_address', 'hallennummer', 'game_datetime')
              if a.hall.strip() or a.hall_address.strip()]
    if not spiele:
        return 0
    v = _Verzeichnis()

    # 1) Hallen anlegen und Nummern lernen
    for a in spiele:
        h = v.finden(a)
        if not h:
            h = Halle.objects.create(
                name=a.hall.strip() or a.hall_address.split(',')[0].strip(), name_key=schluessel(a.hall),
                adresse=a.hall_address.strip(), adresse_key=schluessel(a.hall_address),
            )
            v.merken(h)
        nummer = a.hallennummer.strip()
        if nummer and (not h.nummer or h.nummer_stand is None or a.game_datetime >= h.nummer_stand):
            if (h.nummer, h.nummer_stand) != (nummer, a.game_datetime):
                h.nummer, h.nummer_stand = nummer, a.game_datetime
                h.save(update_fields=['nummer', 'nummer_stand', 'aktualisiert'])

    # 2) fehlende Nummern aus dem Verzeichnis ergänzen
    ergaenzt = 0
    for a in spiele:
        if not a.hallennummer:
            h = v.finden(a)
            if h and h.nummer:
                Assignment.objects.filter(pk=a.pk).update(hallennummer=h.nummer)
                a.hallennummer = h.nummer
                ergaenzt += 1
    return ergaenzt
