"""Abrechnungsbogen „Reisekostenabrechnung für Schiedsrichter“ als PDF.

Pro Spiel eine Seite: Original-Bogen des HVS (Stand 01.07.2024) als unterste Ebene, darüber eine separat mit
reportlab erzeugte Datenebene – beide werden mit pypdf zu einer Seite zusammengeführt.
"""

import io
import math
import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

from .engine import is_youth_league

FORM_PATH = Path(__file__).resolve().parent.parent / 'data' / 'vorlagen' / 'HVS_Abrechnungsbogen_2024_07_01.pdf'
FONT = 'Helvetica'
FONT_SIZE = 10.5

# Positionen in PDF-Punkten (Ursprung unten links), gemessen an einem von Hand ausgefüllten Original-Bogen.
# y = Schrift-Grundlinie; (x, w) = Bereich des jeweiligen Unterstrichs.
POS = {
    'spielnummer': (61, 724, 149),
    'heim': (231, 724, 149),
    'gast': (401, 724, 143),
    'datum': (61, 677, 149),
    'halle': (231, 677, 149),
    'spielort': (401, 677, 143),
    'gesamt': (470, 139, 58),
    'ort_datum': (66, 138, 126),
}
CLASS_Y = 627.4
CLASS_X = {'OL': 63.8, 'VL': 126, 'BzLiga': 188, 'A-Liga': 252, 'B-Liga': 315.8, 'Männer': 377, 'Frauen': 438.2, 'Jugend': 503}
SONSTIGE_BOX = (63.8, 601.8)
SONSTIGE_TEXT = (113, 598, 250)

SR_A = {
    'name': (61, 535.5, 222), 'adresse': (61, 506.4, 222), 'abfahrt': (64, 453.5, 219), 'rueckkehr': (62, 411.9, 221),
    'entschaedigung': (205, 371.6, 58), 'pnv': (240, 339, 36), 'einzel_km': (121, 314.6, 25), 'einzel_eur': (238, 314.6, 38),
    'gespann_km': (126, 284, 18), 'gespann_eur': (240, 284, 36), 'sonstige': (240, 254, 36), 'summe': (216, 216.5, 56),
}
SR_B = {
    'name': (325, 535.5, 222), 'adresse': (327, 495.9, 220), 'abfahrt': (331, 453.5, 216), 'rueckkehr': (334, 411.9, 213),
    'entschaedigung': (470, 373, 50), 'pnv': (498, 339, 38), 'einzel_km': (384, 314.6, 23), 'einzel_eur': (498, 314.6, 36),
    'gespann_km': (384, 284, 19), 'gespann_eur': (500, 284, 36), 'sonstige': (493, 254, 43), 'summe': (476, 219, 56),
}

# Anreise ca. 60 min vor Anpfiff (DB: spätestens 45 min), Spiel inkl. Nachbereitung ca. 120 min
ANKUNFT_VOR_MIN = 60
SPIEL_UND_NACH_MIN = 120


@dataclass
class BogenSpiel:
    spielnummer: str
    game_datetime: datetime
    home_team: str
    away_team: str
    league: str
    league_key: str | None
    competition_type: str
    cup_round: str | None
    tournament_group: str | None
    hall: str
    hall_address: str
    role: str
    items: list[dict]
    travel_km: float | None
    travel_km_effective: float | None
    travel_minutes: float | None
    travel_mitfahrer: bool
    partner_km: float | None
    partner_minutes: float | None
    hallennummer: str = ''
    # Doppelansetzung: eine gemeinsame Fahrt – Abfahrt vor dem ersten, Rückkehr nach dem letzten Spiel
    fahrt_ab_spiel: datetime | None = None
    fahrt_bis_spiel: datetime | None = None


@dataclass
class BogenPerson:
    vorname: str
    nachname: str
    strasse: str
    plz: str
    ort: str
    partner_name: str
    partner_adresse: str


def eur(n: float) -> str:
    return f'{n:,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.')


def km_text(n: float) -> str:
    return f'{n:.1f}'.rstrip('0').rstrip('.').replace('.', ',')


def _zeit(dt: datetime, delta_min: float) -> str:
    t = dt + timedelta(minutes=delta_min)
    minute = (math.floor if delta_min < 0 else math.ceil)((t.hour * 60 + t.minute + t.second / 60) / 5) * 5
    t = datetime(t.year, t.month, t.day) + timedelta(minutes=minute)
    return t.strftime('%d.%m.%Y %H:%M Uhr')


