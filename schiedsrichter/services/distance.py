"""Entfernung Wohnort → Halle über OpenStreetMap (Nominatim-Geocoding + OSRM-Routing), ohne API-Key.

Ergebnisse werden in GeoCache/RouteCache gespeichert (Nominatim-Regeln: max. 1 Anfrage/s, eigener User-Agent).
"""

import json
import math
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass

from ..models import GeoCache, RouteCache

USER_AGENT = 'JDS-Sports/0.2 (Schiedsrichter-Abrechnung)'
NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
OSRM_URL = 'https://router.project-osrm.org/route/v1/driving'
TIMEOUT = 8

_lock = threading.Lock()
_last_call = 0.0


class DistanceError(Exception):
    pass


@dataclass
class TravelResult:
    km_round_trip: int  # Hin + Rück, aufgerundet – wie auf dem Abrechnungsbogen
    km_one_way: float
    minutes_one_way: int


def _get_json(url: str):
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT, 'Accept-Language': 'de'})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
            return json.loads(res.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        raise DistanceError(f'Kartendienst antwortet mit {e.code}') from e
    except (urllib.error.URLError, TimeoutError) as e:
        raise DistanceError('Kartendienst nicht erreichbar (Internetverbindung?)') from e


def _nominatim(query: str) -> tuple[float, float] | None:
    global _last_call
    key = re.sub(r'\s+', ' ', query).strip().lower()[:300]
    cached = GeoCache.objects.filter(query=key).first()
    if cached:
        return (cached.lat, cached.lon) if cached.lat is not None else None
    with _lock:
        wait = _last_call + 1.1 - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        _last_call = time.monotonic()
        params = urllib.parse.urlencode({'format': 'jsonv2', 'limit': 1, 'countrycodes': 'de,fr,lu', 'q': query})
        data = _get_json(f'{NOMINATIM_URL}?{params}')
    hit = (float(data[0]['lat']), float(data[0]['lon'])) if data else None
    GeoCache.objects.update_or_create(query=key, defaults={'lat': hit[0] if hit else None, 'lon': hit[1] if hit else None})
    return hit


def _candidates(address: str) -> list[str]:
    """Hallenadressen wie „Sporthalle Kirkel, Am Sportzentrum 1, 66359 Kirkel“ schrittweise vereinfachen."""
    parts = [p.strip() for p in address.split(',') if p.strip()]
    out = [address]
    if len(parts) > 1:
        out.append(', '.join(parts[1:]))
    m = re.search(r'\b(\d{5})\s+([^,]+)', address)
    if m:
        out.append(f'{m.group(1)} {m.group(2).strip()}')
    seen: list[str] = []
    for c in (c.strip() for c in out):
        if len(c) > 2 and c not in seen:
            seen.append(c)
    return seen


def geocode(address: str) -> tuple[float, float]:
    if not address.strip():
        raise DistanceError('Adresse fehlt')
    for q in _candidates(address):
        p = _nominatim(q)
        if p:
            return p
    raise DistanceError(f'Adresse nicht gefunden: „{address}“')


def _route(a: tuple[float, float], b: tuple[float, float]) -> tuple[float, float]:
    key = ','.join(f'{n:.5f}' for n in (*a, *b))
    cached = RouteCache.objects.filter(key=key).first()
    if cached:
        return cached.meters, cached.seconds
    data = _get_json(f'{OSRM_URL}/{a[1]},{a[0]};{b[1]},{b[0]}?overview=false')
    routes = data.get('routes') or []
    if data.get('code') != 'Ok' or not routes:
        raise DistanceError('Keine Fahrstrecke gefunden')
    RouteCache.objects.update_or_create(key=key, defaults={'meters': routes[0]['distance'], 'seconds': routes[0]['duration']})
    return routes[0]['distance'], routes[0]['duration']


def travel_between(from_address: str, to_address: str) -> TravelResult:
    meters, seconds = _route(geocode(from_address), geocode(to_address))
    return TravelResult(
        km_round_trip=math.ceil(meters * 2 / 1000),
        km_one_way=round(meters / 1000, 1),
        minutes_one_way=round(seconds / 60),
    )


def hall_target(a) -> str:
    return (a.hall_address or a.hall or '').strip()
