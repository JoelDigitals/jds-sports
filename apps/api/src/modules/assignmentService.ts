import { db } from '../db.ts';
import { getActiveRulePack, type RulePack } from './rules.ts';
import { calcExpense, type AssignmentStatus, type BreakdownItem } from './expense.ts';

export interface AssignmentRow {
  id: number;
  user_id: number;
  source: string;
  source_uid: string | null;
  sequence: number;
  last_modified: string | null;
  game_datetime: string;
  home_team: string;
  away_team: string;
  league: string;
  league_key: string | null;
  competition_type: string;
  cup_round: string | null;
  tournament_tier: string | null;
  tournament_group: string | null;
  games_count: number;
  hall: string;
  hall_address: string;
  role: string;
  status: AssignmentStatus;
  notes: string;
  travel_km: number | null;
  travel_km_manual: number;
  travel_mitfahrer: number;
  travel_km_auto: number;
  travel_minutes: number | null;
  pnv_cost: number | null;
  other_cost: number | null;
  created_at: string;
  updated_at: string;
}

export interface ExpenseRow {
  assignment_id: number;
  rulepack_version: string;
  total: number;
  breakdown: BreakdownItem[];
  warnings: string[];
  calculated_at: string;
}

export interface UserRow {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  street: string;
  zip: string;
  city: string;
  phone: string;
  iban: string;
  club: string;
  default_role: string;
  partner_name: string;
  partner_address: string;
  is_admin: number;
  association: string;
  season: string;
}

export function getUser(userId: number): UserRow | undefined {
  return db
    .prepare('SELECT id, email, first_name, last_name, street, zip, city, phone, iban, club, default_role, partner_name, partner_address, is_admin, association, season FROM users WHERE id = ?')
    .get(userId) as UserRow | undefined;
}

export function seasonOfDate(dateLocal: string): string {
  const y = Number(dateLocal.slice(0, 4));
  const m = Number(dateLocal.slice(5, 7));
  const start = m >= 7 ? y : y - 1;
  return `${start}/${String((start + 1) % 100).padStart(2, '0')}`;
}

const SELECT_ASSIGNMENT = `SELECT * FROM assignments WHERE user_id = ? AND id = ?`;

export function getAssignment(userId: number, id: number): AssignmentRow | undefined {
  return db.prepare(SELECT_ASSIGNMENT).get(userId, id) as unknown as AssignmentRow | undefined;
}

export function listAssignments(userId: number, filters: { status?: string; month?: string; season?: string }): (AssignmentRow & { expense_total: number | null })[] {
  let sql = `SELECT a.*, e.total AS expense_total FROM assignments a LEFT JOIN expense_calcs e ON e.assignment_id = a.id WHERE a.user_id = ?`;
  const params: (string | number)[] = [userId];
  if (filters.status) {
    sql += ` AND a.status = ?`;
    params.push(filters.status);
  }
  if (filters.month) {
    sql += ` AND substr(a.game_datetime, 1, 7) = ?`;
    params.push(filters.month);
  }
  if (filters.season) {
    sql += ` AND (CASE WHEN cast(substr(a.game_datetime, 6, 2) AS INTEGER) >= 7 THEN substr(a.game_datetime, 1, 4) ELSE cast(substr(a.game_datetime, 1, 4) AS INTEGER) - 1 END) = ?`;
    params.push(filters.season.slice(0, 4));
  }
  sql += ` ORDER BY a.game_datetime DESC`;
  return db.prepare(sql).all(...params) as unknown as (AssignmentRow & { expense_total: number | null })[];
}

export function getExpense(assignmentId: number): ExpenseRow | undefined {
  const row = db
    .prepare('SELECT assignment_id, rulepack_version, total, breakdown, warnings, calculated_at FROM expense_calcs WHERE assignment_id = ?')
    .get(assignmentId) as
    | { assignment_id: number; rulepack_version: string; total: number; breakdown: string; warnings: string; calculated_at: string }
    | undefined;
  if (!row) return undefined;
  return {
    assignment_id: row.assignment_id,
    rulepack_version: row.rulepack_version,
    total: row.total,
    breakdown: JSON.parse(row.breakdown) as BreakdownItem[],
    warnings: JSON.parse(row.warnings) as string[],
    calculated_at: row.calculated_at,
  };
}

export interface CalcResultExtended {
  total: number;
  items: BreakdownItem[];
  warnings: string[];
  travelKmEffective: number | null;
}

export function calcForAssignment(a: AssignmentRow, allOfDay: AssignmentRow[], pack: RulePack): CalcResultExtended {
  const withKm = allOfDay.filter((r) => r.travel_km != null && r.travel_km > 0);
  const dayKm = withKm.length ? Math.max(...withKm.map((r) => r.travel_km as number)) : null;
  const sameHall = allOfDay
    .filter((r) => r.hall.trim().toLowerCase() === a.hall.trim().toLowerCase() && a.hall.trim() !== '')
    .sort((x, y) => x.game_datetime.localeCompare(y.game_datetime));
  const hallIndex = sameHall.findIndex((r) => r.id === a.id);

  const res = calcExpense(
    {
      status: a.status,
      role: a.role as 'sr1' | 'sr2' | 'esr' | 'zns',
      league: a.league,
      leagueKey: a.league_key,
      competitionType: a.competition_type as 'championship' | 'cup' | 'friendly' | 'tournament',
      cupRound: a.cup_round,
      tournamentTier: a.tournament_tier,
      tournamentGroup: a.tournament_group,
      gamesCount: a.games_count,
      dateLocal: a.game_datetime,
      hall: a.hall,
      travelKm: a.travel_km,
      travelKmManual: a.travel_km_manual === 1,
      travelMitfahrer: a.travel_mitfahrer === 1,
      pnvCost: a.pnv_cost,
      otherCost: a.other_cost,
      sameDay: { travelCount: allOfDay.length, hallIndex, dayKm },
    },
    pack
  );

  let travelKmEffective: number | null = null;
  if (a.travel_km != null && a.travel_km > 0) {
    travelKmEffective =
      a.travel_km_manual === 1 || allOfDay.length <= 1
        ? a.travel_km
        : Math.round(((dayKm as number) / allOfDay.length) * 100) / 100;
  }

  return { ...res, travelKmEffective };
}

