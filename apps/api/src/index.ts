import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import { config } from './config.ts';
import { bootstrapDb } from './db.ts';
import { authRoutes } from './routes/auth.ts';
import { userRoutes } from './routes/users.ts';
import { ruleRoutes } from './routes/rules.ts';
import { assignmentRoutes } from './routes/assignments.ts';
import { importRoutes } from './routes/importRoutes.ts';
import { receiptRoutes } from './routes/receipts.ts';
import { reportRoutes } from './routes/reports.ts';
import { flagRoutes } from './routes/flags.ts';
import { ReceiptError } from './modules/receiptService.ts';
import { seedFlags } from './modules/flags.ts';
import './jwtTypes.ts';

declare module 'fastify' {
  interface FastifyInstance {
    auth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

async function main(): Promise<void> {
  await bootstrapDb();

  const app: FastifyInstance = Fastify({ logger: true, bodyLimit: 10 * 1024 * 1024 });

  await app.register(cors, { origin: config.webOrigin, methods: ['GET', 'POST', 'PATCH', 'DELETE'] });
  await app.register(jwt, { secret: config.jwtSecret });
  await app.register(multipart, {
    attachFieldsToBody: 'keyValues',
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  });

  app.decorate('auth', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      reply.code(401).send({ error: 'Nicht angemeldet oder Sitzung abgelaufen.' });
    }
  });

  app.setErrorHandler((err: Error & { statusCode?: number; code?: string }, req, reply) => {
    if (err instanceof ReceiptError) {
      return reply.code(err.statusCode ?? 400).send({ error: err.message });
    }
    if (err.name === 'ZodError') {
      return reply.code(400).send({ error: 'Ungültige Eingabe', details: JSON.parse(err.message) });
    }
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return reply.code(409).send({ error: 'Doppelter Eintrag (bereits vorhanden).' });
    }
    if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
      return reply.code(err.statusCode).send({ error: err.message });
    }
    req.log.error(err);
    return reply.code(500).send({ error: 'Interner Serverfehler' });
  });

  app.get('/api/health', async () => ({ status: 'ok', app: 'jds-sports-api' }));

  await app.register(authRoutes);
  await app.register(userRoutes);
  await app.register(ruleRoutes);
  await app.register(assignmentRoutes);
  await app.register(importRoutes);
  await app.register(receiptRoutes);
  await app.register(reportRoutes);
  await app.register(flagRoutes);

  await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info(`JDS Sports API läuft auf http://localhost:${config.port}`);
  app.log.info('Demo-Zugang: demo@jds-sports.de / demo1234');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
