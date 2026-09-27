import { db } from '../db.ts';
import type { FastifyRequest } from 'fastify';

export interface FlagRow {
  id: number;
  name: string;
  note: string;
  everyone: number;
  percent: number | null;
  authenticated: number;
  superusers: number;
}

export interface FlagDetail extends FlagRow {
  users: string[];
  clubs: string[];
}

export interface FlagContext {
  userId: number | null;
  email: string | null;
  isAdmin: boolean;
  club: string;
}

export function flagContextFromRequest(req: FastifyRequest): FlagContext {
  const user = db
    .prepare('SELECT id, email, is_admin, club FROM users WHERE id = ?')
    .get(req.user.sub) as { id: number; email: string; is_admin: number; club: string } | undefined;
  return {
    userId: user?.id ?? null,
    email: user?.email ?? null,
    isAdmin: user?.is_admin === 1,
    club: (user?.club ?? '').trim().toLowerCase(),
  };
}

function percentHash(flagName: string, key: string | number): number {
  let h = 2166136261;
  const input = `${flagName}:${key}`;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 100;
}

export function isFlagActive(
  flag: FlagRow & { activeUsers?: Set<number>; activeClubs?: Set<string> },
  ctx: FlagContext,
  overrides: Map<string, boolean> | null
): boolean {
  if (overrides?.has(flag.name)) return overrides.get(flag.name) as boolean;
  if (flag.everyone) return true;
  if (ctx.userId == null) return false;
  if (flag.superusers && ctx.isAdmin) return true;
  if (flag.authenticated) return true;
  if (flag.activeUsers?.has(ctx.userId)) return true;
  if (flag.activeClubs?.size && ctx.club && flag.activeClubs.has(ctx.club)) return true;
  if (flag.percent != null && percentHash(flag.name, ctx.userId) < flag.percent) return true;
  return false;
}

export function parseDflagParam(rawQuery: string | undefined): Map<string, boolean> {
  const overrides = new Map<string, boolean>();
  if (!rawQuery) return overrides;
  const match = rawQuery.match(/(?:^|[?&])dflag=([^&]*)/);
  if (!match) return overrides;
  for (const part of decodeURIComponent(match[1]).split(',')) {
    const t = part.trim();
    if (!t) continue;
    if (t.startsWith('-')) overrides.set(t.slice(1), false);
    else overrides.set(t, true);
  }
  return overrides;
}

export function loadFlagWithMembers(name: string): (FlagRow & { activeUsers: Set<number>; activeClubs: Set<string> }) | undefined {
  const flag = db.prepare('SELECT * FROM feature_flags WHERE name = ?').get(name) as FlagRow | undefined;
  if (!flag) return undefined;
  const activeUsers = new Set(
    (db.prepare('SELECT user_id FROM feature_flag_users WHERE flag_id = ?').all(flag.id) as { user_id: number }[]).map((r) => r.user_id)
  );
  const activeClubs = new Set(
    (db.prepare('SELECT club FROM feature_flag_clubs WHERE flag_id = ?').all(flag.id) as { club: string }[]).map((r) =>
      r.club.trim().toLowerCase()
    )
  );
  return { ...flag, activeUsers, activeClubs };
}

export function flagIsActiveForRequest(req: FastifyRequest, flagName: string): boolean {
  const ctx = flagContextFromRequest(req);
  const overrides = parseDflagParam(req.url);
  const flag = loadFlagWithMembers(flagName);
  if (!flag) return false;
  return isFlagActive(flag, ctx, overrides);
}

export function allFlagsForContext(ctx: FlagContext, overrides: Map<string, boolean>): Record<string, boolean> {
  const flags = db.prepare('SELECT * FROM feature_flags').all() as unknown as FlagRow[];
  const result: Record<string, boolean> = {};
  for (const flag of flags) {
    const withMembers = loadFlagWithMembers(flag.name);
    if (withMembers) result[flag.name] = isFlagActive(withMembers, ctx, overrides);
  }
  return result;
}

export function listFlagDetails(): FlagDetail[] {
  const flags = db.prepare('SELECT * FROM feature_flags ORDER BY name').all() as unknown as FlagRow[];
  return flags.map((f) => {
    const users = (db
      .prepare('SELECT u.email FROM feature_flag_users x JOIN users u ON u.id = x.user_id WHERE x.flag_id = ?')
      .all(f.id) as { email: string }[]).map((r) => r.email);
    const clubs = (db.prepare('SELECT club FROM feature_flag_clubs WHERE flag_id = ?').all(f.id) as { club: string }[]).map(
      (r) => r.club
    );
    return { ...f, users, clubs };
  });
}

export function seedFlags(): void {
  const count = (db.prepare('SELECT COUNT(*) AS c FROM feature_flags').get() as { c: number }).c;
  if (count > 0) return;
  const insert = db.prepare(
    'INSERT INTO feature_flags (name, note, everyone, percent, authenticated, superusers) VALUES (?, ?, ?, ?, ?, ?)'
  );
  insert.run('pdf_official_bogen', 'Offizieller HVS-Vordruck „Reisekostenabrechnung“ als Quittungs-PDF', 1, null, 0, 0);
  insert.run('import_webcal', 'Kalender-Import per Webcal-URL (zusätzlich zur ICS-Datei)', 0, null, 1, 0);
  insert.run('reports_csv_export', 'CSV-Export der Saisonabrechnung (Excel/Steuer)', 0, 100, 0, 0);
  insert.run('club_module_spielerplus', 'Vereinsmodul „SpielerPlus“ (Phase 3) – Pilotvereine', 0, null, 0, 0);
  const pilot = db.prepare('SELECT id FROM feature_flags WHERE name = ?').get('club_module_spielerplus') as { id: number };
  db.prepare('INSERT INTO feature_flag_clubs (flag_id, club) VALUES (?, ?)').run(pilot.id, 'TV Musterstadt');
}
