import type { RulePack } from './rules.ts';
import { matchLeagueKey } from './rules.ts';
import type { AssignmentDraft, ImportSource } from './icsImport.ts';
import type { AssignmentRole, AssignmentStatus, CompetitionType } from './expense.ts';

export function parseCsv(text: string): Record<string, string>[] {
  const clean = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);

  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (r[idx] ?? '').trim();
    });
    return obj;
  });
}

function detectCompetition(blob: string): CompetitionType {
  if (/turnier/i.test(blob)) return 'tournament';
  if (/pokal/i.test(blob)) return 'cup';
  if (/freundschaft|vorbereitungsspiel|testspiel/i.test(blob)) return 'friendly';
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

function leagueFromWettbewerb(wettbewerb: string): string {
  const idx = wettbewerb.toUpperCase().indexOf('GRUPO');
  if (idx >= 0) {
    return wettbewerb
      .slice(idx + 'GRUPO'.length)
      .replace(/^[\s:;-]+/, '')
      .trim();
  }
  return wettbewerb
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function teamsFromSpiel(spiel: string): { home: string; away: string } {
  const parts = spiel.split('Heimmannschaft');
  const home = (parts[0] ?? '').replace(/\s{2,}/g, ' ').trim();
  const rest = parts[1] ?? '';
  const away = (rest.split('Gastmannschaft')[0] ?? '')
    .replace(/Aufstellung ansehen\s*\(\d+\)/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*-\s*$/, '')
    .trim();
  return { home, away };
}

function datetimeFromCell(cell: string): string | null {
  const m = cell.replace(/\s+/g, ' ').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const [, d, mo, y, h, mi] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T${h.padStart(2, '0')}:${mi}`;
}

function hallFromCell(cell: string): { hall: string; hallAddress: string } {
  const raw = cell.trim();
  const chunks = raw.split(/\s{2,}/);
  let hall = chunks[0]?.trim() ?? '';
  if (chunks.length < 2 && hall.includes(',')) {
    hall = hall.split(',')[0].trim();
  }
  return { hall, hallAddress: raw.replace(/\s{2,}/g, ' ').trim() };
}

function statusFromRow(ansetzungen: string, statusCol: string): { status: AssignmentStatus; note: string } {
  const ans = ansetzungen.toLowerCase();
  const statusRaw = statusCol.trim().toLowerCase();
  if (statusRaw.startsWith('abgeschlossen')) {
    return { status: 'geleitet', note: 'Spiel lt. H360 abgeschlossen' };
  }
  const firstSegment = (ansetzungen.split(/\s{2,}|\.\.\./)[0] ?? '').toLowerCase().trim();
  if (firstSegment.includes('akzeptiert') || firstSegment.includes('aceptada')) {
    return { status: 'bestätigt', note: 'Ansetzung akzeptiert' };
  }
  if (firstSegment.includes('rechazada') || firstSegment.includes('abgelehnt')) {
    return { status: 'abgesagt', note: 'Ansetzung abgelehnt' };
  }
  if (ans.includes('akzeptiert') || (ans.includes('aceptada') && !ans.includes('rechazada'))) {
    return { status: 'bestätigt', note: 'Ansetzung akzeptiert' };
  }
  return { status: 'angesetzt', note: 'noch keine Rückmeldung' };
}

export function extractH360Drafts(
  rows: Record<string, string>[],
  pack: RulePack,
  defaultRole: AssignmentRole
): { drafts: AssignmentDraft[]; skipped: number } {
  const drafts: AssignmentDraft[] = [];
  let skipped = 0;
  const source: ImportSource = 'handball360';

  for (const row of rows) {
    const spielnummer = (row['Spielnummer'] ?? '').trim();
    const datetime = datetimeFromCell(row['Datum und Uhrzeit'] ?? '');
    if (!spielnummer || !datetime) {
      skipped++;
      continue;
    }
    const leaguePart = leagueFromWettbewerb(row['Wettbewerbe'] ?? '');
    const { home, away } = teamsFromSpiel(row['Spiel'] ?? '');
    const { hall, hallAddress } = hallFromCell(row['Halle'] ?? '');
    const blob = `${leaguePart} ${row['Wettbewerbe'] ?? ''}`;
    const competitionType = detectCompetition(blob);
    const cupRound = competitionType === 'cup' ? detectCupRound(blob) : null;
    const leagueKey = matchLeagueKey(leaguePart, pack);
    const { status, note } = statusFromRow(row['Ansetzungen'] ?? '', row['Status'] ?? '');

    drafts.push({
      sourceUid: spielnummer,
      sequence: 0,
      lastModified: null,
      gameDatetime: datetime,
      homeTeam: home,
      awayTeam: away,
      league: leaguePart || 'Unbekannte Liga',
      leagueKey,
      competitionType,
      cupRound,
      tournamentGroup: null,
      tournamentTier: null,
      gamesCount: 1,
      hall,
      hallAddress,
      role: defaultRole,
      status,
      notes: `Handball360: ${note}`,
    });
  }
  return { drafts, skipped };
}
