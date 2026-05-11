/**
 * User-owned character routes.
 *
 * GET  /api/characters      — list the caller's characters
 * GET  /api/characters/:id  — single character (owner or campaign-member)
 * POST /api/characters      — create character; optional campaignCode join + auto-submit
 * PUT  /api/characters/:id  — owner-only update of name and/or data
 * DELETE /api/characters/:id — owner-only delete
 */

import {
  CharacterSchema,
  CompleteCharacterSchema,
  CreateCharacterRequestSchema,
  UpdateCharacterRequestSchema,
  ulid,
} from '@ironyard/shared';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { requireAuth } from '../auth/middleware';
import { db } from '../db';
import { campaignMemberships, campaigns, characters } from '../db/schema';
import type { AppEnv } from '../types';

export const characterRoutes = new Hono<AppEnv>();

characterRoutes.use('*', requireAuth);

// GET /api/characters — list characters owned by the caller.
characterRoutes.get('/', async (c) => {
  const caller = c.get('user');
  const conn = db(c.env.DB);

  const rows = await conn.select().from(characters).where(eq(characters.ownerId, caller.id)).all();

  return c.json(
    rows.map((row) => ({
      id: row.id,
      ownerId: row.ownerId,
      name: row.name,
      data: CharacterSchema.parse(JSON.parse(row.data)),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })),
  );
});

// GET /api/characters/:id — owner or campaign-member access.
characterRoutes.get('/:id', async (c) => {
  const caller = c.get('user');
  const id = c.req.param('id');
  const conn = db(c.env.DB);

  const row = await conn.select().from(characters).where(eq(characters.id, id)).get();
  if (!row) return c.json({ error: 'not_found' }, 404);

  // Owner gets through unconditionally.
  if (row.ownerId === caller.id) {
    return c.json({
      id: row.id,
      ownerId: row.ownerId,
      name: row.name,
      data: CharacterSchema.parse(JSON.parse(row.data)),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  // Otherwise: visible to campaign members if the character has a campaignId.
  const data = CharacterSchema.parse(JSON.parse(row.data));
  if (data.campaignId) {
    const membership = await conn
      .select()
      .from(campaignMemberships)
      .where(
        and(
          eq(campaignMemberships.campaignId, data.campaignId),
          eq(campaignMemberships.userId, caller.id),
        ),
      )
      .get();
    if (membership) {
      return c.json({
        id: row.id,
        ownerId: row.ownerId,
        name: row.name,
        data,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
    }
  }

  return c.json({ error: 'forbidden' }, 403);
});

// POST /api/characters — create a character.
// - If campaignCode present: resolve campaign, idempotent membership insert, set campaignId.
// - If campaignCode + complete data: auto-dispatch SubmitCharacter via LobbyDO.
characterRoutes.post('/', async (c) => {
  const caller = c.get('user');
  const body = await c.req.json();
  const parsed = CreateCharacterRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid_request', issues: parsed.error.issues }, 400);
  }
  const conn = db(c.env.DB);

  // Resolve campaign if campaignCode present.
  let campaignId: string | null = null;
  if (parsed.data.campaignCode) {
    const campaign = await conn
      .select()
      .from(campaigns)
      .where(eq(campaigns.inviteCode, parsed.data.campaignCode))
      .get();
    if (!campaign) return c.json({ error: 'campaign_not_found' }, 404);
    campaignId = campaign.id;

    // Idempotent membership insert.
    const existing = await conn
      .select()
      .from(campaignMemberships)
      .where(
        and(
          eq(campaignMemberships.campaignId, campaignId),
          eq(campaignMemberships.userId, caller.id),
        ),
      )
      .get();
    if (!existing) {
      await conn.insert(campaignMemberships).values({
        campaignId,
        userId: caller.id,
        isDirector: 0,
        joinedAt: Date.now(),
      });
    }
  }

  // Build the initial character blob.
  const initialData = parsed.data.data
    ? { ...parsed.data.data, campaignId }
    : CharacterSchema.parse({ campaignId });

  const id = ulid();
  const now = Date.now();
  await conn.insert(characters).values({
    id,
    ownerId: caller.id,
    name: parsed.data.name,
    data: JSON.stringify(initialData),
    createdAt: now,
    updatedAt: now,
  });

  // Auto-submit if conditions are met.
  let autoSubmitted = false;
  if (
    campaignId !== null &&
    parsed.data.campaignCode &&
    parsed.data.data &&
    CompleteCharacterSchema.safeParse(parsed.data.data).success
  ) {
    // Dispatch SubmitCharacter via the campaign's LobbyDO.
    // The DO's /server-dispatch endpoint accepts a server-originated intent
    // and routes it through the normal intent pipeline.
    const doId = c.env.LOBBY_DO.idFromName(campaignId);
    const stub = c.env.LOBBY_DO.get(doId);
    const dispatchResp = await stub.fetch(
      `https://internal/server-dispatch?campaignId=${encodeURIComponent(campaignId)}`,
      {
        method: 'POST',
        body: JSON.stringify({
          type: 'SubmitCharacter',
          actor: { userId: caller.id },
          source: 'server',
          payload: { characterId: id, campaignId },
        }),
      },
    );
    autoSubmitted = dispatchResp.ok;
  }

  return c.json({
    id,
    ownerId: caller.id,
    name: parsed.data.name,
    data: initialData,
    createdAt: now,
    updatedAt: now,
    autoSubmitted,
  });
});

// PUT /api/characters/:id — owner-only update.
characterRoutes.put('/:id', async (c) => {
  const caller = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = UpdateCharacterRequestSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);

  const conn = db(c.env.DB);
  const existing = await conn.select().from(characters).where(eq(characters.id, id)).get();
  if (!existing) return c.json({ error: 'not_found' }, 404);
  if (existing.ownerId !== caller.id) return c.json({ error: 'forbidden' }, 403);

  const newName = parsed.data.name ?? existing.name;
  const newData = parsed.data.data ? JSON.stringify(parsed.data.data) : existing.data;

  await conn
    .update(characters)
    .set({ name: newName, data: newData, updatedAt: Date.now() })
    .where(eq(characters.id, id));

  const updated = await conn.select().from(characters).where(eq(characters.id, id)).get();
  if (!updated) return c.json({ error: 'not_found' }, 404);

  return c.json({
    id: updated.id,
    ownerId: updated.ownerId,
    name: updated.name,
    data: CharacterSchema.parse(JSON.parse(updated.data)),
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  });
});

// DELETE /api/characters/:id — owner-only delete.
characterRoutes.delete('/:id', async (c) => {
  const caller = c.get('user');
  const id = c.req.param('id');
  const conn = db(c.env.DB);

  const row = await conn.select().from(characters).where(eq(characters.id, id)).get();
  if (!row) return c.json({ error: 'not_found' }, 404);
  if (row.ownerId !== caller.id) return c.json({ error: 'forbidden' }, 403);

  await conn.delete(characters).where(eq(characters.id, id));

  return c.json({ ok: true });
});
