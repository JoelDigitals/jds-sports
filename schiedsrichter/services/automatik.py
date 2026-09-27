"""Automatische Pflege der Einsätze – läuft bei jedem Aufruf von Dashboard/Einsätzen, ohne Zutun des Nutzers.

- Fehlende Fahrt-km werden im Hintergrund aus Wohnadresse und Hallenadresse berechnet.
- Bestätigte Spiele gelten einige Stunden nach Anpfiff als geleitet.
- Ist die Auszahlung einer Quittung eingegangen, sind ihre Spiele geleitet.
- 3 Tage vor dem Spiel liegt der ausgefüllte Abrechnungsbogen automatisch bereit.
"""

import logging
import threading
from datetime import date, datetime, timedelta

from django.conf import settings
from django.db import close_old_connections

from ..models import Assignment, Receipt
from . import hallen
from .assignments import recalc_user
from .distance import hall_target

logger = logging.getLogger(__name__)

# Nach Anpfiff + dieser Zeit gilt ein bestätigtes Spiel als gespielt
ABSCHLUSS_NACH = timedelta(hours=3)
# Diese Status werden automatisch zu „geleitet“ (angesetzt = noch nicht zugesagt → bleibt offen)
AUTO_GELEITET_AUS = ('bestätigt', 'verlegt')
# Ausfälle bleiben, wie sie sind
NICHT_UEBERSCHREIBEN = ('geleitet', 'ausgefallen_angereist', 'ausgefallen_nicht_angereist', 'abgesagt')

# Quittung (Abrechnungsbogen) automatisch ab 3 Tage vor Anpfiff; verpasste Spiele bis 7 Tage rückwirkend
QUITTUNG_VORLAUF = timedelta(days=3)
QUITTUNG_NACHLAUF = timedelta(days=7)
QUITTUNG_FUER = ('angesetzt', 'bestätigt', 'verlegt', 'geleitet', 'ausgefallen_angereist')

_laufend: set[int] = set()
_lock = threading.Lock()


def _als_geleitet(qs, grund: str) -> int:
    n = 0
    for a in qs:
        a.status = 'geleitet'
        a.notes = (a.notes + '\n' if a.notes else '') + f'Automatisch als geleitet markiert ({grund}).'
        a.save(update_fields=['status', 'notes', 'updated_at'])
        n += 1
    return n


def spiele_abschliessen(user) -> int:
    """Bestätigte/verlegte Spiele, deren Anpfiff lange genug zurückliegt, als geleitet markieren."""
    grenze = datetime.now() - ABSCHLUSS_NACH
    n = _als_geleitet(
        Assignment.objects.filter(user=user, status__in=AUTO_GELEITET_AUS, game_datetime__lte=grenze),
        'Spiel liegt in der Vergangenheit',
    )
    if n:
        recalc_user(user)
    return n


def bei_auszahlung(receipt: Receipt) -> int:
    """Geld eingegangen → Spiele der Quittung sind geleitet; Auszahlungsdatum ggf. auf heute."""
    if receipt.payout_status != 'erhalten':
        return 0
    if not receipt.payout_date:
        receipt.payout_date = date.today()
        receipt.save(update_fields=['payout_date'])
    n = _als_geleitet(
        receipt.assignments.exclude(status__in=NICHT_UEBERSCHREIBEN),
        f'Auszahlung Quittung Nr. {receipt.pk} erhalten',
    )
    if n:
        recalc_user(receipt.user)
    return n


def quittungen_bereitstellen(user) -> list[Receipt]:
    """Für Spiele im Zeitfenster ohne Quittung automatisch den Abrechnungsbogen erstellen.

    Eine Quittung je Spiel (jeder Bogen bleibt beim jeweiligen Heimverein).
    """
    from django.db.models import Q

    from .receipts import QuittungFehler, create_receipt

    jetzt = datetime.now()
    offen = Assignment.objects.filter(
        user=user, status__in=QUITTUNG_FUER, quittungen__isnull=True,
        game_datetime__gte=jetzt - QUITTUNG_NACHLAUF, game_datetime__lte=jetzt + QUITTUNG_VORLAUF,
    ).exclude(
        Q(status='angesetzt') & Q(game_datetime__lt=jetzt)  # vergangen, aber nie zugesagt → nicht automatisch abrechnen
    ).order_by('game_datetime')
    neu = []
    for a in offen:
        try:
            neu.append(create_receipt(user, [a.pk], automatisch=True))
        except QuittungFehler:
            logger.warning('Automatische Quittung nicht möglich (Nutzer %s, Einsatz %s)', user.pk, a.pk, exc_info=True)
    return neu


def km_offen(user) -> list[Assignment]:
    if not user.heimadresse:
        return []
    qs = Assignment.objects.filter(user=user, travel_km__isnull=True, km_fehler='').exclude(status__in=Assignment.OHNE_SPESEN)
    return [a for a in qs if hall_target(a)]


def km_berechnen_im_hintergrund(user) -> bool:
    """Startet die km-Berechnung für alle Einsätze ohne km (max. ein Lauf pro Nutzer). True = läuft/gestartet."""
    if not km_offen(user):
        return False
    with _lock:
        if user.pk in _laufend:
            return True
        _laufend.add(user.pk)

    def lauf():
        from .travel import auto_fill_km

        try:
            close_old_connections()
            offen = km_offen(user)
            for a in offen:
                auto_fill_km(a, recalc=False)
            if offen:
                recalc_user(user)
        except Exception:
            logger.exception('Automatische km-Berechnung fehlgeschlagen (Nutzer %s)', user.pk)
        finally:
            close_old_connections()
            with _lock:
                _laufend.discard(user.pk)

    if getattr(settings, 'KM_IM_HINTERGRUND', True):
        threading.Thread(target=lauf, name=f'km-{user.pk}', daemon=True).start()
    else:
        lauf()  # Tests: synchron
    return True


def km_laeuft(user) -> bool:
    return user.pk in _laufend


def adresse_geaendert(user) -> None:
    """Neue Wohnadresse → alle automatisch berechneten km verwerfen und neu berechnen."""
    Assignment.objects.filter(user=user, travel_km_auto=True).update(travel_km=None, travel_minutes=None, travel_km_auto=False)
    Assignment.objects.filter(user=user).update(km_fehler='')
    recalc_user(user)
    km_berechnen_im_hintergrund(user)


def pflegen(user) -> dict:
    """Beim Öffnen der Übersichten aufrufen."""
    hallen.alle_erkennen(Assignment.objects.filter(user=user))  # Hallen anlegen, Nummern lernen/übernehmen
    return {
        'abgeschlossen': spiele_abschliessen(user),
        'quittungen': quittungen_bereitstellen(user),
        'km_laeuft': km_berechnen_im_hintergrund(user),
    }
