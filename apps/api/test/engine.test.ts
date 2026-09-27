import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RulePack } from '../src/modules/rules.ts';
import { matchLeagueKey } from '../src/modules/rules.ts';
import { calcExpense, isHolidaySaarland, type CalcInput } from '../src/modules/expense.ts';
import { parseIcs } from '../src/modules/icsParser.ts';
import { extractDraft, diffDraft } from '../src/modules/icsImport.ts';
import { parseCsv, extractH360Drafts } from '../src/modules/csvParser.ts';
import { isFlagActive, parseDflagParam, type FlagRow, type FlagContext } from '../src/modules/flags.ts';

const pack: RulePack = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', 'data', 'rulepacks', 'HVS_2026_27.json'), 'utf8')
);

function input(partial: Partial<CalcInput>): CalcInput {
  return {
    status: 'geleitet',
    role: 'sr1',
    league: 'Bezirksliga',
    leagueKey: 'bezirksliga',
    competitionType: 'championship',
    cupRound: null,
    tournamentGroup: null,
    tournamentTier: null,
    gamesCount: 1,
    dateLocal: '2026-09-19T16:00',
    hall: 'Halle A',
    travelKm: null,
    travelKmManual: false,
    travelMitfahrer: false,
    pnvCost: null,
    otherCost: null,
    sameDay: { travelCount: 1, hallIndex: 0, dayKm: null },
    ...partial,
  };
}

function totalOf(partial: Partial<CalcInput>): number {
  return calcExpense(input(partial), pack).total;
}

