import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  listAssignments,
  getAssignment,
  getExpense,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  recalcUser,
  getUser,
  type AssignmentRow,
} from '../modules/assignmentService.ts';
import { getActiveRulePack } from '../modules/rules.ts';
import { autoFillTravelKm, autoFillMissingKm } from '../modules/travelService.ts';
import { travelBetween, DistanceError } from '../modules/distance.ts';
import { db } from '../db.ts';

const assignmentSchema = z.object({
  gameDatetime: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  homeTeam: z.string().trim().min(1),
  awayTeam: z.string().trim().default(''),
  league: z.string().trim().min(1),
  leagueKey: z.string().nullable().optional(),
  competitionType: z.enum(['championship', 'cup', 'friendly', 'tournament']),
  cupRound: z.enum(['quali', 'r1', 'r2_3', 'halbfinalturnier', 'final4']).nullable().optional(),
  tournamentGroup: z.enum(['turnier', 'vorbereitungsturnier', 'pokalturnier_jugend']).nullable().optional(),
  tournamentTier: z.string().nullable().optional(),
  gamesCount: z.number().int().min(1).max(30).optional(),
  hall: z.string().trim().optional(),
  hallAddress: z.string().trim().optional(),
  role: z.enum(['sr1', 'sr2', 'esr', 'zns']),
  status: z.enum([
    'angesetzt',
    'bestätigt',
    'verlegt',
    'abgesagt',
    'ausgefallen_angereist',
    'ausgefallen_nicht_angereist',
    'geleitet',
  ]),
  notes: z.string().optional(),
  travelKm: z.number().min(0).max(2000).nullable().optional(),
  travelKmManual: z.boolean().optional(),
  travelMitfahrer: z.boolean().optional(),
  pnvCost: z.number().min(0).max(1000).nullable().optional(),
  otherCost: z.number().min(0).max(5000).nullable().optional(),
});

type SerializedAssignmentInput = AssignmentRow & { expense_total?: number | null };

function serialize(a: SerializedAssignmentInput, expenseTotal: number | null) {
  return {
    id: a.id,
    source: a.source,
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
    travelKm: a.travel_km,
    travelKmManual: a.travel_km_manual === 1,
    travelMitfahrer: a.travel_mitfahrer === 1,
    travelKmAuto: a.travel_km_auto === 1,
    travelMinutes: a.travel_minutes,
    pnvCost: a.pnv_cost,
    otherCost: a.other_cost,
    expenseTotal,
  };
}

