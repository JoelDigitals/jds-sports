import { db } from '../db.ts';
import { getAssignment, getUser, recalcUser, type AssignmentRow } from './assignmentService.ts';
import { DistanceError, hallTarget, homeAddress, travelBetween, type TravelResult } from './distance.ts';

export interface AutoKmResult {
  assignmentId: number;
  km: number | null;
  minutes: number | null;
  from: string;
  to: string;
  error?: string;
}

/**
 * Berechnet die Fahrt-km (Hin + Rück) vom Wohnort des Schiedsrichters zur Halle und speichert sie am Einsatz.
 * Manuell eingetragene km werden nur mit force überschrieben.
 */
export async function autoFillTravelKm(userId: number, assignmentId: number, opts: { force?: boolean; recalc?: boolean } = {}): Promise<AutoKmResult> {
  const user = getUser(userId);
  const a = getAssignment(userId, assignmentId);
  if (!user || !a) throw new DistanceError('Einsatz nicht gefunden', 404);
  const from = homeAddress(user);
  const to = hallTarget(a);
  const base = { assignmentId, from, to };

  if (!opts.force && a.travel_km != null && a.travel_km_auto !== 1) {
    return { ...base, km: a.travel_km, minutes: a.travel_minutes };
  }
  if (!user.street && !user.city) return { ...base, km: null, minutes: null, error: 'Eigene Adresse fehlt (Einstellungen)' };
  if (!to) return { ...base, km: null, minutes: null, error: 'Hallenadresse fehlt' };

  let res: TravelResult;
  try {
    res = await travelBetween(from, to);
  } catch (err) {
    return { ...base, km: null, minutes: null, error: err instanceof Error ? err.message : String(err) };
  }
  db.prepare(`UPDATE assignments SET travel_km = ?, travel_km_auto = 1, travel_minutes = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`).run(
    res.kmRoundTrip,
    res.minutesOneWay,
    assignmentId,
    userId
  );
  if (opts.recalc !== false) recalcUser(userId);
  return { ...base, km: res.kmRoundTrip, minutes: res.minutesOneWay };
}

/** Füllt fehlende km für alle Einsätze des Nutzers (z. B. nach einem Import). */
export async function autoFillMissingKm(userId: number, ids?: number[]): Promise<AutoKmResult[]> {
  const rows = (ids
    ? ids.map((id) => getAssignment(userId, id)).filter((a): a is AssignmentRow => !!a)
    : (db.prepare('SELECT * FROM assignments WHERE user_id = ?').all(userId) as unknown as AssignmentRow[])
  ).filter((a) => a.travel_km == null && hallTarget(a));
  const results: AutoKmResult[] = [];
  for (const a of rows) results.push(await autoFillTravelKm(userId, a.id, { recalc: false }));
  if (results.some((r) => r.km != null)) recalcUser(userId);
  return results;
}

/** Fahrt des Gespannpartners (SR B) von seiner Adresse zur Halle – nur für den Abrechnungsbogen. */
export async function partnerTravel(partnerAddress: string, a: { hall: string; hall_address: string }): Promise<TravelResult | null> {
  const to = hallTarget(a);
  if (!partnerAddress.trim() || !to) return null;
  try {
    return await travelBetween(partnerAddress, to);
  } catch {
    return null;
  }
}
