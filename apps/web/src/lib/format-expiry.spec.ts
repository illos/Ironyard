import { describe, it, expect } from 'vitest';
import { formatExpiry } from './format-expiry';
import type { OpenAction } from '@ironyard/shared';

function makeOA(overrides: Partial<OpenAction>): OpenAction {
  return {
    id: 'oa-1',
    kind: '__sentinel_2b_0__' as OpenAction['kind'],
    participantId: 'p1',
    raisedAtRound: 1,
    raisedByIntentId: 'i-1',
    expiresAtRound: null,
    payload: {},
    ...overrides,
  };
}

describe('formatExpiry', () => {
  it('returns "expires end of encounter" when expiresAtRound is null', () => {
    expect(formatExpiry(makeOA({ expiresAtRound: null }), 3)).toBe('expires end of encounter');
  });

  it('returns "expires end of turn" when expiresAtRound equals currentRound', () => {
    expect(formatExpiry(makeOA({ expiresAtRound: 3 }), 3)).toBe('expires end of turn');
  });

  it('returns "expires end of round" when expiresAtRound is currentRound + 1', () => {
    expect(formatExpiry(makeOA({ expiresAtRound: 4 }), 3)).toBe('expires end of round');
  });

  it('returns "expires round N" for further-future expiries', () => {
    expect(formatExpiry(makeOA({ expiresAtRound: 7 }), 3)).toBe('expires round 7');
  });
});