describe('PRD Testmatrix 9.6 – Spesen-Engine (DB 2026/27, originale Sätze)', () => {
  it('Bezirksliga am Sonntag: 30,00 € Basis, keine Wochenspielpauschale', () => {
    const res = calcExpense(input({ dateLocal: '2026-09-19T16:00' }), pack);
    expect(res.total).toBe(30);
    expect(res.items.find((i) => i.key === 'weekday')).toBeUndefined();
  });

  it('Verbandsliga am Mittwoch: 35,00 € + 5,00 € Wochenspielpauschale = 40 €', () => {
    const res = calcExpense(
      input({ leagueKey: 'verbandsliga', league: 'Verbandsliga', dateLocal: '2026-09-16T20:00' }),
      pack
    );
    expect(res.total).toBe(40);
  });

  it('Wochenspielpauschale entfällt an gesetzlichen Feiertagen (1. Mai, Freitag)', () => {
    expect(isHolidaySaarland('2026-05-01')).toBe(true);
    const res = calcExpense(
      input({ leagueKey: 'verbandsliga', dateLocal: '2026-05-01T18:00' }),
      pack
    );
    expect(res.total).toBe(35);
    expect(res.items.find((i) => i.key === 'weekday')?.label).toContain('entfällt');
  });

  it('Doppelansetzung: +5,00 € ab 2. Spiel in derselben Halle (DB 7.2.8)', () => {
    const res = calcExpense(
      input({ leagueKey: 'oberliga', league: 'Oberliga Saar', sameDay: { travelCount: 2, hallIndex: 1, dayKm: 40 } }),
      pack
    );
    expect(res.items.find((i) => i.key === 'base')?.amount).toBe(40);
    expect(res.items.find((i) => i.key === 'double')?.amount).toBe(5);
  });

  it('Pokalrunden lt. DB 7.2.6: Quali 25 / R1 30 / R2+R3 35 / HFT 25 / Final4 30', () => {
    expect(totalOf({ competitionType: 'cup', cupRound: 'quali', league: 'Pokal', leagueKey: null })).toBe(25);
    expect(totalOf({ competitionType: 'cup', cupRound: 'r1', league: 'Pokal', leagueKey: null })).toBe(30);
    expect(totalOf({ competitionType: 'cup', cupRound: 'r2_3', league: 'Pokal', leagueKey: null })).toBe(35);
    expect(totalOf({ competitionType: 'cup', cupRound: 'halbfinalturnier', league: 'Pokal', leagueKey: null })).toBe(25);
    expect(totalOf({ competitionType: 'cup', cupRound: 'final4', league: 'Pokal', leagueKey: null })).toBe(30);
  });

  it('Freundschaftsspiele: feste Sätze je Heimvereins-Klasse (DB 7.2.3)', () => {
    expect(totalOf({ competitionType: 'friendly', league: 'FS', leagueKey: 'oberliga' })).toBe(20);
    expect(totalOf({ competitionType: 'friendly', league: 'FS', leagueKey: 'a_liga' })).toBe(15);
    expect(totalOf({ competitionType: 'friendly', league: 'FS', leagueKey: 'b_liga' })).toBe(15);
    expect(totalOf({ competitionType: 'friendly', league: 'FS', leagueKey: 'bundesliga_3liga' })).toBe(40);
    expect(totalOf({ competitionType: 'friendly', league: 'FS', leagueKey: 'regionalliga' })).toBe(30);
  });

  it('Status ausgefallen (angereist): 50 % Spesen + volle Fahrtkosten (DB 7.2.11)', () => {
    const res = calcExpense(
      input({ status: 'ausgefallen_angereist', travelKm: 24, sameDay: { travelCount: 1, hallIndex: 0, dayKm: 24 } }),
      pack
    );
    expect(res.items.find((i) => i.key === 'base')?.amount).toBe(15);
    expect(res.items.find((i) => i.key === 'travel')?.amount).toBe(7.2);
    expect(res.total).toBe(22.2);
  });

  it('Status abgesagt / nicht angereist: 0,00 €', () => {
    expect(totalOf({ status: 'abgesagt' })).toBe(0);
    expect(totalOf({ status: 'ausgefallen_nicht_angereist' })).toBe(0);
  });

  it('Fahrtkosten 0,30 €/km einzeln; 0,32 €/km als Mitfahrer im Gespann (DB 7.2.10)', () => {
    const alone = calcExpense(
      input({ leagueKey: 'oberliga', league: 'Oberliga', travelKm: 40, sameDay: { travelCount: 1, hallIndex: 0, dayKm: 40 } }),
      pack
    );
    expect(alone.items.find((i) => i.key === 'travel')?.amount).toBe(12);
    expect(alone.items.find((i) => i.key === 'travel')?.label).toContain('Einzelfahrt');
    const mitfahrer = calcExpense(
      input({ leagueKey: 'oberliga', league: 'Oberliga', travelKm: 40, travelMitfahrer: true, sameDay: { travelCount: 1, hallIndex: 0, dayKm: 40 } }),
      pack
    );
    expect(mitfahrer.items.find((i) => i.key === 'travel')?.amount).toBe(12.8);
    expect(mitfahrer.items.find((i) => i.key === 'travel')?.label).toContain('Gespann');
  });

  it('Fahrtkosten: anteilige Aufteilung bei 2 Spielen am Tag (DB 7.2.11)', () => {
    const res = calcExpense(
      input({ leagueKey: 'oberliga', league: 'Oberliga', travelKm: 40, sameDay: { travelCount: 2, hallIndex: 0, dayKm: 40 } }),
      pack
    );
    const travel = res.items.find((i) => i.key === 'travel');
    expect(travel?.amount).toBe(6);
    expect(travel?.detail).toContain('anteilig 1/2');
  });

  it('Turniere (DB 7.2.7): Staffel × Anzahl Spiele, Jugend- vs. Aktiven-Satz', () => {
    expect(
      totalOf({ competitionType: 'tournament', tournamentGroup: 'turnier', tournamentTier: '2x25', gamesCount: 4, league: 'Hallenturnier', leagueKey: null })
    ).toBe(120);
    expect(
      totalOf({ competitionType: 'tournament', tournamentGroup: 'turnier', tournamentTier: '2x20', gamesCount: 3, league: 'Jugendturnier', leagueKey: null })
    ).toBe(60);
    expect(
      totalOf({ competitionType: 'tournament', tournamentGroup: 'turnier', tournamentTier: 'bis_30', gamesCount: 5, league: 'Turnier', leagueKey: null })
    ).toBe(75);
  });

  it('Vorbereitungsturniere (DB 7.2.3) und Pokalturniere Jugend (DB 7.2.4)', () => {
    expect(
      totalOf({ competitionType: 'tournament', tournamentGroup: 'vorbereitungsturnier', tournamentTier: 'ueber_30', gamesCount: 6, league: 'Vorbereitung', leagueKey: null })
    ).toBe(90);
    expect(
      totalOf({ competitionType: 'tournament', tournamentGroup: 'pokalturnier_jugend', tournamentTier: 'jugend_bc', gamesCount: 5, league: 'Pokalturnier Jugend B+C', leagueKey: null })
    ).toBe(75);
    expect(
      totalOf({ competitionType: 'tournament', tournamentGroup: 'pokalturnier_jugend', tournamentTier: 'jugend_de', gamesCount: 4, league: 'Pokalturnier Jugend D+E', leagueKey: null })
    ).toBe(40);
  });

  it('PNV- und sonstige Auslagen fließen in die Summe ein (Abrechnungsbogen)', () => {
    const res = calcExpense(input({ leagueKey: 'oberliga', league: 'Oberliga', pnvCost: 9.6, otherCost: 3.5 }), pack);
    expect(res.items.find((i) => i.key === 'pnv')?.amount).toBe(9.6);
    expect(res.items.find((i) => i.key === 'other')?.amount).toBe(3.5);
    expect(res.total).toBe(53.1);
  });

  it('Unbekannte Spielklasse: Warnung und 0 € Basis', () => {
    const res = calcExpense(input({ leagueKey: null, league: 'Unbekannt' }), pack);
    expect(res.warnings.length).toBeGreaterThan(0);
    expect(res.items.find((i) => i.key === 'base')?.amount).toBe(0);
  });

  it('Liga-Matching: Aktive, Jugend und JPJ', () => {
    expect(matchLeagueKey('Männer-Bezirksliga', pack)).toBe('bezirksliga');
    expect(matchLeagueKey('Oberliga Saar', pack)).toBe('oberliga');
    expect(matchLeagueKey('Oberliga Saar Jugend A', pack)).toBe('oberliga_jugend_ab');
    expect(matchLeagueKey('Bezirksliga Jugend C', pack)).toBe('bezirksliga_jugend_c');
    expect(matchLeagueKey('Jugend pfeift Jugend', pack)).toBe('jpj');
    expect(matchLeagueKey('Kreisliga X', pack)).toBeNull();
  });
});