export async function assignmentRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/assignments', { preHandler: [app.auth] }, async (req) => {
    const q = req.query as { status?: string; month?: string; season?: string };
    const rows = listAssignments(req.user.sub, q);
    return { assignments: rows.map((r) => serialize(r, r.expense_total)) };
  });

  app.post('/api/assignments', { preHandler: [app.auth] }, async (req, reply) => {
    const body = assignmentSchema.parse(req.body);
    const id = createAssignment(req.user.sub, {
      game_datetime: body.gameDatetime,
      home_team: body.homeTeam,
      away_team: body.awayTeam,
      league: body.league,
      league_key: body.leagueKey ?? null,
      competition_type: body.competitionType,
      cup_round: body.cupRound ?? null,
      tournament_group: body.tournamentGroup ?? null,
      tournament_tier: body.tournamentTier ?? null,
      games_count: body.gamesCount ?? 1,
      hall: body.hall ?? '',
      hall_address: body.hallAddress ?? '',
      role: body.role,
      status: body.status,
      notes: body.notes ?? '',
      travel_km: body.travelKm ?? null,
      travel_km_manual: body.travelKmManual ?? false,
      travel_mitfahrer: body.travelMitfahrer ?? false,
      pnv_cost: body.pnvCost ?? null,
      other_cost: body.otherCost ?? null,
    });
    recalcUser(req.user.sub);
    if (body.travelKm == null) await autoFillTravelKm(req.user.sub, id);
    const a = getAssignment(req.user.sub, id);
    return reply.code(201).send({ assignment: serialize(a!, getExpense(id)?.total ?? null) });
  });

  app.get('/api/assignments/:id', { preHandler: [app.auth] }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const a = getAssignment(req.user.sub, id);
    if (!a) return reply.code(404).send({ error: 'Einsatz nicht gefunden' });
    const expense = getExpense(id);
    const user = getUser(req.user.sub)!;
    const pack = getActiveRulePack(user.association, user.season);
    return { assignment: serialize(a, expense?.total ?? null), expense, rulePackVersion: pack.version };
  });

  app.patch('/api/assignments/:id', { preHandler: [app.auth] }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const body = assignmentSchema.partial().parse(req.body);
    const before = getAssignment(req.user.sub, id);
    const updated = updateAssignment(req.user.sub, id, {
      game_datetime: body.gameDatetime,
      home_team: body.homeTeam,
      away_team: body.awayTeam,
      league: body.league,
      league_key: body.leagueKey,
      competition_type: body.competitionType,
      cup_round: body.cupRound,
      tournament_group: body.tournamentGroup,
      tournament_tier: body.tournamentTier,
      games_count: body.gamesCount,
      hall: body.hall,
      hall_address: body.hallAddress,
      role: body.role,
      status: body.status,
      notes: body.notes,
      travel_km: body.travelKm,
      travel_km_manual: body.travelKmManual,
      travel_mitfahrer: body.travelMitfahrer,
      pnv_cost: body.pnvCost,
      other_cost: body.otherCost,
    });
    if (!updated || !before) return reply.code(404).send({ error: 'Einsatz nicht gefunden' });
    // Von Hand eingetragene km nicht mehr automatisch überschreiben
    if (body.travelKm !== undefined && body.travelKm !== before.travel_km) {
      db.prepare('UPDATE assignments SET travel_km_auto = 0 WHERE id = ?').run(id);
    }
    recalcUser(req.user.sub);
    const hallChanged = updated.hall !== before.hall || updated.hall_address !== before.hall_address;
    const kmAuto = body.travelKm === undefined || body.travelKm === before.travel_km ? before.travel_km_auto === 1 : false;
    if (updated.travel_km == null || (hallChanged && kmAuto)) await autoFillTravelKm(req.user.sub, id, { force: hallChanged && kmAuto });
    const expense = getExpense(id);
    return { assignment: serialize(getAssignment(req.user.sub, id)!, expense?.total ?? null), expense };
  });

  // km automatisch aus eigener Adresse und Hallenadresse berechnen (Hin + Rück)
  app.post('/api/assignments/:id/travel-km', { preHandler: [app.auth] }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const result = await autoFillTravelKm(req.user.sub, id, { force: true });
    if (result.error) return reply.code(422).send({ error: result.error, result });
    const expense = getExpense(id);
    return { result, assignment: serialize(getAssignment(req.user.sub, id)!, expense?.total ?? null), expense };
  });

  app.post('/api/assignments/travel-km/missing', { preHandler: [app.auth] }, async (req) => {
    const results = await autoFillMissingKm(req.user.sub);
    return { filled: results.filter((r) => r.km != null).length, failed: results.filter((r) => r.error) };
  });

  // Vorschau für noch nicht gespeicherte Einsätze
  app.post('/api/travel-km/preview', { preHandler: [app.auth] }, async (req, reply) => {
    const body = z.object({ to: z.string().trim().min(2) }).parse(req.body);
    const user = getUser(req.user.sub)!;
    const from = [user.street, `${user.zip} ${user.city}`.trim()].filter((x) => x.trim()).join(', ');
    if (!from) return reply.code(422).send({ error: 'Eigene Adresse fehlt (Einstellungen)' });
    try {
      const r = await travelBetween(from, body.to);
      return { km: r.kmRoundTrip, kmOneWay: r.kmOneWay, minutes: r.minutesOneWay, from, to: body.to };
    } catch (err) {
      const e = err as DistanceError;
      return reply.code(e.statusCode ?? 422).send({ error: e.message });
    }
  });

  app.delete('/api/assignments/:id', { preHandler: [app.auth] }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const ok = deleteAssignment(req.user.sub, id);
    if (!ok) return reply.code(404).send({ error: 'Einsatz nicht gefunden' });
    recalcUser(req.user.sub);
    return reply.code(204).send();
  });
}
