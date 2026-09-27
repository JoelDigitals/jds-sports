import type { FastifyInstance } from 'fastify';
import { getUser } from '../modules/assignmentService.ts';
import { getActiveRulePack } from '../modules/rules.ts';

export async function ruleRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/rules/active', { preHandler: [app.auth] }, async (req) => {
    const user = getUser(req.user.sub);
    if (!user) throw new Error('Benutzer nicht gefunden');
    const pack = getActiveRulePack(user.association, user.season);
    return { rulePack: pack };
  });
}
