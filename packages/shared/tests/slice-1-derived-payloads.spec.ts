import { describe, expect, it } from 'vitest';
import {
  ExecuteTriggerPayloadSchema,
  GrantExtraMainActionPayloadSchema,
  StaminaTransitionedPayloadSchema,
} from '../src/intents';

describe('GrantExtraMainActionPayloadSchema', () => {
  it('accepts a participantId-only payload', () => {
    const p = GrantExtraMainActionPayloadSchema.parse({ participantId: 'p1' });
    expect(p.participantId).toBe('p1');
  });
});

describe('ExecuteTriggerPayloadSchema', () => {
  it('accepts a full execution descriptor', () => {
    const p = ExecuteTriggerPayloadSchema.parse({
      participantId: 'p1',
      triggeredActionId: 'reactive-strike',
      triggerEvent: {
        kind: 'damage-applied',
        targetId: 'p2',
        attackerId: null,
        amount: 5,
        type: 'fire',
      },
    });
    expect(p.triggeredActionId).toBe('reactive-strike');
  });
});

describe('StaminaTransitionedPayloadSchema', () => {
  it('accepts a transition descriptor', () => {
    const p = StaminaTransitionedPayloadSchema.parse({
      participantId: 'p1',
      from: 'healthy',
      to: 'winded',
      cause: 'damage',
    });
    expect(p.cause).toBe('damage');
  });
});
