import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { config } from './config.ts';
import { seedRulePack } from './modules/rules.ts';
import { seedFlags } from './modules/flags.ts';
import { seedDemoData } from './seed.ts';

mkdirSync(dirname(config.dbPath), { recursive: true });
mkdirSync(config.receiptsDir, { recursive: true });

export const db = new DatabaseSync(config.dbPath);

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  street TEXT DEFAULT '',
  zip TEXT DEFAULT '',
  city TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  iban TEXT DEFAULT '',
  club TEXT DEFAULT '',
  default_role TEXT NOT NULL DEFAULT 'sr1',
  association TEXT NOT NULL DEFAULT 'HVS',
  season TEXT NOT NULL DEFAULT '2026/27',
  partner_name TEXT DEFAULT '',
  partner_address TEXT DEFAULT '',
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rule_packs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  association TEXT NOT NULL,
  season TEXT NOT NULL,
  version TEXT NOT NULL,
  data TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(association, season, version)
);

CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'manual',
  source_uid TEXT,
  sequence INTEGER NOT NULL DEFAULT 0,
  last_modified TEXT,
  game_datetime TEXT NOT NULL,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  league TEXT NOT NULL,
  league_key TEXT,
  competition_type TEXT NOT NULL DEFAULT 'championship',
  cup_round TEXT,
  tournament_group TEXT,
  tournament_tier TEXT,
  games_count INTEGER NOT NULL DEFAULT 1,
  hall TEXT DEFAULT '',
  hall_address TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'sr1',
  status TEXT NOT NULL DEFAULT 'angesetzt',
  notes TEXT DEFAULT '',
  travel_km REAL,
  travel_km_manual INTEGER NOT NULL DEFAULT 0,
  travel_mitfahrer INTEGER NOT NULL DEFAULT 0,
  pnv_cost REAL,
  other_cost REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, source, source_uid)
);

CREATE TABLE IF NOT EXISTS expense_calcs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id INTEGER NOT NULL UNIQUE REFERENCES assignments(id) ON DELETE CASCADE,
  rulepack_version TEXT NOT NULL,
  total REAL NOT NULL,
  breakdown TEXT NOT NULL,
  warnings TEXT NOT NULL DEFAULT '[]',
  calculated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assignment_ids TEXT NOT NULL,
  season TEXT NOT NULL,
  total REAL NOT NULL,
  pdf_filename TEXT,
  payout_status TEXT NOT NULL DEFAULT 'offen',
  payout_date TEXT,
  payer TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS feature_flags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  note TEXT DEFAULT '',
  everyone INTEGER NOT NULL DEFAULT 0,
  percent INTEGER,
  authenticated INTEGER NOT NULL DEFAULT 0,
  superusers INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS feature_flag_users (
  flag_id INTEGER NOT NULL REFERENCES feature_flags(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(flag_id, user_id)
);

CREATE TABLE IF NOT EXISTS feature_flag_clubs (
  flag_id INTEGER NOT NULL REFERENCES feature_flags(id) ON DELETE CASCADE,
  club TEXT NOT NULL,
  UNIQUE(flag_id, club)
);

CREATE TABLE IF NOT EXISTS geo_cache (
  query TEXT PRIMARY KEY,
  lat REAL,
  lon REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS route_cache (
  key TEXT PRIMARY KEY,
  meters REAL NOT NULL,
  seconds REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_assignments_user_date ON assignments(user_id, game_datetime);
CREATE INDEX IF NOT EXISTS idx_receipts_user ON receipts(user_id);
`);

function addColumnIfMissing(table: string, column: string, ddl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

addColumnIfMissing('users', 'partner_name', "TEXT DEFAULT ''");
addColumnIfMissing('users', 'partner_address', "TEXT DEFAULT ''");
addColumnIfMissing('users', 'is_admin', 'INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('assignments', 'tournament_group', 'TEXT');
addColumnIfMissing('assignments', 'travel_mitfahrer', 'INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('assignments', 'pnv_cost', 'REAL');
addColumnIfMissing('assignments', 'other_cost', 'REAL');
addColumnIfMissing('assignments', 'travel_km_auto', 'INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('assignments', 'travel_minutes', 'REAL');

db.exec(`
DELETE FROM rule_packs WHERE association = 'HVS' AND season = '2026/27' AND version != '2026.3-offiziell';
UPDATE rule_packs SET active = 0 WHERE association = 'HVS';
UPDATE rule_packs SET active = 1 WHERE association = 'HVS' AND version = '2026.3-offiziell';
`);

export async function bootstrapDb(): Promise<void> {
  seedRulePack(join(import.meta.dirname, '..', 'data', 'rulepacks', 'HVS_2026_27.json'));
  seedFlags();
  await seedDemoData();
}
