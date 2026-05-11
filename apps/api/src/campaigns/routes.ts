import { zValidator } from '@hono/zod-validator';
import {
  CreateCampaignRequestSchema,
  JoinCampaignRequestSchema,
  generateInviteCode,
  ulid,
} from '@ironyard/shared';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { requireAuth } from '../auth/middleware';
import { db } from '../db';
import { campaignMemberships, campaigns } from '../db/schema';
import type { AppEnv } from '../types';

export const campaignRoutes = new Hono<AppEnv>();

campaignRoutes.use('*', requireAuth);

// POST /api/campaigns — create a campaign; caller becomes director.
campaignRoutes.post('/', zValidator('json', CreateCampaignRequestSchema), async (c) => {
  const user = c.get('user');
  const { name } = c.req.valid('json');
  const conn = db(c.env.DB);
  const now = Date.now();
  const id = ulid();
  const inviteCode = generateInviteCode();

  await conn.insert(campaigns).values({
    id,
    name,
    ownerId: user.id,
    inviteCode,
    createdAt: now,
    updatedAt: now,
  });
  await conn.insert(campaignMemberships).values({
    campaignId: id,
    userId: user.id,
    isDirector: 1,
    joinedAt: now,
  });

  return c.json({ id, name, inviteCode, isDirector: true });
});

// POST /api/campaigns/join — redeem an invite code; caller joins as player.
campaignRoutes.post('/join', zValidator('json', JoinCampaignRequestSchema), async (c) => {
  const user = c.get('user');
  const { inviteCode } = c.req.valid('json');
  const conn = db(c.env.DB);

  const campaign = await conn
    .select()
    .from(campaigns)
    .where(eq(campaigns.inviteCode, inviteCode))
    .get();
  if (!campaign) return c.json({ error: 'invalid invite code' }, 404);

  const existing = await conn
    .select()
    .from(campaignMemberships)
    .where(
      and(eq(campaignMemberships.campaignId, campaign.id), eq(campaignMemberships.userId, user.id)),
    )
    .get();

  if (!existing) {
    await conn.insert(campaignMemberships).values({
      campaignId: campaign.id,
      userId: user.id,
      isDirector: 0,
      joinedAt: Date.now(),
    });
  }

  return c.json({
    id: campaign.id,
    name: campaign.name,
    inviteCode: campaign.inviteCode,
    isDirector: (existing?.isDirector ?? 0) === 1,
  });
});

// GET /api/campaigns/:id — metadata for a campaign the caller belongs to.
campaignRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const conn = db(c.env.DB);

  const membership = await conn
    .select()
    .from(campaignMemberships)
    .where(and(eq(campaignMemberships.campaignId, id), eq(campaignMemberships.userId, user.id)))
    .get();
  if (!membership) return c.json({ error: 'not a member' }, 403);

  const campaign = await conn.select().from(campaigns).where(eq(campaigns.id, id)).get();
  if (!campaign) return c.json({ error: 'not found' }, 404);

  return c.json({
    id: campaign.id,
    name: campaign.name,
    inviteCode: campaign.inviteCode,
    isDirector: membership.isDirector === 1,
  });
});

// GET /api/campaigns/:id/socket — WebSocket upgrade, forwarded to the DO.
campaignRoutes.get('/:id/socket', async (c) => {
  if (c.req.header('upgrade')?.toLowerCase() !== 'websocket') {
    return c.json({ error: 'expected websocket upgrade' }, 426);
  }

  const id = c.req.param('id');
  const user = c.get('user');
  const conn = db(c.env.DB);

  const membership = await conn
    .select()
    .from(campaignMemberships)
    .where(and(eq(campaignMemberships.campaignId, id), eq(campaignMemberships.userId, user.id)))
    .get();
  if (!membership) return c.json({ error: 'not a member' }, 403);

  const stubId = c.env.LOBBY_DO.idFromName(id);
  const stub = c.env.LOBBY_DO.get(stubId);

  const headers = new Headers(c.req.raw.headers);
  headers.set('x-user-id', user.id);
  headers.set('x-user-display-name', user.displayName);
  headers.set('x-campaign-id', id);
  const upgradeReq = new Request(c.req.raw, { headers });

  return stub.fetch(upgradeReq) as unknown as Response;
});