def _spielort(addr: str) -> str:
    m = re.search(r'\b\d{5}\s+([^,]+)', addr)
    return m.group(1).strip() if m else ''


def _betrag(items: list[dict], key: str) -> float:
    return next((i['amount'] for i in items if i['key'] == key), 0)


CUP_NAMES = {
    'quali': 'Pokal-Qualifikation', 'r1': 'Pokal 1. Runde', 'r2_3': 'Pokal 2./3. Runde',
    'halbfinalturnier': 'Pokal Halbfinalturnier', 'final4': 'Pokal Final4',
}


def _klasse(g: BogenSpiel) -> tuple[list[str], str]:
    key = g.league_key or ''
    if g.competition_type == 'championship':
        boxes = []
        if key == 'oberliga' or key.startswith('oberliga_jugend'):
            boxes.append('OL')
        elif key == 'verbandsliga':
            boxes.append('VL')
        elif key == 'bezirksliga' or key.startswith('bezirksliga_jugend'):
            boxes.append('BzLiga')
        elif key == 'a_liga':
            boxes.append('A-Liga')
        elif key == 'b_liga':
            boxes.append('B-Liga')
        if is_youth_league(g.league):
            boxes.append('Jugend')
        elif re.search(r'frauen|damen|weibl', g.league, re.I):
            boxes.append('Frauen')
        else:
            boxes.append('Männer')
        return boxes, 'Jugend pfeift Jugend' if key == 'jpj' else ''
    if g.competition_type == 'cup':
        art = CUP_NAMES.get(g.cup_round or '', 'Pokalspiel')
    elif g.competition_type == 'friendly':
        art = 'Freundschaftsspiel'
    elif g.tournament_group == 'vorbereitungsturnier':
        art = 'Vorbereitungsturnier'
    elif g.tournament_group == 'pokalturnier_jugend':
        art = 'Pokalturnier Jugend'
    else:
        art = 'Turnier'
    return [], f'{art} – {g.league}'


class _Writer:
    def __init__(self, c: canvas.Canvas):
        self.c = c

    def text(self, value: str, pos: tuple[float, float, float], align: str = 'left') -> None:
        if not value:
            return
        x, y, w = pos
        size = FONT_SIZE
        while size > 6 and stringWidth(value, FONT, size) > w:
            size -= 0.25
        tw = stringWidth(value, FONT, size)
        if align == 'center':
            x += (w - tw) / 2
        elif align == 'right':
            x += w - tw
        self.c.setFont(FONT, size)
        self.c.drawString(x, y, value)

    def cross(self, cx: float, cy: float, r: float = 3.4) -> None:
        self.c.setLineWidth(1.1)
        self.c.line(cx - r, cy - r, cx + r, cy + r)
        self.c.line(cx - r, cy + r, cx + r, cy - r)


@dataclass
class _Spalte:
    name: str
    adresse: str
    fahrzeit: float | None
    entschaedigung: float
    pnv: float = 0
    km: float | None = None
    fahrtkosten: float = 0
    gespann: bool = False
    sonstige: float = 0

    @property
    def summe(self) -> float:
        return round(self.entschaedigung + self.pnv + self.fahrtkosten + self.sonstige, 2)


def _spalte(w: _Writer, pos: dict, s: _Spalte, g: BogenSpiel) -> None:
    fahrzeit = s.fahrzeit if s.fahrzeit is not None else 30
    w.text(s.name, pos['name'])
    w.text(s.adresse, pos['adresse'])
    w.text(_zeit(g.fahrt_ab_spiel or g.game_datetime, -(ANKUNFT_VOR_MIN + fahrzeit)), pos['abfahrt'])
    w.text(_zeit(g.fahrt_bis_spiel or g.game_datetime, SPIEL_UND_NACH_MIN + fahrzeit), pos['rueckkehr'])
    w.text(eur(s.entschaedigung), pos['entschaedigung'], 'right')
    if s.pnv > 0:
        w.text(eur(s.pnv), pos['pnv'], 'right')
    if s.km is not None and s.fahrtkosten > 0:
        w.text(km_text(s.km), pos['gespann_km' if s.gespann else 'einzel_km'], 'center')
        w.text(eur(s.fahrtkosten), pos['gespann_eur' if s.gespann else 'einzel_eur'], 'right')
    if s.sonstige > 0:
        w.text(eur(s.sonstige), pos['sonstige'], 'right')
    w.text(eur(s.summe), pos['summe'], 'right')


