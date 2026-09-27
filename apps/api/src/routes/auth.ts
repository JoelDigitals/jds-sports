import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../db.ts';
import { SEASON_DEFAULT, ASSOCIATION_DEFAULT } from '../config.ts';
import '../jwtTypes.ts';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Passwort mindestens 8 Zeichen'),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  club: z.string().trim().optional().default(''),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export function publicUser(u: Record<string, unknown>) {
  const { password_hash, ...rest } = u as Record<string, unknown> & { password_hash?: string };
  return rest;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/auth/register', async (req, reply) => {
    const body = registerSchema.parse(req.body);
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(body.email.toLowerCase());
    if (existing) {
      return reply.code(409).send({ error: 'Diese E-Mail-Adresse ist bereits registriert.' });
    }
    const hash = bcrypt.hashSync(body.password, 10);
    const r = db
      .prepare(
        `INSERT INTO users (email, password_hash, first_name, last_name, club, association, season) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(body.email.toLowerCase(), hash, body.firstName, body.lastName, body.club, ASSOCIATION_DEFAULT, SEASON_DEFAULT);
    const id = Number(r.lastInsertRowid);
    const token = app.jwt.sign({ sub: id, email: body.email.toLowerCase() });
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    return reply.code(201).send({ token, user: publicUser(user as Record<string, unknown>) });
  });

  app.post('/api/auth/login', async (req, reply) => {
    const body = loginSchema.parse(req.body);
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(body.email.toLowerCase()) as
      | (Record<string, unknown> & { id: number; password_hash: string })
      | undefined;
    if (!user || !bcrypt.compareSync(body.password, user.password_hash)) {
      return reply.code(401).send({ error: 'E-Mail oder Passwort falsch.' });
    }
    const token = app.jwt.sign({ sub: user.id, email: body.email.toLowerCase() });
    return { token, user: publicUser(user) };
  });

  app.get('/api/auth/me', { preHandler: [app.auth] }, async (req) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.sub);
    return { user: publicUser(user as Record<string, unknown>) };
  });
}
