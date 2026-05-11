/**
 * Encounter template CRUD routes.
 *
 * Director permission check: we use the simpler "caller has is_director = 1 in
 * campaign_memberships" rather than the full "active director" check (which
 * requires querying DO state). Templates are bench-time work, not in-combat
 * operations, so the HTTP-layer director check is appropriate here. If a
 * finer-grained active-director lock is ever needed, it can be added as a DO
 * query without breaking these routes.
 */

import { zValidator } from '@hono/zod-validator';
import { EncounterTemplateDataSchema, ulid } from '@ironyard/shared';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireAuth } from '../auth/middleware';
import { db } from '../db';
import { campaignMemberships, encounterTemplates } from '../db/schema';
import type { AppEnv } from '../types';

export const templateRoutes = new Hono<AppEnv>();

templateRoutes.use('*', requireAuth);

/** Resolves the membership row for the caller in the campaign, or null. */
async function getMembership(conn: ReturnType<typeof db>, campaignId: string, userId: string) {
  return conn
    .select()
    .from(campaignMemberships)
    .where(
      and(eq(campaignMemberships.campaignId, campaignId), eq(campaignMemberships.userId, userId)),
    )
    .get();
}

// GET /api/campaigns/:id/templates — any member can list.
templateRoutes.get('/', async (c) => {
  const campaignId = c.req.param('id');
  if (!campaignId) return c.json({ error: 'missing campaign id' }, 400);
  const caller = c.get('user');
  const conn = db(c.env.DB);

  const membership = await getMembership(conn, campaignId, caller.id);
  if (!membership) return c.json({ error: 'not a member' }, 403);

  const rows = await conn
    .select()
    .from(encounterTemplates)
    .where(eq(encounterTemplates.campaignId, campaignId))
    .all();

  return c.json(
    rows.map((r) => ({
      id: r.id,
      campaignId: r.campaignId,
      name: r.name,
      data: JSON.parse(r.data) as unknown,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
  );
});

const CreateTemplateSchema = z.object({
  name: z.string().min(1).max(120),
  data: EncounterTemplateDataSchema,
});

// POST /api/campaigns/:id/templates — director-permitted can create.
templateRoutes.post('/', zValidator('json', CreateTemplateSchema), async (c) => {
  const campaignId = c.req.param('id');
  if (!campaignId) return c.json({ error: 'missing campaign id' }, 400);
  const caller = c.get('user');
  const conn = db(c.env.DB);

  const membership = await getMembership(conn, campaignId, caller.id);
  if (!membership) return c.json({ error: 'not a member' }, 403);
  if (membership.isDirector !== 1) return c.json({ error: 'forbidden: director only' }, 403);

  const { name, data } = c.req.valid('json');
  const id = ulid();
  const now = Date.now();

  await conn.insert(encounterTemplates).values({
    id,
    campaignId,
    name,
    data: JSON.stringify(data),
    createdAt: now,
    updatedAt: now,
  });

  return c.json({ id, campaignId, name, data, createdAt: now, updatedAt: now }, 201);
});

const PatchTemplateSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    data: EncounterTemplateDataSchema.optional(),
  })
  .refine((v) => v.name !== undefined || v.data !== undefined, {
    message: 'at least one of name or data must be provided',
  });

// PATCH /api/campaigns/:id/templates/:tid — director-permitted can edit.
templateRoutes.patch('/:tid', zValidator('json', PatchTemplateSchema), async (c) => {
  const campaignId = c.req.param('id');
  if (!campaignId) return c.json({ error: 'missing campaign id' }, 400);
  const tid = c.req.param('tid');
  if (!tid) return c.json({ error: 'missing template id' }, 400);
  const caller = c.get('user');
  const conn = db(c.env.DB);

  const membership = await getMembership(conn, campaignId, caller.id);
  if (!membership) return c.json({ error: 'not a member' }, 403);
  if (membership.isDirector !== 1) return c.json({ error: 'forbidden: director only' }, 403);

  const template = await conn
    .select()
    .from(encounterTemplates)
    .where(and(eq(encounterTemplates.id, tid), eq(encounterTemplates.campaignId, campaignId)))
    .get();
  if (!template) return c.json({ error: 'not found' }, 404);

  const { name, data } = c.req.valid('json');
  const now = Date.now();
  const updates: Partial<typeof template> = { updatedAt: now };
  if (name !== undefined) updates.name = name;
  if (data !== undefined) updates.data = JSON.stringify(data);

  await conn
    .update(encounterTemplates)
    .set(updates)
    .where(and(eq(encounterTemplates.id, tid), eq(encounterTemplates.campaignId, campaignId)));

  return c.json({ ok: true });
});

// DELETE /api/campaigns/:id/templates/:tid — director-permitted can delete.
templateRoutes.delete('/:tid', async (c) => {
  const campaignId = c.req.param('id');
  if (!campaignId) return c.json({ error: 'missing campaign id' }, 400);
  const tid = c.req.param('tid');
  if (!tid) return c.json({ error: 'missing template id' }, 400);
  const caller = c.get('user');
  const conn = db(c.env.DB);

  const membership = await getMembership(conn, campaignId, caller.id);
  if (!membership) return c.json({ error: 'not a member' }, 403);
  if (membership.isDirector !== 1) return c.json({ error: 'forbidden: director only' }, 403);

  const template = await conn
    .select()
    .from(encounterTemplates)
    .where(and(eq(encounterTemplates.id, tid), eq(encounterTemplates.campaignId, campaignId)))
    .get();
  if (!template) return c.json({ error: 'not found' }, 404);

  await conn
    .delete(encounterTemplates)
    .where(and(eq(encounterTemplates.id, tid), eq(encounterTemplates.campaignId, campaignId)));

  return c.json({ ok: true });
});
