import { describe, expect, it } from 'vitest';
import { PendingTriggerSetSchema } from '../src/pending-triggers';
import { TriggerEventDescSchema } from '../src/trigger-event';

describe('TriggerEventDescSchema', () => {
  it('parses a damage-applied event', () => {
    const parsed = TriggerEventDescSchema.parse({
      kind: 'damage-applied',
      targetId: 'p1',
      attackerId: 'p2',
      amount: 8,
      type: 'fire',
    });
    expect(parsed.kind).toBe('damage-applied');
  });

  it('parses a stamina-transition event', () => {
    const parsed = TriggerEventDescSchema.parse({
      kind: 'stamina-transition',
      participantId: 'p1',
      from: 'healthy',
      to: 'winded',
    });
    expect(parsed.kind).toBe('stamina-transition');
  });

  it('rejects unknown kind', () => {
    expect(() =>
      TriggerEventDescSchema.parse({ kind: 'unknown' }),
    ).toThrow();
  });
});

describe('PendingTriggerSetSchema', () => {
  it('parses a populated set', () => {
    const parsed = PendingTriggerSetSchema.parse({
      id: '01ABC',
      triggerEvent: {
        kind: 'damage-applied',
        targetId: 'p1',
        attackerId: 'p2',
        amount: 8,
        type: 'fire',
      },
      candidates: [
        { participantId: 'p1', triggeredActionId: 'reactive-strike', side: 'heroes' },
        { participantId: 'p3', triggeredActionId: 'bloodfire-rush', side: 'foes' },
      ],
      order: null,
    });
    expect(parsed.candidates).toHaveLength(2);
  });
});
