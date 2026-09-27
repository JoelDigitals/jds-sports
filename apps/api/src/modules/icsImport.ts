import type { IcsEvent } from './icsParser.ts';
import { matchLeagueKey, type RulePack } from './rules.ts';
import type { AssignmentRole, CompetitionType, AssignmentStatus } from './expense.ts';

export type ImportSource = 'nuliga' | 'handballnet' | 'handball360' | 'manual' | 'file';

export interface AssignmentDraft {
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

export type ImportAction = 'new' | 'changed' | 'unchanged';

export interface ImportReportItem {
  action: ImportAction;
  draft: AssignmentDraft;
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

function detectCompetition(blob: string): CompetitionType {
  if (/turnier|hallenmasters|hallen-master/i.test(blob)) return 'tournament';
  if (/pokal/i.test(blob)) return 'cup';
  if (/freundschaft|vorbereitung|testspiel/i.test(blob)) return 'friendly';
  return 'championship';
}

function detectCupRound(blob: string): string | null {
  if (/quali/i.test(blob)) return 'quali';
  if (/halbfinal/i.test(blob)) return 'halbfinalturnier';
  if (/final\s*4|finale\s*4|final4/i.test(blob)) return 'final4';
  if (/3\.\s*runde|runde\s*3/i.test(blob)) return 'r2_3';
  if (/2\.\s*runde|runde\s*2/i.test(blob)) return 'r2_3';
  if (/1\.\s*runde|runde\s*1|erste runde/i.test(blob)) return 'r1';
  return null;
}

function splitTeams(teamsPart: string): { home: string; away: string } {
  const separators: { sep: string; re: RegExp }[] = [
    { sep: ' – ', re: / – / },
    { sep: ' vs. ', re: /\svs\.\s/i },
    { sep: ' vs ', re: /\svs\s/i },
    { sep: ' gegen ', re: /\sgegen\s/i },
    { sep: ' - ', re: /\s-\s/ },
  ];
  for (const { sep, re } of separators) {
    const idx = teamsPart.search(re);
    if (idx > 0) {
      const home = teamsPart.slice(0, idx).trim();
      const away = teamsPart.slice(idx + sep.length).trim();
      if (home && away) return { home, away };
    }
  }
  const trimmed = teamsPart.trim();
  return { home: trimmed, away: '' };
}

export function extractDraft(
  event: IcsEvent,
  pack: RulePack,
  defaultRole: AssignmentRole,
  source: ImportSource
): AssignmentDraft {
  let text = event.summary.replace(/^\s*(sr|schiedsrichter|schiedsrichterin|einsatz)\s*:\s*/i, '').trim();
  let leaguePart = '';
  let teamsPart = text;
  const colonIdx = text.indexOf(':');
  if (colonIdx > 2 && colonIdx < 60) {
    leaguePart = text.slice(0, colonIdx).trim();
    teamsPart = text.slice(colonIdx + 1).trim();
  }
  const { home, away } = splitTeams(teamsPart);
  const blob = `${leaguePart} ${teamsPart} ${event.description}`;
  const competitionType = detectCompetition(blob);
  const cupRound = competitionType === 'cup' ? detectCupRound(blob) : null;
  const leagueKey = matchLeagueKey(`${leaguePart} ${event.description}`, pack);
  const leagueDisplay = leaguePart || (leagueKey ? pack.classes.find((c) => c.key === leagueKey)?.name ?? leagueKey : 'Unbekannte Liga');

  const status: AssignmentStatus = event.status === 'CANCELLED' ? 'abgesagt' : 'angesetzt';

  return {
    sourceUid: event.uid,
    sequence: event.sequence,
    lastModified: event.lastModified,
    gameDatetime: event.dtStart,
    homeTeam: home,
    awayTeam: away,
    league: leagueDisplay,
    leagueKey,
    competitionType,
    cupRound,
    tournamentGroup: null,
    tournamentTier: null,
    gamesCount: 1,
    hall: event.location.split(',')[0]?.trim() ?? '',
    hallAddress: event.location.trim(),
    role: defaultRole,
    status,
    notes: event.description ? event.description.slice(0, 500) : '',
  };
}

export interface ExistingAssignment {
  id: number;
  source: string;
  source_uid: string | null;
  sequence: number;
  game_datetime: string;
  home_team: string;
  away_team: string;
  league: string;
  league_key: string | null;
  competition_type: string;
  cup_round: string | null;
  hall: string;
  status: AssignmentStatus;
}

export function diffDraft(draft: AssignmentDraft, existing: ExistingAssignment | null): ImportReportItem['changes'] {
  if (!existing) return [];
  const changes: string[] = [];
  if (existing.game_datetime !== draft.gameDatetime) changes.push('Termin');
  if (existing.home_team !== draft.homeTeam) changes.push('Heimmannschaft');
  if (existing.away_team !== draft.awayTeam) changes.push('Gastmannschaft');
  if (existing.league_key !== draft.leagueKey && (existing.league_key || draft.leagueKey)) changes.push('Spielklasse');
  if (existing.hall !== draft.hall && (existing.hall || draft.hall)) changes.push('Halle');
  if (existing.status !== draft.status && draft.status === 'abgesagt') changes.push('Status: abgesagt');
  if (draft.sequence > existing.sequence) changes.push('Sequenz (nuLiga-Update)');
  return changes;
}
