import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { requireAuth } from '../auth/middleware';
import { db } from '../db';
import { campaignMemberships, campaigns } from '../db/schema';
import type { AppEnv } from '../types';

export const directorRoutes = new Hono<AppEnv>();

directorRoutes.use('*', requireAuth);

/**
 * POST /api/campaigns/:id/members/:userId/director
 * Owner-only. Grants director permission to a campaign member. Idempotent.
 */
directorRoutes.post('/:userId/director', async (c) => {
  const campaignId = c.req.param('id');
  if (!campaignId) return c.json({ error: 'missing campaign id' }, 400);
  const targetUserId = c.req.param('userId');
  if (!targetUserId) return c.json({ error: 'missing user id' }, 400);
  const caller = c.get('user');
  const conn = db(c.env.DB);

  // Verify caller is owner
  const campaign = await conn.select().from(campaigns).where(eq(campaigns.id, campaignId)).get();
  if (!campaign) return c.json({ error: 'not found' }, 404);
  if (campaign.ownerId !== caller.id) return c.json({ error: 'forbidden: owner only' }, 403);

  // Verify target is a member
  const membership = await conn
    .select()
    .from(campaignMemberships)
    .where(
      and(
        eq(campaignMemberships.campaignId, campaignId),
        eq(campaignMemberships.userId, targetUserId),
      ),
    )
    .get();
  if (!membership) return c.json({ error: 'user is not a member' }, 404);

  // Idempotent: set is_director = 1 regardless of current value
  await conn
    .update(campaignMemberships)
    .set({ isDirector: 1 })
    .where(
      and(
        eq(campaignMemberships.campaignId, campaignId),
        eq(campaignMemberships.userId, targetUserId),
      ),
    );

  return c.json({ ok: true });
});

/**
 * DELETE /api/campaigns/:id/members/:userId/director
 * Owner-only. Revokes director permission from a campaign member.
 * Rejects with 400 if target is the campaign owner (owner always has director access).
 * After updating D1, pings the lobby DO at /revoke-director so any active WS
 * session for that user is notified. The DO handler lands in D6.
 */
directorRoutes.delete('/:userId/director', async (c) => {
  const campaignId = c.req.param('id');
  if (!campaignId) return c.json({ error: 'missing campaign id' }, 400);
  const targetUserId = c.req.param('userId');
  if (!targetUserId) return c.json({ error: 'missing user id' }, 400);
  const caller = c.get('user');
  const conn = db(c.env.DB);

  // Verify caller is owner
  const campaign = await conn.select().from(campaigns).where(eq(campaigns.id, campaignId)).get();
  if (!campaign) return c.json({ error: 'not found' }, 404);
  if (campaign.ownerId !== caller.id) return c.json({ error: 'forbidden: owner only' }, 403);

  // Cannot revoke director from the owner — owner always has director access
  if (targetUserId === campaign.ownerId) {
    return c.json({ error: 'cannot revoke director from the campaign owner' }, 400);
  }

  // Verify target is a member
  const membership = await conn
    .select()
    .from(campaignMemberships)
    .where(
      and(
        eq(campaignMemberships.campaignId, campaignId),
        eq(campaignMemberships.userId, targetUserId),
      ),
    )
    .get();
  if (!membership) return c.json({ error: 'user is not a member' }, 404);

  await conn
    .update(campaignMemberships)
    .set({ isDirector: 0 })
    .where(
      and(
        eq(campaignMemberships.campaignId, campaignId),
        eq(campaignMemberships.userId, targetUserId),
      ),
    );

  // Ping the lobby DO so it can handle any live WS session for the revoked user.
  // The DO handler for /revoke-director lands in D6; this fetch is fire-and-forget.
  try {
    const stubId = c.env.LOBBY_DO.idFromName(campaignId);
    const stub = c.env.LOBBY_DO.get(stubId);
    void stub.fetch(
      new Request('https://do-internal/revoke-director', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ revokedUserId: targetUserId }),
      }),
    );
  } catch {
    // Best-effort; D6 will wire the DO handler. Failure here must not block the response.
  }

  return c.json({ ok: true });
});
