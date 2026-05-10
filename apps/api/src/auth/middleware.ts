import { eq } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import { db } from '../db';
import { authSessions, users } from '../db/schema';
import type { AppEnv } from '../types';
import { clearSessionCookie, readSessionCookie } from './cookies';

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const sessionId = readSessionCookie(c);
  if (!sessionId) return c.json({ error: 'unauthorized' }, 401);

  const conn = db(c.env.DB);
  const session = await conn
    .select()
    .from(authSessions)
    .where(eq(authSessions.id, sessionId))
    .get();

  if (!session || session.expiresAt <= Date.now()) {
    clearSessionCookie(c);
    return c.json({ error: 'unauthorized' }, 401);
  }

  const user = await conn.select().from(users).where(eq(users.id, session.userId)).get();
  if (!user) {
    clearSessionCookie(c);
    return c.json({ error: 'unauthorized' }, 401);
  }

  c.set('user', {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
  });
  await next();
};
