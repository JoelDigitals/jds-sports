import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '../db.ts';
import { config } from '../config.ts';
import { buildReceiptPdf, type ReceiptGame } from '../pdf/receiptPdf.ts';
import {
  getAssignment,
  getUser,
  seasonOfDate,
  calcForAssignment,
  type AssignmentRow,
  type UserRow,
} from './assignmentService.ts';
import { getActiveRulePack, type RulePack } from './rules.ts';
import { autoFillMissingKm, partnerTravel } from './travelService.ts';

export interface ReceiptRow {
  id: number;
  user_id: number;
  assignment_ids: string;
  season: string;
  total: number;
  pdf_filename: string | null;
  payout_status: string;
  payout_date: string | null;
  payer: string;
  created_at: string;
}

export class ReceiptError extends Error {
  constructor(message: string, public statusCode = 400) {
    super(message);
  }
}

export function listReceipts(userId: number): (ReceiptRow & { games: { id: number; gameDatetime: string; homeTeam: string; awayTeam: string; league: string; status: string }[] })[] {
  const rows = db
    .prepare('SELECT * FROM receipts WHERE user_id = ? ORDER BY created_at DESC, id DESC')
    .all(userId) as unknown as ReceiptRow[];
  return rows.map((r) => {
    const ids = JSON.parse(r.assignment_ids) as number[];
    const games = ids
      .map((id) => getAssignment(userId, id))
      .filter((a): a is AssignmentRow => !!a)
      .map((a) => ({
        id: a.id,
        gameDatetime: a.game_datetime,
        homeTeam: a.home_team,
        awayTeam: a.away_team,
        league: a.league,
        status: a.status,
      }));
    return { ...r, games };
  });
}

async function gamesWithCalc(userId: number, ids: number[], user: UserRow, pack: RulePack): Promise<ReceiptGame[]> {
  // Fehlende km vor der Abrechnung automatisch aus Wohnort und Halle berechnen
  await autoFillMissingKm(userId, ids);
  const assignments: AssignmentRow[] = [];
  for (const id of ids) {
    const a = getAssignment(userId, id);
    if (!a) throw new ReceiptError(`Einsatz ${id} nicht gefunden`, 404);
    assignments.push(a);
  }

  // Tageskontext aus ALLEN Einsätzen des Nutzers an den betroffenen Spieltagen
  // (DB 7.2.11: anteilige Fahrtkosten + Doppelansetzung auch bei Einzelquittung eines Doppelspieltags)
  const days = [...new Set(assignments.map((a) => a.game_datetime.slice(0, 10)))];
  const placeholders = days.map(() => 'substr(game_datetime, 1, 10) = ?').join(' OR ');
  const allOfDay = (db
    .prepare(`SELECT * FROM assignments WHERE user_id = ? AND (${placeholders})`)
    .all(userId, ...days) as unknown as AssignmentRow[])
    .sort((x, y) => x.game_datetime.localeCompare(y.game_datetime));

  const byDay = new Map<string, AssignmentRow[]>();
  for (const r of allOfDay) {
    const key = r.game_datetime.slice(0, 10);
    const list = byDay.get(key) ?? [];
    list.push(r);
    byDay.set(key, list);
  }

  const games: ReceiptGame[] = [];
  for (const a of assignments) {
    const calc = calcForAssignment(a, byDay.get(a.game_datetime.slice(0, 10)) ?? [a], pack);
    const pt = user.partner_name && !a.travel_mitfahrer ? await partnerTravel(user.partner_address ?? '', a) : null;
    games.push({
      id: a.id,
      sourceUid: a.source_uid,
      gameDatetime: a.game_datetime,
      homeTeam: a.home_team,
      awayTeam: a.away_team,
      league: a.league,
      leagueKey: a.league_key,
      competitionType: a.competition_type,
      cupRound: a.cup_round,
      tournamentGroup: a.tournament_group,
      tournamentTier: a.tournament_tier,
      gamesCount: a.games_count,
      hall: a.hall,
      hallAddress: a.hall_address,
      role: a.role,
      status: a.status,
      notes: a.notes,
      travelMitfahrer: a.travel_mitfahrer === 1,
      travelKm: a.travel_km,
      travelMinutes: a.travel_minutes,
      partnerTravel: pt ? { km: pt.kmRoundTrip, minutes: pt.minutesOneWay } : null,
      calc,
    });
  }
  return games;
}