export function recalcUser(userId: number): void {
  const user = getUser(userId);
  if (!user) return;
  const pack = getActiveRulePack(user.association, user.season);
  const rows = db
    .prepare('SELECT * FROM assignments WHERE user_id = ? ORDER BY game_datetime')
    .all(userId) as unknown as AssignmentRow[];
  const byDay = new Map<string, AssignmentRow[]>();
  for (const r of rows) {
    const key = r.game_datetime.slice(0, 10);
    const list = byDay.get(key) ?? [];
    list.push(r);
    byDay.set(key, list);
  }
  const upsert = db.prepare(`
    INSERT INTO expense_calcs (assignment_id, rulepack_version, total, breakdown, warnings, calculated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(assignment_id) DO UPDATE SET
      rulepack_version = excluded.rulepack_version,
      total = excluded.total,
      breakdown = excluded.breakdown,
      warnings = excluded.warnings,
      calculated_at = excluded.calculated_at
  `);
  for (const r of rows) {
    const res = calcForAssignment(r, byDay.get(r.game_datetime.slice(0, 10)) ?? [r], pack);
    upsert.run(r.id, pack.version, res.total, JSON.stringify(res.items), JSON.stringify(res.warnings));
  }
}

export interface AssignmentInput {
  source?: string;
  source_uid?: string | null;
  sequence?: number;
  last_modified?: string | null;
  game_datetime: string;
  home_team: string;
  away_team: string;
  league: string;
  league_key?: string | null;
  competition_type: string;
  cup_round?: string | null;
  tournament_group?: string | null;
  tournament_tier?: string | null;
  games_count?: number;
  hall?: string;
  hall_address?: string;
  role: string;
  status: string;
  notes?: string;
  travel_km?: number | null;
  travel_km_manual?: boolean;
  travel_mitfahrer?: boolean;
  pnv_cost?: number | null;
  other_cost?: number | null;
}

export function createAssignment(userId: number, input: AssignmentInput): number {
  const r = db
    .prepare(
      `INSERT INTO assignments (user_id, source, source_uid, sequence, last_modified, game_datetime, home_team, away_team, league, league_key, competition_type, cup_round, tournament_group, tournament_tier, games_count, hall, hall_address, role, status, notes, travel_km, travel_km_manual, travel_mitfahrer, pnv_cost, other_cost)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      userId,
      input.source ?? 'manual',
      input.source_uid ?? null,
      input.sequence ?? 0,
      input.last_modified ?? null,
      input.game_datetime,
      input.home_team,
      input.away_team,
      input.league,
      input.league_key ?? null,
      input.competition_type,
      input.cup_round ?? null,
      input.tournament_group ?? null,
      input.tournament_tier ?? null,
      input.games_count ?? 1,
      input.hall ?? '',
      input.hall_address ?? '',
      input.role,
      input.status,
      input.notes ?? '',
      input.travel_km ?? null,
      input.travel_km_manual ? 1 : 0,
      input.travel_mitfahrer ? 1 : 0,
      input.pnv_cost ?? null,
      input.other_cost ?? null
    );
  return Number(r.lastInsertRowid);
}

export function updateAssignment(userId: number, id: number, input: Partial<AssignmentInput>): AssignmentRow | undefined {
  const existing = getAssignment(userId, id);
  if (!existing) return undefined;
  const merged = { ...existing, ...stripUndefined(input) } as AssignmentRow;
  db.prepare(
    `UPDATE assignments SET game_datetime=?, home_team=?, away_team=?, league=?, league_key=?, competition_type=?, cup_round=?, tournament_group=?, tournament_tier=?, games_count=?, hall=?, hall_address=?, role=?, status=?, notes=?, travel_km=?, travel_km_manual=?, travel_mitfahrer=?, pnv_cost=?, other_cost=?, sequence=?, last_modified=?, updated_at=datetime('now') WHERE id=?`
  ).run(
    merged.game_datetime,
    merged.home_team,
    merged.away_team,
    merged.league,
    merged.league_key ?? null,
    merged.competition_type,
    merged.cup_round ?? null,
    merged.tournament_group ?? null,
    merged.tournament_tier ?? null,
    merged.games_count,
    merged.hall ?? '',
    merged.hall_address ?? '',
    merged.role,
    merged.status,
    merged.notes ?? '',
    merged.travel_km,
    merged.travel_km_manual,
    merged.travel_mitfahrer,
    merged.pnv_cost,
    merged.other_cost,
    merged.sequence,
    merged.last_modified,
    id
  );
  return getAssignment(userId, id);
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
}

export function deleteAssignment(userId: number, id: number): boolean {
  const r = db.prepare('DELETE FROM assignments WHERE user_id = ? AND id = ?').run(userId, id);
  return r.changes > 0;
}
