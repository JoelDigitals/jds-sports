import type { FastifyInstance } from 'fastify';
import { db } from '../db.ts';
import { getUser, calcForAssignment, type AssignmentRow } from '../modules/assignmentService.ts';
import { getActiveRulePack } from '../modules/rules.ts';
import { listReceipts } from '../modules/receiptService.ts';
import { flagIsActiveForRequest } from '../modules/flags.ts';

function berlinNowLocal(): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Berlin',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date()).replace(' ', 'T');
}

export async function reportRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/reports/dashboard', { preHandler: [app.auth] }, async (req) => {
    const user = getUser(req.user.sub)!;
    const pack = getActiveRulePack(user.association, user.season);
    const rows = db
      .prepare('SELECT * FROM assignments WHERE user_id = ? ORDER BY game_datetime')
      .all(req.user.sub) as unknown as AssignmentRow[];

    const byDay = new Map<string, AssignmentRow[]>();
    for (const r of rows) {
      const key = r.game_datetime.slice(0, 10);
      const list = byDay.get(key) ?? [];
      list.push(r);
      byDay.set(key, list);
    }

    const withCalc = rows.map((r) => ({
      row: r,
      calc: calcForAssignment(r, byDay.get(r.game_datetime.slice(0, 10)) ?? [r], pack),
    }));

    const seasonStartYear = Number(user.season.slice(0, 4));
    const inSeason = withCalc.filter(({ row }) => {
      const y = Number(row.game_datetime.slice(0, 4));
      const m = Number(row.game_datetime.slice(5, 7));
      const start = m >= 7 ? y : y - 1;
      return start === seasonStartYear;
    });

    const eligible = inSeason.filter(
      ({ row }) => row.status !== 'abgesagt' && row.status !== 'ausgefallen_nicht_angereist'
    );
    const spesenTotal = Math.round(inSeason.reduce((s, x) => s + x.calc.total, 0) * 100) / 100;
    const kmTotal = inSeason.reduce((s, x) => s + (x.calc.travelKmEffective ?? 0), 0);

    const receipts = listReceipts(req.user.sub);
    const openReceipts = receipts.filter((r) => r.payout_status === 'offen' || r.payout_status === 'nicht_ausgezahlt');
    const offenTotal = Math.round(openReceipts.reduce((s, r) => s + r.total, 0) * 100) / 100;

    const now = berlinNowLocal();
    const allNext = rows
      .filter(
        (r) =>
          r.game_datetime >= now &&
          ['angesetzt', 'bestätigt', 'verlegt'].includes(r.status)
      )
      .sort((a, b) => a.game_datetime.localeCompare(b.game_datetime));
    const next = allNext.slice(0, 10).map((r) => {
        const calc = withCalc.find((x) => x.row.id === r.id)!.calc;
        return {
          id: r.id,
          gameDatetime: r.game_datetime,
          homeTeam: r.home_team,
          awayTeam: r.away_team,
          league: r.league,
          hall: r.hall,
          status: r.status,
          role: r.role,
          expenseTotal: calc.total,
        };
      });

    const deadlinesByYear = new Map<number, { count: number; amount: number }>();
    for (const r of openReceipts) {
      const gameYear = Number(r.games[0]?.gameDatetime.slice(0, 4) ?? r.created_at.slice(0, 4));
      const agg = deadlinesByYear.get(gameYear) ?? { count: 0, amount: 0 };
      agg.count++;
      agg.amount = Math.round((agg.amount + r.total) * 100) / 100;
      deadlinesByYear.set(gameYear, agg);
    }
    const deadlines = [...deadlinesByYear.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([year, agg]) => ({
        year,
        deadline: `31.01.${year + 1}`,
        count: agg.count,
        amount: agg.amount,
      }));

    const nonPaymentOverdue = receipts
      .filter((r) => r.payout_status === 'nicht_ausgezahlt')
      .map((r) => {
        const created = new Date(`${r.created_at.replace(' ', 'T')}Z`);
        const days = Math.floor((Date.now() - created.getTime()) / 86400000);
        return { id: r.id, total: r.total, days, gameDate: r.games[0]?.gameDatetime.slice(0, 10) ?? '', limit: pack.deadlines.nonPaymentDays };
      })
      .filter((r) => r.days > r.limit);

    return {
      season: user.season,
      rulePackVersion: pack.version,
      totals: {
        games: eligible.length,
        geleitet: inSeason.filter(({ row }) => row.status === 'geleitet').length,
        spesenTotal,
        offenTotal,
        openCount: openReceipts.length,
        kmTotal: Math.round(kmTotal * 10) / 10,
      },
      next,
      nextTotal: allNext.length,
      deadlines,
      nonPaymentOverdue,
      nonPaymentEmail: pack.deadlines.nonPaymentEmail,
      recentReceipts: receipts.slice(0, 5).map((r) => ({
        id: r.id,
        total: r.total,
        payoutStatus: r.payout_status,
        createdAt: r.created_at,
        gameDate: r.games[0]?.gameDatetime.slice(0, 10) ?? '',
      })),
    };
  });

  app.get('/api/reports/summary', { preHandler: [app.auth] }, async (req) => {
    const user = getUser(req.user.sub)!;
    const pack = getActiveRulePack(user.association, user.season);
    const rows = db
      .prepare('SELECT a.*, e.total AS expense_total, e.breakdown FROM assignments a LEFT JOIN expense_calcs e ON e.assignment_id = a.id WHERE a.user_id = ? ORDER BY a.game_datetime')
      .all(req.user.sub) as unknown as (AssignmentRow & { expense_total: number | null; breakdown: string | null })[];
    const seasonStartYear = Number(user.season.slice(0, 4));
    const inSeason = rows.filter((r) => {
      const y = Number(r.game_datetime.slice(0, 4));
      const m = Number(r.game_datetime.slice(5, 7));
      return (m >= 7 ? y : y - 1) === seasonStartYear;
    });

    const byClass = new Map<string, { count: number; total: number }>();
    const byMonth = new Map<string, { count: number; total: number }>();
    for (const r of inSeason) {
      const cls = pack.classes.find((c) => c.key === r.league_key)?.name ?? r.league;
      const c1 = byClass.get(cls) ?? { count: 0, total: 0 };
      c1.count++;
      c1.total = Math.round((c1.total + (r.expense_total ?? 0)) * 100) / 100;
      byClass.set(cls, c1);
      const month = r.game_datetime.slice(0, 7);
      const c2 = byMonth.get(month) ?? { count: 0, total: 0 };
      c2.count++;
      c2.total = Math.round((c2.total + (r.expense_total ?? 0)) * 100) / 100;
      byMonth.set(month, c2);
    }

    return {
      season: user.season,
      byClass: [...byClass.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.total - a.total),
      byMonth: [...byMonth.entries()].map(([month, v]) => ({ month, ...v })).sort((a, b) => a.month.localeCompare(b.month)),
    };
  });

  app.get('/api/reports/export.csv', { preHandler: [app.auth] }, async (req, reply) => {
    if (!flagIsActiveForRequest(req, 'reports_csv_export')) {
      return reply.code(403).send({ error: 'CSV-Export ist für dich nicht freigeschaltet (Feature-Flag).' });
    }
    const user = getUser(req.user.sub)!;
    const pack = getActiveRulePack(user.association, user.season);
    const rows = db
      .prepare('SELECT a.*, e.total AS expense_total, e.breakdown FROM assignments a LEFT JOIN expense_calcs e ON e.assignment_id = a.id WHERE a.user_id = ? ORDER BY a.game_datetime')
      .all(req.user.sub) as unknown as (AssignmentRow & { expense_total: number | null; breakdown: string | null })[];
    const seasonStartYear = Number(user.season.slice(0, 4));
    const inSeason = rows.filter((r) => {
      const y = Number(r.game_datetime.slice(0, 4));
      const m = Number(r.game_datetime.slice(5, 7));
      return (m >= 7 ? y : y - 1) === seasonStartYear;
    });
    const receipts = listReceipts(req.user.sub);
    const receiptOf = (assignmentId: number) => receipts.find((r) => (JSON.parse(r.assignment_ids) as number[]).includes(assignmentId));

    const header = [
      'Datum', 'Uhrzeit', 'Wettbewerb', 'Spielklasse', 'Heim', 'Gast', 'Halle', 'Rolle', 'Status',
      'Entschädigung (EUR)', 'Wochentagszuschlag (EUR)', 'Doppelansetzung (EUR)', 'Fahrtkosten (EUR)',
      'Gesamt (EUR)', 'Quittung', 'Auszahlung', 'Regelwerk',
    ];
    const lines = [header.join(';')];
    const compLabel: Record<string, string> = {
      championship: 'Meisterschaft', cup: 'Pokal', friendly: 'Freundschaftsspiel', tournament: 'Turnier',
    };
    const roleLabel: Record<string, string> = { sr1: 'SR 1', sr2: 'SR 2', esr: 'Einzelschiedsrichter', zns: 'Z/S' };
    const payoutLabel: Record<string, string> = { offen: 'offen', erhalten: 'erhalten', nicht_ausgezahlt: 'nicht ausgezahlt' };

    for (const r of inSeason) {
      const items = r.breakdown ? (JSON.parse(r.breakdown) as { key: string; amount: number }[]) : [];
      const getAmt = (key: string) => items.find((i) => i.key === key)?.amount ?? 0;
      const rec = receiptOf(r.id);
      lines.push(
        [
          r.game_datetime.slice(0, 10),
          r.game_datetime.slice(11, 16),
          compLabel[r.competition_type] ?? r.competition_type,
          r.league,
          r.home_team,
          r.away_team,
          r.hall,
          roleLabel[r.role] ?? r.role,
          r.status,
          (getAmt('base')).toFixed(2).replace('.', ','),
          (getAmt('weekday')).toFixed(2).replace('.', ','),
          (getAmt('double')).toFixed(2).replace('.', ','),
          (getAmt('travel')).toFixed(2).replace('.', ','),
          (r.expense_total ?? 0).toFixed(2).replace('.', ','),
          rec ? `Nr. ${rec.id}` : '',
          rec ? payoutLabel[rec.payout_status] ?? rec.payout_status : '',
          pack.version,
        ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')
      );
    }

    const csv = '\uFEFF' + lines.join('\r\n');
    reply
      .type('text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="jds-sports-abrechnung-${user.season.replace('/', '-')}.csv"`)
      .send(csv);
  });
}