def _datenebene(c: canvas.Canvas, g: BogenSpiel, p: BogenPerson, pack: dict, datum: date | None) -> None:
    w = _Writer(c)
    w.text(g.spielnummer, POS['spielnummer'], 'center')
    w.text(g.home_team, POS['heim'], 'center')
    w.text(g.away_team, POS['gast'], 'center')
    w.text(g.game_datetime.strftime('%d.%m.%Y'), POS['datum'], 'center')
    w.text(g.hallennummer or g.hall, POS['halle'], 'center')
    w.text(_spielort(g.hall_address), POS['spielort'], 'center')

    boxes, sonstige = _klasse(g)
    for b in boxes:
        w.cross(CLASS_X[b], CLASS_Y)
    if sonstige:
        w.cross(*SONSTIGE_BOX)
        w.text(sonstige, SONSTIGE_TEXT)

    entschaedigung = _betrag(g.items, 'base') + _betrag(g.items, 'weekday') + _betrag(g.items, 'double')
    a = _Spalte(
        name=', '.join(x for x in [p.nachname, p.vorname] if x),
        adresse=', '.join(x for x in [p.strasse, f'{p.plz} {p.ort}'.strip()] if x),
        fahrzeit=g.travel_minutes,
        entschaedigung=entschaedigung,
        pnv=_betrag(g.items, 'pnv'),
        km=g.travel_km_effective,
        fahrtkosten=_betrag(g.items, 'travel'),
        gespann=g.travel_mitfahrer,
        sonstige=_betrag(g.items, 'other'),
    )
    _spalte(w, SR_A, a, g)
    gesamt = a.summe

    if g.role in ('sr1', 'sr2') and p.partner_name.strip():
        # Gespannfahrt: Partner fährt mit (keine eigenen Fahrtkosten). Sonst eigene Anreise, bei mehreren Spielen anteilig.
        share = g.travel_km_effective / g.travel_km if g.travel_km and g.travel_km_effective is not None else 1
        pkm = round(g.partner_km * share, 1) if not g.travel_mitfahrer and g.partner_km else None
        b = _Spalte(
            name=p.partner_name.strip(),
            adresse=p.partner_adresse.strip(),
            fahrzeit=g.travel_minutes if g.travel_mitfahrer else g.partner_minutes,
            entschaedigung=entschaedigung,
            km=pkm,
            fahrtkosten=round(pkm * pack['travel']['kmRate'], 2) if pkm else 0,
        )
        _spalte(w, SR_B, b, g)
        gesamt += b.summe

    w.text(eur(gesamt), POS['gesamt'], 'right')
    # Unterschrieben wird am Spieltag in der Halle → Spieldatum
    w.text(', '.join(x for x in [p.ort, (datum or g.game_datetime.date()).strftime('%d.%m.%Y')] if x), POS['ort_datum'], 'center')


def build_bogen(spiele: list[BogenSpiel], person: BogenPerson, pack: dict, titel: str = '', datum: date | None = None) -> bytes:
    template = PdfReader(str(FORM_PATH))
    box = template.pages[0].mediabox
    size = (float(box.width), float(box.height))

    # 1) Datenebene: eigene PDF, gleiche Seitengröße, nur die Einträge
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=size)
    for g in spiele:
        _datenebene(c, g, person, pack, datum)
        c.showPage()
    c.save()
    overlay = PdfReader(io.BytesIO(buf.getvalue()))

    # 2) Zusammenführen: Bogen unten, Daten oben
    out = PdfWriter()
    for layer in overlay.pages:
        page = out.add_page(PdfReader(str(FORM_PATH)).pages[0])
        page.merge_page(layer)
    out.add_metadata({'/Title': titel or 'Reisekostenabrechnung', '/Author': f'{person.vorname} {person.nachname}'.strip(), '/Creator': 'JDS Sports'})
    result = io.BytesIO()
    out.write(result)
    return result.getvalue()
