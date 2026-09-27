import { readFileSync } from 'node:fs';
import { db } from '../db.ts';

export interface ClassRate {
  key: string;
  name: string;
  aliases: string[];
  rates: { sr_gespann: number; sr_einzel: number; zns?: number };
  verified: boolean;
  note?: string;
}

export interface CupRound { key: string; name: string; rate: number; verified: boolean }
export interface ExplicitRate { key: string; name: string; rate: number; verified: boolean }
export interface TournamentTier { key: string; name: string; jugend: number | null; aktive: number | null }
export interface TournamentGroup { key: string; name: string; tiers: TournamentTier[] }

export interface RulePack {
  association: string;
  associationName: string;
  season: string;
  version: string;
  currency: string;
  source?: string;
  form?: { title: string; templateFile: string; note: string };
  classes: ClassRate[];
  cupRounds: CupRound[];
  cupCapClass: string | null;
  cupNote?: string;
  friendlies: {
    explicit: ExplicitRate[];
    classRates: Record<string, number>;
    classRatesNote: string;
  };
  tournamentGroups: TournamentGroup[];
  weekdayBonus: { amount: number; days: number[]; skipHolidays: boolean; verified: boolean; note?: string };
  doubleBonus: { amount: number; verified: boolean; note?: string };
  cancellation: { factor: number; travelFull: boolean; verified: boolean; note?: string };
  travel: { kmRate: number; kmRateMitfahrer: number; kmRateVerified: boolean; kmRateNote?: string; borderRule?: string };
  deadlines: { nonPaymentDays: number; nonPaymentEmail: string; submissionDeadline: string; submissionNote?: string };
  otherRates: ExplicitRate[];
}

export function seedRulePack(filePath: string): void {
  const pack: RulePack = JSON.parse(readFileSync(filePath, 'utf8'));
  const existing = db
    .prepare('SELECT id FROM rule_packs WHERE association = ? AND season = ? AND version = ?')
    .get(pack.association, pack.season, pack.version);
  if (!existing) {
    db.prepare(
      'INSERT INTO rule_packs (association, season, version, data, active) VALUES (?, ?, ?, ?, 1)'
    ).run(pack.association, pack.season, pack.version, JSON.stringify(pack));
  }
}

export function getActiveRulePack(association: string, season: string): RulePack {
  const row = db
    .prepare(
      'SELECT data FROM rule_packs WHERE association = ? AND season = ? AND active = 1 ORDER BY id DESC LIMIT 1'
    )
    .get(association, season) as { data: string } | undefined;
  if (row) return JSON.parse(row.data);
  const fallback = db
    .prepare('SELECT data FROM rule_packs WHERE active = 1 ORDER BY id DESC LIMIT 1')
    .get() as { data: string } | undefined;
  if (!fallback) throw new Error('Kein aktives Regelwerk vorhanden');
  return JSON.parse(fallback.data);
}

const GENDER_WORDS = [
  'männer', 'frauen', 'herren', 'damen', 'maenner', 'männlich', 'weiblich',
  'männliche', 'weibliche', 'maennlich', 'maennliche', 'jungen', 'maedchen', 'mädchen', 'weibl', 'männl',
];

export function normalizeLeagueText(s: string): string {
  let t = s.toLowerCase();
  t = t.replace(/\[[^\]]*\]/g, ' ');
  t = t.replace(/\([^)]*\)/g, ' ');
  t = t.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
  t = t.replace(/[^a-z0-9]+/g, ' ').trim();
  for (const w of GENDER_WORDS) {
    t = t.replace(new RegExp(`\\b${w}\\b`, 'g'), ' ');
  }
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

export function matchLeagueKey(leagueText: string, pack: RulePack): string | null {
  const norm = normalizeLeagueText(leagueText);
  if (!norm) return null;
  const candidates: { key: string; needle: string }[] = [];
  for (const cls of pack.classes) {
    candidates.push({ key: cls.key, needle: normalizeLeagueText(cls.name) });
    for (const alias of cls.aliases) candidates.push({ key: cls.key, needle: normalizeLeagueText(alias) });
  }
  candidates.sort((a, b) => b.needle.length - a.needle.length);
  for (const c of candidates) {
    if (c.needle && norm.includes(c.needle)) return c.key;
  }
  return null;
}
