import { describe, expect, it } from 'vitest';
import { MAGIC_LINK_TTL_MS, generateMagicLinkToken, isExpired } from '../src/auth/tokens';

describe('generateMagicLinkToken', () => {
  it('produces a 64-char lowercase hex string', () => {
    const t = generateMagicLinkToken();
    expect(t).toMatch(/^[0-9a-f]{64}$/);
  });

  it('emits distinct tokens on rapid calls', () => {
    const set = new Set(Array.from({ length: 100 }, () => generateMagicLinkToken()));
    expect(set.size).toBe(100);
  });
});

describe('isExpired', () => {
  it('returns false for a future timestamp', () => {
    expect(isExpired(Date.now() + 10_000)).toBe(false);
  });

  it('returns true for a past timestamp', () => {
    expect(isExpired(Date.now() - 10_000)).toBe(true);
  });

  it('treats the exact current ms as expired', () => {
    const now = 1_700_000_000_000;
    expect(isExpired(now, now)).toBe(true);
  });
});

describe('MAGIC_LINK_TTL_MS', () => {
  it('is 15 minutes', () => {
    expect(MAGIC_LINK_TTL_MS).toBe(15 * 60 * 1000);
  });
});
