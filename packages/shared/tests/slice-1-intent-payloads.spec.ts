import { describe, expect, it } from 'vitest';
import {
  ApplyParticipantOverridePayloadSchema,
  BecomeDoomedPayloadSchema,
  ClearParticipantOverridePayloadSchema,
  KnockUnconsciousPayloadSchema,
  ResolveTriggerOrderPayloadSchema,
} from '../src/intents';

describe('BecomeDoomedPayloadSchema', () => {
  it('accepts a Hakaan-Doomsight dispatch', () => {
    const p = BecomeDoomedPayloadSchema.parse({
      participantId: 'p1',
      source: 'hakaan-doomsight',
    });
    expect(p.source).toBe('hakaan-doomsight');
  });

  it('rejects an unknown source', () => {
    expect(() =>
      BecomeDoomedPayloadSchema.parse({ participantId: 'p1', source: 'mystery' }),
    ).toThrow();
  });
});

describe('KnockUnconsciousPayloadSchema', () => {
  it('accepts null attackerId for environmental KO', () => {
    const p = KnockUnconsciousPayloadSchema.parse({ targetId: 'p1', attackerId: null });
    expect(p.attackerId).toBeNull();
  });
});

describe('ApplyParticipantOverridePayloadSchema', () => {
  it('accepts a director-applied doomed override', () => {
    const p = ApplyParticipantOverridePayloadSchema.parse({
      participantId: 'p1',
      override: {
        kind: 'doomed',
        source: 'manual',
        canRegainStamina: false,
        autoTier3OnPowerRolls: true,
        staminaDeathThreshold: 'staminaMax',
        dieAtEncounterEnd: true,
      },
    });
    expect(p.override.kind).toBe('doomed');
  });
});

describe('ClearParticipantOverridePayloadSchema', () => {
  it('accepts a participantId-only payload', () => {
    const p = ClearParticipantOverridePayloadSchema.parse({ participantId: 'p1' });
    expect(p.participantId).toBe('p1');
  });
});

describe('ResolveTriggerOrderPayloadSchema', () => {
  it('accepts an order array', () => {
    const p = ResolveTriggerOrderPayloadSchema.parse({
      pendingTriggerSetId: '01ABC',
      order: ['p1', 'p2'],
    });
    expect(p.order).toEqual(['p1', 'p2']);
  });

  it('rejects an empty order array', () => {
    expect(() =>
      ResolveTriggerOrderPayloadSchema.parse({ pendingTriggerSetId: '01ABC', order: [] }),
    ).toThrow();
  });
});
