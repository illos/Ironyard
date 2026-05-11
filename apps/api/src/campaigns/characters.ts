/**
 * Campaign-characters routes.
 * GET /api/campaigns/:id/characters?status=pending|approved — any member.
 */

import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { requireAuth } from '../auth/middleware';
import { db } from '../db';
import { campaignCharacters, campaignMemberships } from '../db/schema';
import type { AppEnv } from '../types';

export const characterRoutes = new Hono<AppEnv>();

characterRoutes.use('*', requireAuth);

// GET /api/campaigns/:id/characters?status=pending|approved
// Any member can read. Returns CampaignCharacter[] (matched by CampaignCharacterSchema).
characterRoutes.get('/', async (c) => {
  const campaignId = c.req.param('id');
  if (!campaignId) return c.json({ error: 'missing campaign id' }, 400);
  const caller = c.get('user');
  const statusFilter = c.req.query('status') as 'pending' | 'approved' | undefined;
  const conn = db(c.env.DB);

  // Auth: caller must be a member
  const membership = await conn
    .select()
    .from(campaignMemberships)
    .where(
      and(
        eq(campaignMemberships.campaignId, campaignId),
        eq(campaignMemberships.userId, caller.id),
      ),
    )
    .get();
  if (!membership) return c.json({ error: 'not a member' }, 403);

  const conditions = [eq(campaignCharacters.campaignId, campaignId)];
  if (statusFilter === 'pending' || statusFilter === 'approved') {
    conditions.push(eq(campaignCharacters.status, statusFilter));
  }

  const rows = await conn
    .select()
    .from(campaignCharacters)
    .where(and(...conditions))
    .all();

  return c.json(
    rows.map((r) => ({
      campaignId: r.campaignId,
      characterId: r.characterId,
      status: r.status,
      submittedAt: r.submittedAt,
      decidedAt: r.decidedAt ?? null,
      decidedBy: r.decidedBy ?? null,
    })),
  );
});