export async function createReceipt(userId: number, assignmentIds: number[]): Promise<{ receipt: ReceiptRow; games: ReceiptGame[] }> {
  if (assignmentIds.length === 0) throw new ReceiptError('Keine Einsätze übergeben');
  const user = getUser(userId);
  if (!user) throw new ReceiptError('Benutzer nicht gefunden', 404);
  const pack = getActiveRulePack(user.association, user.season);

  const assignments = assignmentIds.map((id) => {
    const a = getAssignment(userId, id);
    if (!a) throw new ReceiptError(`Einsatz ${id} nicht gefunden`, 404);
    return a;
  });

  for (const a of assignments) {
    if (['abgesagt', 'ausgefallen_nicht_angereist'].includes(a.status)) {
      throw new ReceiptError(
        `Einsatz vom ${a.game_datetime.slice(0, 10).split('-').reverse().join('.')} ist „${a.status}" – dafür kann kein Abrechnungsbogen erstellt werden.`
      );
    }
  }

  const dates = new Set(assignments.map((a) => a.game_datetime.slice(0, 10)));
  if (dates.size > 1) {
    throw new ReceiptError('Sammelquittung nur für Einsätze desselben Tages möglich (anteilige Fahrtkosten, DB 7.2.9)');
  }

  const allReceipts = listReceipts(userId);
  for (const r of allReceipts) {
    const existingIds = JSON.parse(r.assignment_ids) as number[];
    const overlap = assignmentIds.filter((id) => existingIds.includes(id));
    if (overlap.length > 0) {
      throw new ReceiptError(`Für Einsatz ${overlap[0]} existiert bereits Quittung Nr. ${r.id}`);
    }
  }

  const games = await gamesWithCalc(userId, assignmentIds, user, pack);
  const total = Math.round(games.reduce((s, g) => s + g.calc.total, 0) * 100) / 100;
  const season = seasonOfDate(assignments[0].game_datetime);

  const insert = db
    .prepare('INSERT INTO receipts (user_id, assignment_ids, season, total, payout_status) VALUES (?, ?, ?, ?, ?)')
    .run(userId, JSON.stringify(assignmentIds), season, total, 'offen');
  const id = Number(insert.lastInsertRowid);

  const pdf = await buildPdf(user, pack, { id, season, total, createdAt: '' }, games);
  mkdirSync(config.receiptsDir, { recursive: true });
  const filename = `quittung-${id}.pdf`;
  writeFileSync(join(config.receiptsDir, filename), pdf);
  db.prepare('UPDATE receipts SET pdf_filename = ? WHERE id = ?').run(filename, id);

  const receipt = db.prepare('SELECT * FROM receipts WHERE id = ?').get(id) as unknown as ReceiptRow;
  return { receipt, games };
}

async function buildPdf(
  user: UserRow,
  pack: RulePack,
  receipt: { id: number; season: string; total: number; createdAt: string },
  games: ReceiptGame[]
): Promise<Buffer> {
  return buildReceiptPdf({
    user: {
      firstName: user.first_name,
      lastName: user.last_name,
      club: user.club,
      street: user.street,
      zip: user.zip,
      city: user.city,
      iban: user.iban,
      partnerName: user.partner_name ?? '',
      partnerAddress: user.partner_address ?? '',
    },
    pack,
    receipt,
    games,
  });
}

export function getReceipt(userId: number, id: number): ReceiptRow | undefined {
  return db.prepare('SELECT * FROM receipts WHERE user_id = ? AND id = ?').get(userId, id) as unknown as ReceiptRow | undefined;
}

export function getReceiptPdfPath(receipt: ReceiptRow): string {
  if (!receipt.pdf_filename) throw new ReceiptError('PDF noch nicht erzeugt', 409);
  const p = join(config.receiptsDir, receipt.pdf_filename);
  if (!existsSync(p)) throw new ReceiptError('PDF-Datei fehlt', 404);
  return p;
}

export function readReceiptPdf(receipt: ReceiptRow): Buffer {
  return readFileSync(getReceiptPdfPath(receipt));
}

export function updatePayout(
  userId: number,
  id: number,
  status: 'offen' | 'erhalten' | 'nicht_ausgezahlt',
  payoutDate: string | null,
  payer: string | null
): ReceiptRow {
  const r = getReceipt(userId, id);
  if (!r) throw new ReceiptError('Quittung nicht gefunden', 404);
  db.prepare('UPDATE receipts SET payout_status = ?, payout_date = ?, payer = ? WHERE id = ?').run(
    status,
    payoutDate,
    payer ?? r.payer,
    id
  );
  return getReceipt(userId, id)!;
}

export async function regeneratePdf(userId: number, id: number): Promise<void> {
  const r = getReceipt(userId, id);
  if (!r) throw new ReceiptError('Quittung nicht gefunden', 404);
  const user = getUser(userId)!;
  const pack = getActiveRulePack(user.association, user.season);
  const ids = JSON.parse(r.assignment_ids) as number[];
  const games = await gamesWithCalc(userId, ids, user, pack);
  const total = Math.round(games.reduce((s, g) => s + g.calc.total, 0) * 100) / 100;
  const pdf = await buildPdf(user, pack, { id: r.id, season: r.season, total, createdAt: r.created_at }, games);
  mkdirSync(config.receiptsDir, { recursive: true });
  const filename = r.pdf_filename ?? `quittung-${r.id}.pdf`;
  writeFileSync(join(config.receiptsDir, filename), pdf);
  db.prepare('UPDATE receipts SET total = ?, pdf_filename = ? WHERE id = ?').run(total, filename, r.id);
}
