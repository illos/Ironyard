import { zValidator } from '@hono/zod-validator';
import { DevLoginRequestSchema, MagicLinkRequestSchema, ulid } from '@ironyard/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../db';
import { authSessions, authTokens, users } from '../db/schema';
import type { AppEnv } from '../types';
import { clearSessionCookie, readSessionCookie, writeSessionCookie } from './cookies';
import { sendMagicLinkEmail } from './email';
import { requireAuth } from './middleware';
import { MAGIC_LINK_TTL_MS, SESSION_TTL_MS, generateMagicLinkToken } from './tokens';

export const authRoutes = new Hono<AppEnv>();

// POST /api/auth/request — mint a single-use magic-link token and email it.
// Always responds 200 to prevent email enumeration.
authRoutes.post('/request', zValidator('json', MagicLinkRequestSchema), async (c) => {
  const { email } = c.req.valid('json');
  const conn = db(c.env.DB);
  const now = Date.now();

  let user = await conn.select().from(users).where(eq(users.email, email)).get();
  if (!user) {
    const newUser = {
      id: ulid(),
      email,
      displayName: email.split('@')[0] ?? email,
      createdAt: now,
      updatedAt: now,
    };
    await conn.insert(users).values(newUser);
    user = newUser;
  }

  const token = generateMagicLinkToken();
  await conn.insert(authTokens).values({
    token,
    userId: user.id,
    expiresAt: now + MAGIC_LINK_TTL_MS,
    consumedAt: null,
  });

  const base = c.env.MAGIC_LINK_BASE_URL ?? new URL(c.req.url).origin;
  const link = `${base}/api/auth/verify?token=${token}`;
  const result = await sendMagicLinkEmail({ to: email, link, env: c.env });

  // In dev (no Resend configured) we echo the link so the caller can follow it
  // without scraping the worker console.
  if (result.delivered === 'console') {
    return c.json({ ok: true, devLink: link });
  }
  return c.json({ ok: true });
});

// GET /api/auth/verify?token=... — exchange token for a session cookie.
authRoutes.get('/verify', async (c) => {
  const token = c.req.query('token');
  if (!token) return c.json({ error: 'missing token' }, 400);

  const conn = db(c.env.DB);
  const now = Date.now();

  const row = await conn
    .select()
    .from(authTokens)
    .where(and(eq(authTokens.token, token), isNull(authTokens.consumedAt)))
    .get();

  if (!row || row.expiresAt <= now) {
    return c.json({ error: 'invalid or expired token' }, 400);
  }

  await conn.update(authTokens).set({ consumedAt: now }).where(eq(authTokens.token, token));

  const sessionId = ulid();
  await conn.insert(authSessions).values({
    id: sessionId,
    userId: row.userId,
    expiresAt: now + SESSION_TTL_MS,
    userAgent: c.req.header('user-agent') ?? null,
    createdAt: now,
  });

  writeSessionCookie(c, sessionId);

  const target = c.env.WEB_BASE_URL ?? '/';
  return c.redirect(target);
});

// POST /api/auth/logout — clear the cookie and delete the auth session.
authRoutes.post('/logout', async (c) => {
  const sessionId = readSessionCookie(c);
  if (sessionId) {
    const conn = db(c.env.DB);
    await conn.delete(authSessions).where(eq(authSessions.id, sessionId));
  }
  clearSessionCookie(c);
  return c.json({ ok: true });
});

// GET /api/auth/me — current user. 401 if no/expired session.
authRoutes.get('/me', requireAuth, (c) => {
  return c.json({ user: c.get('user') });
});

// POST /api/auth/dev-login — skip the email loop entirely.
// Only available when IRONYARD_DEV_SKIP_AUTH=1.
authRoutes.post('/dev-login', zValidator('json', DevLoginRequestSchema), async (c) => {
  if (c.env.IRONYARD_DEV_SKIP_AUTH !== '1') {
    return c.json({ error: 'dev-login disabled' }, 403);
  }
  const { email, displayName } = c.req.valid('json');
  const conn = db(c.env.DB);
  const now = Date.now();

  let user = await conn.select().from(users).where(eq(users.email, email)).get();
  if (!user) {
    const newUser = {
      id: ulid(),
      email,
      displayName: displayName ?? email.split('@')[0] ?? email,
      createdAt: now,
      updatedAt: now,
    };
    await conn.insert(users).values(newUser);
    user = newUser;
  }

  const sessionId = ulid();
  await conn.insert(authSessions).values({
    id: sessionId,
    userId: user.id,
    expiresAt: now + SESSION_TTL_MS,
    userAgent: c.req.header('user-agent') ?? null,
    createdAt: now,
  });
  writeSessionCookie(c, sessionId);

  return c.json({
    user: { id: user.id, email: user.email, displayName: user.displayName },
  });
});
