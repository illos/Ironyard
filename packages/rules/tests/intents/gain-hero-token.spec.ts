import { IntentTypes } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import { applyIntent } from '../../src/reducer';
import { baseState, ownerActor, stamped } from './test-utils';

describe('applyGainHeroToken', () => {
  it('adds to the pool', () => {
    const state = baseState({ currentSessionId: 'sess-1', heroTokens: 2 });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.GainHeroToken,
        actor: ownerActor,
        payload: { amount: 3 },
      }),
    );
    expect(result.errors).toBeUndefined();
    expect(result.state.heroTokens).toBe(5);
  });

  it('rejects when no session is active', () => {
    const state = baseState({ currentSessionId: null, heroTokens: 0 });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.GainHeroToken,
        actor: ownerActor,
        payload: { amount: 1 },
      }),
    );
    expect(result.errors?.[0]?.code).toBe('no_active_session');
  });

  it('rejects invalid payload (amount < 1)', () => {
    const state = baseState({ currentSessionId: 'sess-1' });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.GainHeroToken,
        actor: ownerActor,
        payload: { amount: 0 },
      }),
    );
    expect(result.errors?.[0]?.code).toBe('invalid_payload');
  });
});
