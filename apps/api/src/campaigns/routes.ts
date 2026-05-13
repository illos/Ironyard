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
import { campaignMemberships, campaignSnapshots, campaigns } from '../db/schema';
import type { AppEnv } from '../types';
import { characterRoutes } from './characters';
import { directorRoutes } from './director';
import { templateRoutes } from './templates';

export const campaignRoutes = new Hono<AppEnv>();

campaignRoutes.use('*', requireAuth);

// D4: GET /api/campaigns — list campaigns the caller is a member of.
campaignRoutes.get('/', async (c) => {
  const user = c.get('user');
  const conn = db(c.env.DB);

  const rows = await conn
    .select({
      id: campaigns.id,
      name: campaigns.name,
      inviteCode: campaigns.inviteCode,
      ownerId: campaigns.ownerId,
      isDirector: campaignMemberships.isDirector,
    })
    .from(campaignMemberships)
    .innerJoin(campaigns, eq(campaignMemberships.campaignId, campaigns.id))
    .where(eq(campaignMemberships.userId, user.id))
    .all();

  return c.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      inviteCode: r.inviteCode,
      isOwner: r.ownerId === user.id,
      isDirector: r.isDirector === 1,
    })),
  );
});

// POST /api/campaigns — create a campaign; caller becomes owner and director.
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

  return c.json({ id, name, inviteCode, isOwner: true, isDirector: true });
});

// POST /api/campaigns/join — redeem an invite code; caller joins as player (is_director = 0).
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
    isOwner: campaign.ownerId === user.id,
    isDirector: (existing?.isDirector ?? 0) === 1,
  });
});

// D4: GET /api/campaigns/:id — metadata for a campaign the caller belongs to.
// Returns isOwner, isDirector, and activeDirectorId (from snapshot or owner fallback).
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

  // Derive activeDirectorId: read from the DO snapshot if it exists, fall back
  // to ownerId. Corrupt snapshot state must not 500 the metadata call.
  let activeDirectorId: string = campaign.ownerId;
  try {
    const snapshot = await conn
      .select()
      .from(campaignSnapshots)
      .where(eq(campaignSnapshots.campaignId, id))
      .get();
    if (snapshot) {
      const parsed = JSON.parse(snapshot.state) as { activeDirectorId?: string };
      if (typeof parsed.activeDirectorId === 'string') {
        activeDirectorId = parsed.activeDirectorId;
      }
    }
  } catch {
    // Corrupt snapshot JSON must not fail the metadata call; keep owner fallback.
  }

  return c.json({
    id: campaign.id,
    name: campaign.name,
    inviteCode: campaign.inviteCode,
    isOwner: campaign.ownerId === user.id,
    isDirector: membership.isDirector === 1,
    activeDirectorId,
  });
});

// DELETE /api/campaigns/:id — owner-only. Cascade is configured in the schema
// (campaign_memberships, campaign_characters, encounter_templates,
// campaign_snapshots, intents) so the single campaigns delete is enough.
campaignRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const conn = db(c.env.DB);

  const campaign = await conn
    .select({ ownerId: campaigns.ownerId })
    .from(campaigns)
    .where(eq(campaigns.id, id))
    .get();
  if (!campaign) return c.json({ error: 'not_found' }, 404);
  if (campaign.ownerId !== user.id) return c.json({ error: 'forbidden' }, 403);

  await conn.delete(campaigns).where(eq(campaigns.id, id));
  return c.json({ ok: true } as const);
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

// Mount sub-routers (D1, D2, D3)
campaignRoutes.route('/:id/members', directorRoutes);
campaignRoutes.route('/:id/templates', templateRoutes);
campaignRoutes.route('/:id/characters', characterRoutes);
