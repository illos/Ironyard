import { IntentTypes } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import { applyIntent } from '../../src/reducer';
import {
  baseState,
  makeHeroParticipant,
  makeRunningEncounterPhase,
  ownerActor,
  stamped,
} from './test-utils';

const PC_ID = 'pc:alice';

function statefulBase(heroTokens = 2) {
  const hero = makeHeroParticipant(PC_ID, { recoveryValue: 8, currentStamina: 10, maxStamina: 30 });
  return baseState({
    currentSessionId: 'sess-1',
    heroTokens,
    attendingCharacterIds: [PC_ID],
    participants: [hero],
    encounter: makeRunningEncounterPhase('enc-1', { turnOrder: [PC_ID] }),
  });
}

describe('applySpendHeroToken', () => {
  it('surge_burst — spends 1, derives GainResource surges +2', () => {
    const state = statefulBase(2);
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.SpendHeroToken,
        actor: ownerActor,
        payload: { amount: 1, reason: 'surge_burst', participantId: PC_ID },
      }),
    );
    expect(result.errors).toBeUndefined();
    expect(result.state.heroTokens).toBe(1);
    expect(result.derived).toHaveLength(1);
    expect(result.derived[0]?.type).toBe(IntentTypes.GainResource);
    expect(result.derived[0]?.payload).toMatchObject({
      participantId: PC_ID,
      name: 'surges',
      amount: 2,
    });
  });

  it('regain_stamina — spends 2, derives ApplyHeal of recoveryValue', () => {
    const state = statefulBase(2);
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.SpendHeroToken,
        actor: ownerActor,
        payload: { amount: 2, reason: 'regain_stamina', participantId: PC_ID },
      }),
    );
    expect(result.errors).toBeUndefined();
    expect(result.state.heroTokens).toBe(0);
    expect(result.derived).toHaveLength(1);
    expect(result.derived[0]?.type).toBe(IntentTypes.ApplyHeal);
    expect(result.derived[0]?.payload).toMatchObject({
      targetId: PC_ID,
      amount: 8,
    });
  });

  it('narrative — spends amount, no derived intent', () => {
    const state = statefulBase(3);
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.SpendHeroToken,
        actor: ownerActor,
        payload: { amount: 1, reason: 'narrative', participantId: PC_ID },
      }),
    );
    expect(result.errors).toBeUndefined();
    expect(result.state.heroTokens).toBe(2);
    expect(result.derived).toHaveLength(0);
  });

  it('rejects surge_burst with amount != 1', () => {
    const state = statefulBase(2);
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.SpendHeroToken,
        actor: ownerActor,
        payload: { amount: 2, reason: 'surge_burst', participantId: PC_ID },
      }),
    );
    expect(result.errors?.[0]?.code).toBe('invalid_spend_reason');
  });

  it('rejects regain_stamina with amount != 2', () => {
    const state = statefulBase(3);
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.SpendHeroToken,
        actor: ownerActor,
        payload: { amount: 1, reason: 'regain_stamina', participantId: PC_ID },
      }),
    );
    expect(result.errors?.[0]?.code).toBe('invalid_spend_reason');
  });

  it('rejects when pool insufficient', () => {
    const state = statefulBase(0);
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.SpendHeroToken,
        actor: ownerActor,
        payload: { amount: 1, reason: 'narrative', participantId: PC_ID },
      }),
    );
    expect(result.errors?.[0]?.code).toBe('insufficient_tokens');
  });

  it('rejects when no session is active', () => {
    const state = statefulBase(2);
    state.currentSessionId = null;
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.SpendHeroToken,
        actor: ownerActor,
        payload: { amount: 1, reason: 'narrative', participantId: PC_ID },
      }),
    );
    expect(result.errors?.[0]?.code).toBe('no_active_session');
  });

  it('regain_stamina rejects when participant is not in encounter', () => {
    const state = baseState({
      currentSessionId: 'sess-1',
      heroTokens: 2,
      attendingCharacterIds: [PC_ID],
      // no participants, no encounter
    });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.SpendHeroToken,
        actor: ownerActor,
        payload: { amount: 2, reason: 'regain_stamina', participantId: PC_ID },
      }),
    );
    expect(result.errors?.[0]?.code).toBe('participant_not_in_encounter');
  });
});
