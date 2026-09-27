import { db } from '../db.ts';

// Entfernungsberechnung Wohnort → Halle über OpenStreetMap:
// Geocoding via Nominatim, Fahrstrecke via OSRM. Beides ohne API-Key, Ergebnisse werden gecacht
// (Nominatim-Nutzungsregeln: max. 1 Anfrage/s, eindeutiger User-Agent). Cache-Tabellen: geo_cache, route_cache (db.ts).

const USER_AGENT = 'JDS-Sports/0.1 (Schiedsrichter-Abrechnung)';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving';
const TIMEOUT_MS = 8000;

export class DistanceError extends Error {
  constructor(message: string, public statusCode = 422) {
    super(message);
  }
}

export interface Point {
  lat: number;
  lon: number;
}

export interface TravelResult {
  /** Hin- und Rückfahrt, auf ganze km aufgerundet (so wie auf dem Abrechnungsbogen) */
  kmRoundTrip: number;
  kmOneWay: number;
  minutesOneWay: number;
}

let lastNominatimCall = 0;

async function fetchJson(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'de' }, signal: ctrl.signal });
    if (!res.ok) throw new DistanceError(`Kartendienst antwortet mit ${res.status}`, 502);
    return await res.json();
  } catch (err) {
    if (err instanceof DistanceError) throw err;
    throw new DistanceError('Kartendienst nicht erreichbar (Internetverbindung?)', 502);
  } finally {
    clearTimeout(timer);
  }
}

function normalize(q: string): string {
  return q.replace(/\s+/g, ' ').trim().toLowerCase();
}

async function nominatim(query: string): Promise<Point | null> {
  const key = normalize(query);
  const cached = db.prepare('SELECT lat, lon FROM geo_cache WHERE query = ?').get(key) as { lat: number | null; lon: number | null } | undefined;
  if (cached) return cached.lat != null && cached.lon != null ? { lat: cached.lat, lon: cached.lon } : null;

  const wait = lastNominatimCall + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNominatimCall = Date.now();

  const url = `${NOMINATIM_URL}?format=jsonv2&limit=1&countrycodes=de,fr,lu&q=${encodeURIComponent(query)}`;
  const data = (await fetchJson(url)) as { lat: string; lon: string }[];
  const hit = data[0] ? { lat: Number(data[0].lat), lon: Number(data[0].lon) } : null;
  db.prepare('INSERT OR REPLACE INTO geo_cache (query, lat, lon) VALUES (?, ?, ?)').run(key, hit?.lat ?? null, hit?.lon ?? null);
  return hit;
}

/**
 * Hallenadressen aus nuLiga/CSV sehen meist so aus: "Sporthalle Kirkel, Am Sportzentrum 1, 66359 Kirkel".
 * Nominatim findet den Hallennamen oft nicht – daher schrittweise vereinfachen.
 */
function candidates(address: string): string[] {
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  const out: string[] = [address];
  if (parts.length > 1) out.push(parts.slice(1).join(', '));
  const plzOrt = address.match(/\b(\d{5})\s+([^,]+)/);
  if (plzOrt) out.push(`${plzOrt[1]} ${plzOrt[2].trim()}`);
  return [...new Set(out.map((c) => c.trim()).filter((c) => c.length > 2))];
}

export async function geocode(address: string): Promise<Point> {
  if (!address.trim()) throw new DistanceError('Adresse fehlt');
  for (const q of candidates(address)) {
    const p = await nominatim(q);
    if (p) return p;
  }
  throw new DistanceError(`Adresse nicht gefunden: „${address}“`);
}

async function route(from: Point, to: Point): Promise<{ meters: number; seconds: number }> {
  const key = [from.lat, from.lon, to.lat, to.lon].map((n) => n.toFixed(5)).join(',');
  const cached = db.prepare('SELECT meters, seconds FROM route_cache WHERE key = ?').get(key) as { meters: number; seconds: number } | undefined;
  if (cached) return cached;
  const url = `${OSRM_URL}/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false`;
  const data = (await fetchJson(url)) as { code: string; routes?: { distance: number; duration: number }[] };
  const r = data.routes?.[0];
  if (data.code !== 'Ok' || !r) throw new DistanceError('Keine Fahrstrecke gefunden');
  db.prepare('INSERT OR REPLACE INTO route_cache (key, meters, seconds) VALUES (?, ?, ?)').run(key, r.distance, r.duration);
  return { meters: r.distance, seconds: r.duration };
}

export async function travelBetween(fromAddress: string, toAddress: string): Promise<TravelResult> {
  const [from, to] = [await geocode(fromAddress), await geocode(toAddress)];
  const { meters, seconds } = await route(from, to);
  const kmOneWay = Math.round(meters / 100) / 10;
  return {
    kmOneWay,
    kmRoundTrip: Math.ceil((meters * 2) / 1000),
    minutesOneWay: Math.round(seconds / 60),
  };
}

export function homeAddress(u: { street: string; zip: string; city: string }): string {
  return [u.street, `${u.zip} ${u.city}`.trim()].filter((s) => s.trim()).join(', ');
}

/** Ziel für die Routenberechnung: Hallenadresse, sonst Hallenname. */
export function hallTarget(a: { hall: string; hall_address: string }): string {
  return (a.hall_address || a.hall || '').trim();
}
