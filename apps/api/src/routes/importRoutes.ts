import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.ts';
import { parseIcs } from '../modules/icsParser.ts';
import { extractDraft, diffDraft, type AssignmentDraft, type ImportReportItem, type ExistingAssignment, type ImportSource } from '../modules/icsImport.ts';
import { parseCsv, extractH360Drafts } from '../modules/csvParser.ts';
import { getActiveRulePack } from '../modules/rules.ts';
import type { AssignmentRole } from '../modules/expense.ts';
import { getUser, recalcUser } from '../modules/assignmentService.ts';
import { autoFillMissingKm } from '../modules/travelService.ts';
import { flagIsActiveForRequest } from '../modules/flags.ts';

const draftSchema = z.object({
  sourceUid: z.string().min(1),
  sequence: z.number().int().min(0).default(0),
  lastModified: z.string().nullable().optional(),
  gameDatetime: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  homeTeam: z.string().trim().min(1),
  awayTeam: z.string().trim().default(''),
  league: z.string().trim().min(1),
  leagueKey: z.string().nullable(),
  competitionType: z.enum(['championship', 'cup', 'friendly', 'tournament']),
  cupRound: z.enum(['quali', 'r1', 'r2_3', 'halbfinalturnier', 'final4']).nullable(),
  tournamentGroup: z.enum(['turnier', 'vorbereitungsturnier', 'pokalturnier_jugend']).nullable(),
  tournamentTier: z.string().nullable(),
  gamesCount: z.number().int().min(1).max(30).default(1),
  hall: z.string().trim().default(''),
  hallAddress: z.string().trim().default(''),
  role: z.enum(['sr1', 'sr2', 'esr', 'zns']),
  status: z.enum(['angesetzt', 'bestätigt', 'verlegt', 'abgesagt', 'ausgefallen_angereist', 'ausgefallen_nicht_angereist', 'geleitet']),
  notes: z.string().default(''),
});

const applySchema = z.object({
  source: z.enum(['nuliga', 'handballnet', 'handball360', 'file', 'manual']).default('nuliga'),
  items: z.array(draftSchema).min(1),
});

function findExisting(userId: number, source: string, uid: string): ExistingAssignment | undefined {
  return db
    .prepare('SELECT id, source, source_uid, sequence, game_datetime, home_team, away_team, league, league_key, competition_type, cup_round, hall, status FROM assignments WHERE user_id = ? AND source = ? AND source_uid = ?')
    .get(userId, source, uid) as unknown as ExistingAssignment | undefined;
}

