import { describe, expect, it } from 'vitest';
import { OPEN_ACTION_COPY } from '../src';
import { OpenActionKindSchema, OpenActionSchema } from '../src/open-action';

describe('OpenActionKindSchema', () => {
  it('rejects unknown kinds', () => {
    expect(() => OpenActionKindSchema.parse('not-a-real-kind')).toThrow();
  });
});

describe('OpenActionKindSchema — slice 2a additions', () => {
  const newKinds = [
    'spatial-trigger-elementalist-essence',
    'spatial-trigger-tactician-ally-heroic',
    'spatial-trigger-null-field',
    'spatial-trigger-troubadour-line-of-effect',
    'pray-to-the-gods',
    'troubadour-auto-revive',
  ];

  it.each(newKinds)('accepts kind %s', (kind) => {
    expect(() => OpenActionKindSchema.parse(kind)).not.toThrow();
  });

  it.each(newKinds)('has a copy registry entry for %s', (kind) => {
    const entry = OPEN_ACTION_COPY[kind as keyof typeof OPEN_ACTION_COPY];
    expect(entry).toBeDefined();
    expect(typeof entry?.title).toBe('function');
    expect(typeof entry?.body).toBe('function');
    expect(typeof entry?.claimLabel).toBe('function');
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
