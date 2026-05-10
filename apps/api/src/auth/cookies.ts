import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { SESSION_TTL_MS } from './tokens';

export const SESSION_COOKIE = 'ironyard_session';

export function readSessionCookie(c: Context): string | undefined {
  return getCookie(c, SESSION_COOKIE);
}

export function writeSessionCookie(c: Context, sessionId: string): void {
  // Secure is off when the request is plain HTTP (i.e. local dev). The browser
  // rejects Secure cookies over http://localhost on some engines, so let the
  // request protocol decide.
  const url = new URL(c.req.url);
  const secure = url.protocol === 'https:';
  setCookie(c, SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure,
    sameSite: 'Lax',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}
