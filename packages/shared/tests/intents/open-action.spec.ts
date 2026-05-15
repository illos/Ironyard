import { describe, expect, it } from 'vitest';
import {
  ClaimOpenActionPayloadSchema,
  RaiseOpenActionPayloadSchema,
} from '../../src/intents/raise-open-action';

describe('RaiseOpenActionPayloadSchema', () => {
  it('accepts a well-formed payload', () => {
    expect(
      RaiseOpenActionPayloadSchema.safeParse({
        kind: 'title-doomed-opt-in',
        participantId: 'pc-1',
        expiresAtRound: 3,
        payload: {},
      }).success,
    ).toBe(true);
  });

  it('rejects an unknown kind', () => {
    expect(
      RaiseOpenActionPayloadSchema.safeParse({
        kind: 'unknown',
        participantId: 'pc-1',
        payload: {},
      }).success,
    ).toBe(false);
  });

  it('expiresAtRound defaults to null (persist until claimed/encounter end)', () => {
    const r = RaiseOpenActionPayloadSchema.parse({
      kind: 'title-doomed-opt-in',
      participantId: 'pc-1',
      payload: {},
    });
    expect(r.expiresAtRound).toBeNull();
  });
});

describe('ClaimOpenActionPayloadSchema', () => {
  it('accepts an id and optional choice', () => {
    expect(
      ClaimOpenActionPayloadSchema.safeParse({ openActionId: '01H', choice: 'a' }).success,
    ).toBe(true);
    expect(ClaimOpenActionPayloadSchema.safeParse({ openActionId: '01H' }).success).toBe(true);
  });

  it('rejects empty openActionId', () => {
    expect(ClaimOpenActionPayloadSchema.safeParse({ openActionId: '' }).success).toBe(false);
  });
});
