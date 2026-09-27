import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.ts';
import { recalcUser } from '../modules/assignmentService.ts';

const profileSchema = z.object({
  firstName: z.string().trim().min(1).optional(),
  lastName: z.string().trim().min(1).optional(),
  street: z.string().trim().optional(),
  zip: z.string().trim().optional(),
  city: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  iban: z.string().trim().optional(),
  club: z.string().trim().optional(),
  partnerName: z.string().trim().max(120).optional(),
  partnerAddress: z.string().trim().max(200).optional(),
  defaultRole: z.enum(['sr1', 'sr2', 'esr', 'zns']).optional(),
});

const COLUMN_MAP: Record<string, string> = {
  firstName: 'first_name',
  lastName: 'last_name',
  street: 'street',
  zip: 'zip',
  city: 'city',
  phone: 'phone',
  iban: 'iban',
  club: 'club',
  partnerName: 'partner_name',
  partnerAddress: 'partner_address',
  defaultRole: 'default_role',
};

export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.patch('/api/users/me', { preHandler: [app.auth] }, async (req) => {
    const body = profileSchema.parse(req.body);
    const sets: string[] = [];
    const params: (string | number)[] = [];
    for (const [key, value] of Object.entries(body)) {
      if (value === undefined) continue;
      sets.push(`${COLUMN_MAP[key]} = ?`);
      params.push(value as string);
    }
    if (sets.length > 0) {
      params.push(req.user.sub);
      db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...params);
      recalcUser(req.user.sub);
    }
    const user = db
      .prepare('SELECT id, email, first_name, last_name, street, zip, city, phone, iban, club, partner_name, partner_address, is_admin, default_role, association, season FROM users WHERE id = ?')
      .get(req.user.sub);
    return { user };
  });
}
