import { zValidator } from '@hono/zod-validator';
import {
  CreateSessionRequestSchema,
  JoinSessionRequestSchema,
  generateInviteCode,
  ulid,
} from '@ironyard/shared';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { requireAuth } from '../auth/middleware';
import { db } from '../db';
import { memberships, sessions } from '../db/schema';
import type { AppEnv } from '../types';

export const sessionRoutes = new Hono<AppEnv>();

sessionRoutes.use('*', requireAuth);

// POST /api/sessions — create a session; caller becomes director.
sessionRoutes.post('/', zValidator('json', CreateSessionRequestSchema), async (c) => {
  const user = c.get('user');
  const { name } = c.req.valid('json');
  const conn = db(c.env.DB);
  const now = Date.now();
  const id = ulid();
  const inviteCode = generateInviteCode();

  await conn.insert(sessions).values({
    id,
    name,
    directorId: user.id,
    inviteCode,
    createdAt: now,
    updatedAt: now,
  });
  await conn.insert(memberships).values({
    sessionId: id,
    userId: user.id,
    role: 'director',
    joinedAt: now,
  });

  return c.json({ id, name, inviteCode, role: 'director' as const });
});

// POST /api/sessions/join — redeem an invite code; caller joins as player.
sessionRoutes.post('/join', zValidator('json', JoinSessionRequestSchema), async (c) => {
  const user = c.get('user');
  const { inviteCode } = c.req.valid('json');
  const conn = db(c.env.DB);

  const session = await conn
    .select()
    .from(sessions)
    .where(eq(sessions.inviteCode, inviteCode))
    .get();
  if (!session) return c.json({ error: 'invalid invite code' }, 404);

  const existing = await conn
    .select()
    .from(memberships)
    .where(and(eq(memberships.sessionId, session.id), eq(memberships.userId, user.id)))
    .get();

  if (!existing) {
    await conn.insert(memberships).values({
      sessionId: session.id,
      userId: user.id,
      role: 'player',
      joinedAt: Date.now(),
    });
  }

  return c.json({
    id: session.id,
    name: session.name,
    inviteCode: session.inviteCode,
    role: (existing?.role ?? 'player') as 'director' | 'player',
  });
});

// GET /api/sessions/:id — metadata for a session the caller belongs to.
sessionRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const conn = db(c.env.DB);

  const membership = await conn
    .select()
    .from(memberships)
    .where(and(eq(memberships.sessionId, id), eq(memberships.userId, user.id)))
    .get();
  if (!membership) return c.json({ error: 'not a member' }, 403);

  const session = await conn.select().from(sessions).where(eq(sessions.id, id)).get();
  if (!session) return c.json({ error: 'not found' }, 404);

  return c.json({
    id: session.id,
    name: session.name,
    inviteCode: session.inviteCode,
    role: membership.role,
  });
});

// GET /api/sessions/:id/socket — WebSocket upgrade, forwarded to the DO.
sessionRoutes.get('/:id/socket', async (c) => {
  if (c.req.header('upgrade')?.toLowerCase() !== 'websocket') {
    return c.json({ error: 'expected websocket upgrade' }, 426);
  }

  const id = c.req.param('id');
  const user = c.get('user');
  const conn = db(c.env.DB);

  const membership = await conn
    .select()
    .from(memberships)
    .where(and(eq(memberships.sessionId, id), eq(memberships.userId, user.id)))
    .get();
  if (!membership) return c.json({ error: 'not a member' }, 403);

  const stubId = c.env.SESSION_DO.idFromName(id);
  const stub = c.env.SESSION_DO.get(stubId);

  const headers = new Headers(c.req.raw.headers);
  headers.set('x-user-id', user.id);
  headers.set('x-user-display-name', user.displayName);
  const upgradeReq = new Request(c.req.raw, { headers });

  return stub.fetch(upgradeReq) as unknown as Response;
});
