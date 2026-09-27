import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { db } from '../db.ts';
import {
  flagContextFromRequest,
  parseDflagParam,
  allFlagsForContext,
  listFlagDetails,
  flagIsActiveForRequest,
} from '../modules/flags.ts';

async function requireAdmin(req: FastifyRequest): Promise<void> {
  const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.user.sub) as { is_admin: number } | undefined;
  if (!user || user.is_admin !== 1) {
    const err = new Error('Nur Administrator dÃ¼rfen Feature-Flags verwalten.') as Error & { statusCode?: number };
    err.statusCode = 403;
    throw err;
  }
}

const flagSchema = z.object({
  name: z
    .string()
    .trim()
    .regex(/^[a-z0-9_]+$/, 'Name: kleinbuchstaben, Zahlen, Unterstrich')
    .min(2),
  note: z.string().trim().max(300).optional(),
  everyone: z.boolean().optional(),
  percent: z.number().int().min(0).max(100).nullable().optional(),
  authenticated: z.boolean().optional(),
  superusers: z.boolean().optional(),
  users: z.array(z.string().email()).optional(),
  clubs: z.array(z.string().trim().min(2)).optional(),
});

export async function flagRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/flags/active', { preHandler: [app.auth] }, async (req) => {
    const ctx = flagContextFromRequest(req);
    const overrides = parseDflagParam(req.url);
    return { flags: allFlagsForContext(ctx, overrides) };
  });

  app.get('/api/flags/gate/:name', { preHandler: [app.auth] }, async (req, reply) => {
    const name = (req.params as { name: string }).name;
    if (!flagIsActiveForRequest(req, name)) {
      return reply.code(403).send({ error: `Feature â€ž${name}" ist fÃ¼r dich nicht aktiviert.` });
    }
    return { active: true };
  });

  app.get('/api/flags', { preHandler: [app.auth, requireAdmin] }, async () => {
    return { flags: listFlagDetails() };
  });

  app.post('/api/flags', { preHandler: [app.auth, requireAdmin] }, async (req, reply) => {
    const body = flagSchema.parse(req.body);
    const existing = db.prepare('SELECT id FROM feature_flags WHERE name = ?').get(body.name);
    if (existing) return reply.code(409).send({ error: 'Flag existiert bereits.' });
    db.prepare(
      'INSERT INTO feature_flags (name, note, everyone, percent, authenticated, superusers) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      body.name,
      body.note ?? '',
      body.everyone ? 1 : 0,
      body.percent ?? null,
      body.authenticated ? 1 : 0,
      body.superusers ? 1 : 0
    );
    const flagId = (db.prepare('SELECT id FROM feature_flags WHERE name = ?').get(body.name) as { id: number }).id;
    applyMembers(flagId, body.users ?? [], body.clubs ?? []);
    return reply.code(201).send({ flag: listFlagDetails().find((f) => f.id === flagId) });
  });

  app.patch('/api/flags/:id', { preHandler: [app.auth, requireAdmin] }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const flag = db.prepare('SELECT * FROM feature_flags WHERE id = ?').get(id);
    if (!flag) return reply.code(404).send({ error: 'Flag nicht gefunden' });
    const body = flagSchema.partial().parse(req.body);
    if (body.name && body.name !== (flag as { name: string }).name) {
      return reply.code(400).send({ error: 'Name ist nicht Ã¤nderbar.' });
    }
    db.prepare(
      'UPDATE feature_flags SET note = ?, everyone = ?, percent = ?, authenticated = ?, superusers = ?, updated_at = datetime(\'now\') WHERE id = ?'
    ).run(
      body.note ?? (flag as { note: string }).note,
      body.everyone != null ? (body.everyone ? 1 : 0) : (flag as { everyone: number }).everyone,
      body.percent !== undefined ? body.percent : (flag as { percent: number | null }).percent,
      body.authenticated != null ? (body.authenticated ? 1 : 0) : (flag as { authenticated: number }).authenticated,
      body.superusers != null ? (body.superusers ? 1 : 0) : (flag as { superusers: number }).superusers,
      id
    );
    if (body.users !== undefined || body.clubs !== undefined) {
      const current = listFlagDetails().find((f) => f.id === id);
      applyMembers(id, body.users ?? current?.users ?? [], body.clubs ?? current?.clubs ?? []);
    }
    return { flag: listFlagDetails().find((f) => f.id === id) };
  });

  app.delete('/api/flags/:id', { preHandler: [app.auth, requireAdmin] }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const r = db.prepare('DELETE FROM feature_flags WHERE id = ?').run(id);
    if (r.changes === 0) return reply.code(404).send({ error: 'Flag nicht gefunden' });
    return reply.code(204).send();
  });
}

function applyMembers(flagId: number, userEmails: string[], clubs: string[]): void {
  db.prepare('DELETE FROM feature_flag_users WHERE flag_id = ?').run(flagId);
  const insertUser = db.prepare('INSERT OR IGNORE INTO feature_flag_users (flag_id, user_id) VALUES (?, ?)');
  for (const email of userEmails) {
    const u = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (u) insertUser.run(flagId, (u as { id: number }).id);
  }
  db.prepare('DELETE FROM feature_flag_clubs WHERE flag_id = ?').run(flagId);
  const insertClub = db.prepare('INSERT OR IGNORE INTO feature_flag_clubs (flag_id, club) VALUES (?, ?)');
  for (const club of clubs) insertClub.run(flagId, club.trim());
}
