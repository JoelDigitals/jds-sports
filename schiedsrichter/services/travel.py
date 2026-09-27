"""Fahrt-km automatisch am Einsatz hinterlegen."""

from dataclasses import dataclass

from ..models import Assignment
from .assignments import recalc_user
from .distance import DistanceError, TravelResult, hall_target, travel_between


@dataclass
class AutoKm:
    assignment_id: int
    km: float | None
    minutes: float | None
    von: str
    nach: str
    fehler: str | None = None


def auto_fill_km(a: Assignment, force: bool = False, recalc: bool = True) -> AutoKm:
    """Berechnet Hin- + Rückfahrt von der Wohnadresse zur Halle. Manuell eingetragene km nur mit force überschreiben."""
    user = a.user
    von, nach = user.heimadresse, hall_target(a)
    if not force and a.travel_km is not None and not a.travel_km_auto:
        return AutoKm(a.pk, a.travel_km, a.travel_minutes, von, nach)
    if not von:
        return AutoKm(a.pk, None, None, von, nach, 'Eigene Adresse fehlt (Einstellungen)')
    if not nach:
        return AutoKm(a.pk, None, None, von, nach, 'Hallenadresse fehlt')
    try:
        res = travel_between(von, nach)
    except DistanceError as e:
        # Merken, damit die Automatik es nicht bei jedem Seitenaufruf erneut versucht
        Assignment.objects.filter(pk=a.pk).update(km_fehler=str(e)[:200])
        return AutoKm(a.pk, None, None, von, nach, str(e))
    Assignment.objects.filter(pk=a.pk).update(travel_km=res.km_round_trip, travel_km_auto=True, travel_minutes=res.minutes_one_way, km_fehler='')
    a.travel_km, a.travel_km_auto, a.travel_minutes = res.km_round_trip, True, res.minutes_one_way
    if recalc:
        recalc_user(user)
    return AutoKm(a.pk, res.km_round_trip, res.minutes_one_way, von, nach)


def auto_fill_missing(user, ids: list[int] | None = None) -> list[AutoKm]:
    qs = Assignment.objects.filter(user=user, travel_km__isnull=True).select_related('user')
    if ids is not None:
        qs = qs.filter(pk__in=ids)
    results = [auto_fill_km(a, recalc=False) for a in qs if hall_target(a)]
    if any(r.km is not None for r in results):
        recalc_user(user)
    return results


def partner_travel(user, a: Assignment) -> TravelResult | None:
    """Anreise des Gespannpartners (SR B) von seiner Adresse – nur für den Abrechnungsbogen."""
    if not user.partner_adresse.strip() or not hall_target(a):
        return None
    try:
        return travel_between(user.partner_adresse, hall_target(a))
    except DistanceError:
        return None
