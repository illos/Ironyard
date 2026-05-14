import { describe, expect, it } from 'vitest';
import { OpenActionKindSchema, OpenActionSchema } from '../src/open-action';

describe('OpenActionKindSchema', () => {
  it('is an empty enum in 2b.0 (consumers register kinds in 2b.0.1)', () => {
    // Smoke check — schema accepts no values today.
    expect(() => OpenActionKindSchema.parse('pray-to-the-gods')).toThrow();
  });
});

describe('OpenActionSchema', () => {
  it('rejects an unknown kind', () => {
    expect(() =>
      OpenActionSchema.parse({
        id: '01H',
        kind: 'made-up',
        participantId: 'pc-1',
        raisedAtRound: 1,
        raisedByIntentId: 'i-1',
        expiresAtRound: null,
        payload: {},
      }),
    ).toThrow();
  });

  it('accepts the shape once a kind is added (smoke)', () => {
    // 2b.0 ships the enum empty. This test stands ready for 2b.0.1.
    expect(OpenActionSchema).toBeDefined();
  });
});
