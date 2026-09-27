import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  listReceipts,
  createReceipt,
  getReceipt,
  readReceiptPdf,
  updatePayout,
  regeneratePdf,
  ReceiptError,
} from '../modules/receiptService.ts';

const createSchema = z.object({
  assignmentIds: z.array(z.number().int().positive()).min(1),
});

const payoutSchema = z.object({
  status: z.enum(['offen', 'erhalten', 'nicht_ausgezahlt']),
  payoutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  payer: z.string().trim().max(120).nullable().optional(),
});

function serialize(r: ReturnType<typeof listReceipts>[number]) {
  return {
    id: r.id,
    season: r.season,
    total: r.total,
    payoutStatus: r.payout_status,
    payoutDate: r.payout_date,
    payer: r.payer,
    createdAt: r.created_at,
    hasPdf: !!r.pdf_filename,
    games: r.games.map((g) => ({
      id: g.id,
      date: g.gameDatetime.slice(0, 10),
      homeTeam: g.homeTeam,
      awayTeam: g.awayTeam,
      league: g.league,
      status: g.status,
    })),
  };
}

export async function receiptRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/receipts', { preHandler: [app.auth] }, async (req, reply) => {
    const body = createSchema.parse(req.body);
    const { receipt } = await createReceipt(req.user.sub, body.assignmentIds);
    const rows = listReceipts(req.user.sub);
    const full = rows.find((r) => r.id === receipt.id)!;
    return reply.code(201).send({ receipt: serialize(full) });
  });

  app.get('/api/receipts', { preHandler: [app.auth] }, async (req) => {
    return { receipts: listReceipts(req.user.sub).map(serialize) };
  });

  app.get('/api/receipts/:id/pdf', { preHandler: [app.auth] }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const receipt = getReceipt(req.user.sub, id);
    if (!receipt) return reply.code(404).send({ error: 'Quittung nicht gefunden' });
    const buf = readReceiptPdf(receipt);
    reply
      .type('application/pdf')
      .header('Content-Disposition', `inline; filename="quittung-${id}.pdf"`)
      .send(buf);
  });

  app.post('/api/receipts/:id/payout', { preHandler: [app.auth] }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const body = payoutSchema.parse(req.body);
    const receipt = updatePayout(req.user.sub, id, body.status, body.payoutDate ?? null, body.payer ?? null);
    const rows = listReceipts(req.user.sub);
    return { receipt: serialize(rows.find((r) => r.id === receipt.id)!) };
  });

  app.post('/api/receipts/:id/regenerate', { preHandler: [app.auth] }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    await regeneratePdf(req.user.sub, id);
    const rows = listReceipts(req.user.sub);
    const r = rows.find((x) => x.id === id);
    if (!r) return reply.code(404).send({ error: 'Quittung nicht gefunden' });
    return { receipt: serialize(r) };
  });
}