async function fetchWebcal(url: string): Promise<string> {
  const httpUrl = url.replace(/^webcal:\/\//i, 'https://');
  const res = await fetch(httpUrl, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Kalender-URL nicht abrufbar (HTTP ${res.status})`);
  return res.text();
}

export async function importRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/import/analyze', { preHandler: [app.auth] }, async (req, reply) => {
    let icsText = '';
    let source = 'nuliga';

    if (req.isMultipart()) {
      const body = req.body as Record<string, unknown>;
      const rawFile: unknown = body.file;
      if (rawFile == null) return reply.code(400).send({ error: 'Keine Datei im Feld "file" übergeben' });
      let buf: Buffer | null = null;
      if (Buffer.isBuffer(rawFile)) {
        buf = rawFile;
      } else if (rawFile instanceof Uint8Array) {
        buf = Buffer.from(rawFile);
      } else if (typeof rawFile === 'string') {
        buf = Buffer.from(rawFile, 'utf8');
      } else if (typeof rawFile === 'object' && typeof (rawFile as { toBuffer?: unknown }).toBuffer === 'function') {
        buf = await (rawFile as { toBuffer: () => Promise<Buffer> }).toBuffer();
      } else if (typeof rawFile === 'object' && (rawFile as { value?: unknown }).value != null) {
        const v = (rawFile as { value: unknown }).value;
        if (Buffer.isBuffer(v)) buf = v;
        else if (typeof v === 'string') buf = Buffer.from(v, 'utf8');
      }
      if (!buf || buf.length === 0) {
        return reply.code(400).send({ error: 'Datei konnte nicht gelesen werden oder ist leer' });
      }
      icsText = buf.toString('utf8');
      const sourceField = body.source as { value?: string } | string | undefined;
      if (typeof sourceField === 'string') source = sourceField;
      else if (sourceField && typeof sourceField.value === 'string') source = sourceField.value;
    } else {
      const body = z
        .object({ text: z.string().optional(), webcalUrl: z.string().url().optional(), source: z.string().optional() })
        .parse(req.body ?? {});
      if (body.source && ['nuliga', 'handballnet', 'file'].includes(body.source)) source = body.source;
      if (body.webcalUrl) {
        if (!flagIsActiveForRequest(req, 'import_webcal')) {
          return reply.code(403).send({ error: 'Kalender-Abonnement (Webcal) ist aktuell nicht freigeschaltet – bitte ICS-Datei verwenden.' });
        }
        icsText = await fetchWebcal(body.webcalUrl);
        if (source === 'nuliga') source = 'handballnet';
      } else if (body.text) {
        icsText = body.text;
      } else {
        return reply.code(400).send({ error: 'Weder Datei, Text noch Kalender-URL übergeben' });
      }
    }

    const trimmed = icsText.replace(/^\uFEFF/, '').trimStart();
    let drafts: AssignmentDraft[];
    let skippedRows = 0;

    if (/^BEGIN:VCALENDAR/i.test(trimmed)) {
      const events = parseIcs(trimmed);
      if (events.length === 0) {
        return reply.code(422).send({ error: 'Keine Termine (VEVENT) in der ICS-Datei gefunden. Handelt es sich um einen iCal-Export?' });
      }
      const user = getUser(req.user.sub)!;
      const pack = getActiveRulePack(user.association, user.season);
      drafts = events.map((event) => extractDraft(event, pack, user.default_role as AssignmentRole, source as ImportSource));
    } else if (trimmed.includes('Spielnummer') && trimmed.includes('Datum und Uhrzeit')) {
      source = 'handball360';
      const rows = parseCsv(trimmed);
      if (rows.length === 0) {
        return reply.code(422).send({ error: 'CSV-Datei enthält keine Datenzeilen (Handball360-Schiedsrichterplattform).' });
      }
      const user = getUser(req.user.sub)!;
      const pack = getActiveRulePack(user.association, user.season);
      const result = extractH360Drafts(rows, pack, user.default_role as AssignmentRole);
      drafts = result.drafts;
      skippedRows = result.skipped;
      if (drafts.length === 0) {
        return reply.code(422).send({ error: 'Keine gültigen Ansetzungen in der CSV-Datei gefunden (Spielnummer/Datum fehlen?).' });
      }
    } else {
      return reply.code(422).send({
        error: 'Unbekanntes Dateiformat. Erwartet: iCal-Export (.ics) oder CSV-Export der Handball360-Schiedsrichterplattform.',
      });
    }

    const items: ImportReportItem[] = [];

    for (const draft of drafts) {
      const existing = findExisting(req.user.sub, source, draft.sourceUid);
      const changes = diffDraft(draft, existing ?? null);
      const action: ImportReportItem['action'] = !existing ? 'new' : changes.length > 0 ? 'changed' : 'unchanged';
      items.push({
        action,
        draft,
        changes,
        existing: existing
          ? {
              id: existing.id,
              gameDatetime: existing.game_datetime,
              homeTeam: existing.home_team,
              awayTeam: existing.away_team,
              league: existing.league,
              hall: existing.hall,
              status: existing.status,
            }
          : null,
      });
    }

    return {
      source,
      total: items.length,
      new: items.filter((i) => i.action === 'new').length,
      changed: items.filter((i) => i.action === 'changed').length,
      unchanged: items.filter((i) => i.action === 'unchanged').length,
      skipped: skippedRows,
      items,
    };
  });

  app.post('/api/import/apply', { preHandler: [app.auth] }, async (req) => {
    const body = applySchema.parse(req.body);
    let created = 0;
    let updated = 0;

    for (const item of body.items) {
      const existing = findExisting(req.user.sub, body.source, item.sourceUid);
      if (existing) {
        const userMaintained = ['geleitet', 'ausgefallen_angereist', 'ausgefallen_nicht_angereist'];
        const nextStatus = userMaintained.includes(existing.status)
          ? existing.status
          : item.status === 'abgesagt'
            ? 'abgesagt'
            : existing.game_datetime !== item.gameDatetime
              ? 'verlegt'
              : existing.status;
        db.prepare(
          `UPDATE assignments SET sequence=?, last_modified=?, game_datetime=?, home_team=?, away_team=?, league=?, league_key=?, competition_type=?, cup_round=?, tournament_group=?, tournament_tier=?, games_count=?, hall=?, hall_address=?, role=?, status=?, notes=?, updated_at=datetime('now') WHERE id=?`
        ).run(
          item.sequence,
          item.lastModified ?? null,
          item.gameDatetime,
          item.homeTeam,
          item.awayTeam,
          item.league,
          item.leagueKey,
          item.competitionType,
          item.cupRound,
          item.tournamentGroup ?? null,
          item.tournamentTier,
          item.gamesCount,
          item.hall,
          item.hallAddress,
          item.role,
          nextStatus,
          item.notes,
          existing.id
        );
        updated++;
      } else {
        db.prepare(
          `INSERT INTO assignments (user_id, source, source_uid, sequence, last_modified, game_datetime, home_team, away_team, league, league_key, competition_type, cup_round, tournament_group, tournament_tier, games_count, hall, hall_address, role, status, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          req.user.sub,
          body.source,
          item.sourceUid,
          item.sequence,
          item.lastModified ?? null,
          item.gameDatetime,
          item.homeTeam,
          item.awayTeam,
          item.league,
          item.leagueKey,
          item.competitionType,
          item.cupRound,
          item.tournamentGroup ?? null,
          item.tournamentTier,
          item.gamesCount,
          item.hall,
          item.hallAddress,
          item.role,
          item.status,
          item.notes
        );
        created++;
      }
    }

    recalcUser(req.user.sub);
    // km für neue Einsätze im Hintergrund berechnen (Geocoding ist auf 1 Anfrage/s begrenzt)
    const userId = req.user.sub;
    void autoFillMissingKm(userId).catch((err) => req.log.warn({ err }, 'km-Berechnung nach Import fehlgeschlagen'));
    return { created, updated };
  });
}
