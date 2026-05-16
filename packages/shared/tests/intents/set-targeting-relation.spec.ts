import { describe, it, expect } from 'vitest';
import { SetTargetingRelationPayloadSchema } from '../../src/intents/set-targeting-relation';

describe('SetTargetingRelationPayloadSchema', () => {
  it('accepts a valid add payload', () => {
    const p = SetTargetingRelationPayloadSchema.parse({
      sourceId: 'censor-1',
      relationKind: 'judged',
      targetId: 'goblin-a',
      present: true,
    });
    expect(p.relationKind).toBe('judged');
    expect(p.present).toBe(true);
  });
  it('accepts a valid remove payload', () => {
    const p = SetTargetingRelationPayloadSchema.parse({
      sourceId: 'censor-1',
      relationKind: 'marked',
      targetId: 'goblin-a',
      present: false,
    });
    expect(p.present).toBe(false);
  });
  it('rejects unknown relationKind', () => {
    expect(() =>
      SetTargetingRelationPayloadSchema.parse({
        sourceId: 'p1',
        relationKind: 'taunted',
        targetId: 'p2',
        present: true,
      }),
    ).toThrow();
  });
  it('rejects empty sourceId', () => {
    expect(() =>
      SetTargetingRelationPayloadSchema.parse({
        sourceId: '',
        relationKind: 'judged',
        targetId: 'p2',
        present: true,
      }),
    ).toThrow();
  });
  it('rejects missing present', () => {
    expect(() =>
      SetTargetingRelationPayloadSchema.parse({
        sourceId: 'p1',
        relationKind: 'judged',
        targetId: 'p2',
      }),
    ).toThrow();
  });
});
