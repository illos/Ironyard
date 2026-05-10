import { describe, expect, it } from 'vitest';
import { ulid } from '../src/ulid';

const CROCKFORD = /^[0-9A-HJKMNP-TV-Z]{26}$/;

describe('ulid', () => {
  it('produces a 26-char Crockford-Base32 string', () => {
    const id = ulid();
    expect(id).toHaveLength(26);
    expect(id).toMatch(CROCKFORD);
  });

  it('emits distinct ids on rapid calls', () => {
    const ids = new Set(Array.from({ length: 200 }, () => ulid()));
    expect(ids.size).toBe(200);
  });

  it('encodes a fixed timestamp deterministically in the prefix', () => {
    const a = ulid(1_700_000_000_000);
    const b = ulid(1_700_000_000_000);
    expect(a.slice(0, 10)).toBe(b.slice(0, 10));
    // Random suffix differs.
    expect(a.slice(10)).not.toBe(b.slice(10));
  });

  it('orders lexicographically with monotonic timestamps', () => {
    const earlier = ulid(1_700_000_000_000);
    const later = ulid(1_700_000_001_000);
    expect(earlier.slice(0, 10) < later.slice(0, 10)).toBe(true);
  });
});