describe('Feature-Flags (Waffle-Semantik)', () => {
  const baseFlag: FlagRow = { id: 1, name: 'test_flag', note: '', everyone: 0, percent: null, authenticated: 0, superusers: 0 };
  const anonCtx: FlagContext = { userId: null, email: null, isAdmin: false, club: '' };
  const userCtx: FlagContext = { userId: 42, email: 'sr@example.de', isAdmin: false, club: 'tv musterstadt' };

  it('everyone: für alle aktiv (auch anonym)', () => {
    expect(isFlagActive({ ...baseFlag, everyone: 1 }, anonCtx, null)).toBe(true);
  });

  it('Standard: inaktiv', () => {
    expect(isFlagActive(baseFlag, userCtx, null)).toBe(false);
  });

  it('authenticated: nur für angemeldete Nutzer', () => {
    const flag = { ...baseFlag, authenticated: 1 };
    expect(isFlagActive(flag, anonCtx, null)).toBe(false);
    expect(isFlagActive(flag, userCtx, null)).toBe(true);
  });

  it('superusers: nur für Admins', () => {
    const flag = { ...baseFlag, superusers: 1 };
    expect(isFlagActive(flag, userCtx, null)).toBe(false);
    expect(isFlagActive(flag, { ...userCtx, isAdmin: true }, null)).toBe(true);
  });

  it('spezifische Nutzer (Allow-Liste)', () => {
    const flag = { ...baseFlag, activeUsers: new Set([42]) };
    expect(isFlagActive(flag, userCtx, null)).toBe(true);
    expect(isFlagActive(flag, { ...userCtx, userId: 43 }, null)).toBe(false);
  });

  it('spezifische Vereine (Club-Targeting)', () => {
    const flag = { ...baseFlag, activeClubs: new Set(['tv musterstadt']) };
    expect(isFlagActive(flag, userCtx, null)).toBe(true);
    expect(isFlagActive(flag, { ...userCtx, club: 'sg other' }, null)).toBe(false);
  });

  it('Percent-Rollout: deterministisch pro Nutzer+Flag', () => {
    const flag = { ...baseFlag, percent: 100 };
    expect(isFlagActive(flag, userCtx, null)).toBe(true);
    const flag0 = { ...baseFlag, percent: 0 };
    expect(isFlagActive(flag0, userCtx, null)).toBe(false);
    const flag50 = { ...baseFlag, percent: 50 };
    const a = isFlagActive(flag50, { ...userCtx, userId: 1 }, null);
    const b = isFlagActive(flag50, { ...userCtx, userId: 1 }, null);
    expect(a).toBe(b);
  });

  it('dflag-Override (Testing): ?dflag=name,-other', () => {
    const overrides = parseDflagParam('/api/flags/active?dflag=test_flag,-other_flag');
    expect(overrides.get('test_flag')).toBe(true);
    expect(overrides.get('other_flag')).toBe(false);
    expect(isFlagActive(baseFlag, userCtx, new Map([['test_flag', true]]))).toBe(true);
    expect(isFlagActive({ ...baseFlag, everyone: 1 }, userCtx, new Map([['test_flag', false]]))).toBe(false);
  });
});

