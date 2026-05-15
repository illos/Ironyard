import type { Participant } from '@ironyard/shared';
import { IntentTypes } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import type { MirrorIntent } from '../ws/useSessionSocket';
import { describeIntent } from './intentDescribe';

// Minimal Participant factory — only name + id needed for describe tests.
function makeParticipant(id: string, name: string): Participant {
  return { id, name, kind: 'pc', staminaState: 'healthy' } as unknown as Participant;
}

function makeIntent(
  type: string,
  payload: unknown,
  overrides: Partial<MirrorIntent> = {},
): MirrorIntent {
  return {
    id: 'intent-1',
    seq: 1,
    type,
    payload,
    actor: { userId: 'u1', role: 'director' },
    source: 'manual',
    voided: false,
    ...overrides,
  };
}

const participants = [makeParticipant('p1', 'Thresh'), makeParticipant('p2', 'Goblin')];

describe('describeIntent — Pass 3 Slice 1 cases', () => {
  it('BecomeDoomed includes participant name and source', () => {
    const result = describeIntent({
      intent: makeIntent(IntentTypes.BecomeDoomed, {
        participantId: 'p1',
        source: 'hakaan-doomsight',
      }),
      participantsBefore: participants,
    });
    expect(result).toContain('Thresh');
    expect(result).toContain('doomed');
    expect(result).toContain('hakaan-doomsight');
  });

  it('KnockUnconscious includes target name', () => {
    const result = describeIntent({
      intent: makeIntent(IntentTypes.KnockUnconscious, {
        targetId: 'p2',
        attackerId: 'p1',
      }),
      participantsBefore: participants,
    });
    expect(result).toContain('Goblin');
    expect(result).toContain('unconscious');
  });

  it('ApplyParticipantOverride includes participant name and override kind', () => {
    const result = describeIntent({
      intent: makeIntent(IntentTypes.ApplyParticipantOverride, {
        participantId: 'p1',
        override: {
          kind: 'inert',
          source: 'revenant',
          instantDeathDamageTypes: [],
          regainHours: 12,
          regainAmount: 'recoveryValue',
        },
      }),
      participantsBefore: participants,
    });
    expect(result).toContain('Thresh');
    expect(result).toContain('inert');
  });

  it('ClearParticipantOverride includes participant name', () => {
    const result = describeIntent({
      intent: makeIntent(IntentTypes.ClearParticipantOverride, {
        participantId: 'p2',
      }),
      participantsBefore: participants,
    });
    expect(result).toContain('Goblin');
    expect(result).toContain('override cleared');
  });

  it('ResolveTriggerOrder includes participant names in order', () => {
    const result = describeIntent({
      intent: makeIntent(IntentTypes.ResolveTriggerOrder, {
        pendingTriggerSetId: 'pts-1',
        order: ['p1', 'p2'],
      }),
      participantsBefore: participants,
    });
    expect(result).toContain('Thresh');
    expect(result).toContain('Goblin');
    expect(result).toContain('→');
  });

  it('GrantExtraMainAction includes participant name', () => {
    const result = describeIntent({
      intent: makeIntent(IntentTypes.GrantExtraMainAction, { participantId: 'p1' }),
      participantsBefore: participants,
    });
    expect(result).toContain('Thresh');
    expect(result).toContain('extra main action');
  });

  it('ExecuteTrigger includes participant name', () => {
    const result = describeIntent({
      intent: makeIntent(IntentTypes.ExecuteTrigger, {
        participantId: 'p2',
        triggeredActionId: 'ta-1',
        triggerEvent: { kind: 'winded', participantId: 'p2' },
      }),
      participantsBefore: participants,
    });
    expect(result).toContain('Goblin');
    expect(result).toContain('triggered action');
  });

  it('StaminaTransitioned shows from → to states', () => {
    const result = describeIntent({
      intent: makeIntent(IntentTypes.StaminaTransitioned, {
        participantId: 'p1',
        from: 'healthy',
        to: 'winded',
        cause: 'damage',
      }),
      participantsBefore: participants,
    });
    expect(result).toContain('Thresh');
    expect(result).toContain('healthy');
    expect(result).toContain('winded');
  });
});
