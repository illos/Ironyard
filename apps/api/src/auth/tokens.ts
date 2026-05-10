// 32-byte random token, hex-encoded → 64 chars. crypto.getRandomValues works
// in Workers, Node 19+, and the browser.

const TOKEN_BYTES = 32;
export const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function generateMagicLinkToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  let result = '';
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i] ?? 0;
    result += byte.toString(16).padStart(2, '0');
  }
  return result;
}

export function isExpired(expiresAt: number, now: number = Date.now()): boolean {
  return expiresAt <= now;
}