describe('Handball360-CSV-Import (MISQUAD-Schiedsrichterplattform)', () => {
  const csvPath = join(import.meta.dirname, '..', 'samples', 'sample-h360.csv');

  it('CSV-Parser: Header, quoted fields, BOM, Zeilen', () => {
    const rows = parseCsv(readFileSync(csvPath, 'utf8'));
    expect(rows.length).toBe(9);
    expect(rows[0]['Spielnummer']).toBe('2627SARBKRKERMA0104');
    expect(rows[8]['Status']).toBe('Abgeschlossen');
  });

  it('Extraktion: Liga (GRUPO), Teams, Datum, Halle, Status', () => {
    const rows = parseCsv(readFileSync(csvPath, 'utf8'));
    const { drafts, skipped } = extractH360Drafts(rows, pack, 'sr1');
    expect(skipped).toBe(0);
    expect(drafts.length).toBe(9);

    const aLiga = drafts[0];
    expect(aLiga.sourceUid).toBe('2627SARBKRKERMA0104');
    expect(aLiga.leagueKey).toBe('a_liga');
    expect(aLiga.homeTeam).toBe('HSG FC SCHWARZERDEN - TV KUSEL');
    expect(aLiga.awayTeam).toBe('ASC QUIERSCHIED II');
    expect(aLiga.gameDatetime).toBe('2026-10-31T15:00');
    expect(aLiga.hall).toBe('SPORTHALLE SCHULZENTRUM');
    expect(aLiga.hallAddress).toContain('66869 KUSEL');
    expect(aLiga.competitionType).toBe('championship');
    expect(aLiga.status).toBe('bestätigt');

    const olC = drafts[1];
    expect(olC.leagueKey).toBe('oberliga_jugend_cd');
    expect(olC.league).toContain('Oberliga männliche C Jugend');

    const olB = drafts[3];
    expect(olB.leagueKey).toBe('oberliga_jugend_ab');

    const offen = drafts[4];
    expect(offen.status).toBe('angesetzt');
    expect(offen.notes).toContain('keine Rückmeldung');

    const bzC = drafts[5];
    expect(bzC.leagueKey).toBe('bezirksliga_jugend_c');

    const bzB = drafts[6];
    expect(bzB.leagueKey).toBe('bezirksliga_jugend_ab');
    expect(bzB.gameDatetime).toBe('2026-09-19T14:00');

    const abgeschlossen = drafts[7];
    expect(abgeschlossen.status).toBe('geleitet');
    expect(abgeschlossen.homeTeam).toBe('MSG HF ILLTAL');
    expect(abgeschlossen.awayTeam).toBe('HC ST. JOHANN');
  });

  it('Liga-Matching der H360-Schreibweisen', () => {
    expect(matchLeagueKey('A-Liga Männer Staffel Ost', pack)).toBe('a_liga');
    expect(matchLeagueKey('Oberliga männliche C Jugend', pack)).toBe('oberliga_jugend_cd');
    expect(matchLeagueKey('Oberliga männliche B Jugend Staffel A', pack)).toBe('oberliga_jugend_ab');
    expect(matchLeagueKey('Oberliga weibliche A Jugend', pack)).toBe('oberliga_jugend_ab');
    expect(matchLeagueKey('Bezirksliga männliche C Jugend Staffel West', pack)).toBe('bezirksliga_jugend_c');
    expect(matchLeagueKey('Bezirksliga weibliche B Jugend', pack)).toBe('bezirksliga_jugend_ab');
  });
});

