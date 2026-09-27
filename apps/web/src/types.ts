export type AssignmentStatus =
  | 'angesetzt'
  | 'bestätigt'
  | 'verlegt'
  | 'abgesagt'
  | 'ausgefallen_angereist'
  | 'ausgefallen_nicht_angereist'
  | 'geleitet';

export type AssignmentRole = 'sr1' | 'sr2' | 'esr' | 'zns';
export type CompetitionType = 'championship' | 'cup' | 'friendly' | 'tournament';
export type CupRound = 'quali' | 'r1' | 'r2_3' | 'halbfinalturnier' | 'final4';
export type TournamentTier = 'bis_2x20' | 'ab_2x25';
export type ImportAction = 'new' | 'changed' | 'unchanged';

export interface User {
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
  default_role: AssignmentRole;
  partner_name: string;
  partner_address: string;
  is_admin: number;
  association: string;
  season: string;
}

export interface Assignment {
  id: number;
  source: string;
  sourceUid: string | null;
  gameDatetime: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  leagueKey: string | null;
  competitionType: CompetitionType;
  cupRound: string | null;
  tournamentGroup: string | null;
  tournamentTier: string | null;
  gamesCount: number;
  hall: string;
  hallAddress: string;
  role: AssignmentRole;
  status: AssignmentStatus;
  notes: string;
  travelKm: number | null;
  travelKmManual: boolean;
  travelMitfahrer: boolean;
  travelKmAuto?: boolean;
  travelMinutes?: number | null;
  pnvCost: number | null;
  otherCost: number | null;
  expenseTotal: number | null;
}

export interface BreakdownItem {
  key: string;
  label: string;
  amount: number;
  detail?: string;
  warning?: string;
}

export interface Expense {
  assignment_id: number;
  rulepack_version: string;
  total: number;
  breakdown: BreakdownItem[];
  warnings: string[];
  calculated_at: string;
}

export interface AssignmentDetail {
  assignment: Assignment;
  expense: Expense | null;
  rulePackVersion: string;
}

export interface ReceiptGame {
  id: number;
  date: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  status: string;
}

export interface Receipt {
  id: number;
  season: string;
  total: number;
  payoutStatus: 'offen' | 'erhalten' | 'nicht_ausgezahlt';
  payoutDate: string | null;
  payer: string;
  createdAt: string;
  hasPdf: boolean;
  games: ReceiptGame[];
}

export interface DashboardData {
  season: string;
  rulePackVersion: string;
  totals: {
    games: number;
    geleitet: number;
    spesenTotal: number;
    offenTotal: number;
    openCount: number;
    kmTotal: number;
  };
  next: {
    id: number;
    gameDatetime: string;
    homeTeam: string;
    awayTeam: string;
    league: string;
    hall: string;
    status: AssignmentStatus;
    role: string;
    expenseTotal: number;
  }[];
  deadlines: { year: number; deadline: string; count: number; amount: number }[];
  nonPaymentOverdue: { id: number; total: number; days: number; gameDate: string; limit: number }[];
  nonPaymentEmail: string;
  recentReceipts: { id: number; total: number; payoutStatus: string; createdAt: string; gameDate: string }[];
}

export interface RuleClass {
  key: string;
  name: string;
  aliases: string[];
  rates: { sr_gespann: number; sr_einzel: number };
  verified: boolean;
  note?: string;
}

export interface RulePack {
  association: string;
  associationName: string;
  season: string;
  version: string;
  currency: string;
  source?: string;
  classes: RuleClass[];
  cupRounds: { key: string; name: string; rate: number; verified: boolean }[];
  cupCapClass: string | null;
  cupNote?: string;
  friendlies: { explicit: { key: string; name: string; rate: number; verified: boolean }[]; classRates: Record<string, number>; classRatesNote: string };
  tournamentGroups: { key: string; name: string; tiers: { key: string; name: string; jugend: number | null; aktive: number | null }[] }[];
  weekdayBonus: { amount: number; days: number[]; skipHolidays: boolean; verified: boolean; note?: string };
  doubleBonus: { amount: number; verified: boolean; note?: string };
  cancellation: { factor: number; travelFull: boolean; verified: boolean; note?: string };
  travel: { kmRate: number; kmRateMitfahrer: number; kmRateVerified: boolean; kmRateNote?: string; borderRule?: string };
  deadlines: { nonPaymentDays: number; nonPaymentEmail: string; submissionDeadline: string; submissionNote?: string };
  otherRates: { key: string; name: string; rate: number; verified: boolean }[];
}

export interface ImportDraft {
  sourceUid: string;
  sequence: number;
  lastModified: string | null;
  gameDatetime: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  leagueKey: string | null;
  competitionType: CompetitionType;
  cupRound: string | null;
  tournamentGroup: string | null;
  tournamentTier: string | null;
  gamesCount: number;
  hall: string;
  hallAddress: string;
  role: AssignmentRole;
  status: AssignmentStatus;
  notes: string;
}

export interface ImportReportItem {
  action: ImportAction;
  draft: ImportDraft;
  changes: string[];
  existing: {
    id: number;
    gameDatetime: string;
    homeTeam: string;
    awayTeam: string;
    league: string;
    hall: string;
    status: AssignmentStatus;
  } | null;
}

export interface ImportAnalyzeResult {
  source: string;
  total: number;
  new: number;
  changed: number;
  unchanged: number;
  skipped?: number;
  items: ImportReportItem[];
}

export interface SummaryData {
  season: string;
  byClass: { name: string; count: number; total: number }[];
  byMonth: { month: string; count: number; total: number }[];
}

export interface FlagDetail {
  id: number;
  name: string;
  note: string;
  everyone: number;
  percent: number | null;
  authenticated: number;
  superusers: number;
  users: string[];
  clubs: string[];
}

export type FlagsMap = Record<string, boolean>;
