/**
 * User-owned character routes.
 * GET  /api/characters      — list the caller's characters
 * POST /api/characters      — create a stub character (name only; full sheet in Phase 2)
 */

import { zValidator } from '@hono/zod-validator';
import { ulid } from '@ironyard/shared';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireAuth } from '../auth/middleware';
import { db } from '../db';
import { characters } from '../db/schema';
import type { AppEnv } from '../types';

export const characterRoutes = new Hono<AppEnv>();

characterRoutes.use('*', requireAuth);

characterRoutes.get('/', async (c) => {
  const caller = c.get('user');
  const conn = db(c.env.DB);

  const rows = await conn.select().from(characters).where(eq(characters.ownerId, caller.id)).all();

  return c.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      ownerId: r.ownerId,
      createdAt: r.createdAt,
    })),
  );
});

const CreateCharacterSchema = z.object({
  name: z.string().min(1).max(80),
});

characterRoutes.post('/', zValidator('json', CreateCharacterSchema), async (c) => {
  const caller = c.get('user');
  const { name } = c.req.valid('json');
  const conn = db(c.env.DB);
  const now = Date.now();
  const id = ulid();

  await conn.insert(characters).values({
    id,
    ownerId: caller.id,
    name,
    data: JSON.stringify({}),
    createdAt: now,
    updatedAt: now,
  });

  return c.json({ id, name, ownerId: caller.id, createdAt: now }, 201);
});