describe('ICS-Parser (RFC 5545)', () => {
  const samplePath = join(import.meta.dirname, '..', 'samples', 'sample-nuliga.ics');
  const updatePath = join(import.meta.dirname, '..', 'samples', 'sample-nuliga-update.ics');

  it('parst VEVENTs mit Zusammenfassung, Halle, UID', () => {
    const events = parseIcs(readFileSync(samplePath, 'utf8'));
    expect(events.length).toBe(5);
    const first = events[0];
    expect(first.uid).toBe('nuliga-hvs-2026-4471-1001');
    expect(first.summary).toContain('Bezirksliga');
    expect(first.location).toContain('Kirkel');
    expect(first.dtStart).toBe('2026-10-10T15:00');
  });

  it('UTC-Zeiten werden nach Europe/Berlin konvertiert', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:test-utc-1',
      'DTSTART:20261010T130000Z',
      'SUMMARY:Test',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const events = parseIcs(ics);
    expect(events[0].dtStart).toBe('2026-10-10T15:00');
  });

  it('unterstützt Zeilen-Folding (Langbeschreibungen)', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:test-fold-1',
      'DTSTART;TZID=Europe/Berlin:20261010T150000',
      'SUMMARY:Bezirksliga: Team A - Team B mit sehr langem Zusatz',
      ' der über mehrere Zeilen gefaltet ist',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const events = parseIcs(ics);
    expect(events[0].summary).toContain('gefal');
  });

  it('Extraktion: Liga, Teams, Wettbewerb, Pokalrunde, Halle', () => {
    const events = parseIcs(readFileSync(samplePath, 'utf8'));
    const drafts = events.map((e) => extractDraft(e, pack, 'sr1', 'nuliga'));

    const bez = drafts[0];
    expect(bez.leagueKey).toBe('bezirksliga');
    expect(bez.homeTeam).toBe('SG Blieskastel');
    expect(bez.awayTeam).toBe('TV Kirkel');
    expect(bez.competitionType).toBe('championship');
    expect(bez.hall).toBe('Sporthalle Kirkel');

    const cup = drafts[2];
    expect(cup.competitionType).toBe('cup');
    expect(cup.cupRound).toBe('r2_3');

    const friendly = drafts[3];
    expect(friendly.competitionType).toBe('friendly');
  });

  it('Diff: Verlegung, Absage, Neues Spiel erkennen', () => {
    const base = parseIcs(readFileSync(samplePath, 'utf8'));
    const update = parseIcs(readFileSync(updatePath, 'utf8'));
    const baseDrafts = base.map((e) => extractDraft(e, pack, 'sr1', 'nuliga'));

    const existingMap = new Map(
      baseDrafts.map((d) => [
        d.sourceUid,
        {
          id: 1,
          source: 'nuliga',
          source_uid: d.sourceUid,
          sequence: d.sequence,
          game_datetime: d.gameDatetime,
          home_team: d.homeTeam,
          away_team: d.awayTeam,
          league: d.league,
          league_key: d.leagueKey,
          competition_type: d.competitionType,
          cup_round: d.cupRound,
          hall: d.hall,
          status: d.status,
        },
      ])
    );

    const verlegt = update[0];
    const draftVerlegt = extractDraft(verlegt, pack, 'sr1', 'nuliga');
    const changesVerlegt = diffDraft(draftVerlegt, existingMap.get(draftVerlegt.sourceUid) ?? null);
    expect(changesVerlegt.includes('Termin')).toBe(true);
    expect(changesVerlegt.includes('Halle')).toBe(true);

    const abgesagt = update[1];
    const draftAbgesagt = extractDraft(abgesagt, pack, 'sr1', 'nuliga');
    expect(draftAbgesagt.status).toBe('abgesagt');
    const changesAbgesagt = diffDraft(draftAbgesagt, existingMap.get(draftAbgesagt.sourceUid) ?? null);
    expect(changesAbgesagt.includes('Status: abgesagt')).toBe(true);

    const neu = update[2];
    const draftNeu = extractDraft(neu, pack, 'sr1', 'nuliga');
    expect(diffDraft(draftNeu, null)).toEqual([]);
  });
});
