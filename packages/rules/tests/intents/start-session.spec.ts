import { IntentTypes } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import { applyIntent } from '../../src/reducer';
import { baseState, ownerActor, stamped } from './test-utils';

describe('applyStartSession', () => {
  it('opens a session with explicit name and default heroTokens', () => {
    const state = baseState({ currentSessionId: null });

    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.StartSession,
        actor: ownerActor,
        payload: {
          name: 'Bandit Camp',
          attendingCharacterIds: ['c1', 'c2', 'c3'],
        },
      }),
    );

    expect(result.errors).toBeUndefined();
    expect(result.state.currentSessionId).toMatch(/^sess_/);
    expect(result.state.attendingCharacterIds).toEqual(['c1', 'c2', 'c3']);
    expect(result.state.heroTokens).toBe(3);
  });

  it('honors heroTokens override', () => {
    const state = baseState({ currentSessionId: null });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.StartSession,
        actor: ownerActor,
        payload: { attendingCharacterIds: ['c1'], heroTokens: 5 },
      }),
    );
    expect(result.state.heroTokens).toBe(5);
  });

  it('honors client-suggested sessionId', () => {
    const state = baseState({ currentSessionId: null });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.StartSession,
        actor: ownerActor,
        payload: {
          sessionId: 'sess_my_suggested',
          attendingCharacterIds: ['c1'],
        },
      }),
    );
    expect(result.state.currentSessionId).toBe('sess_my_suggested');
  });

  it('rejects if a session is already active', () => {
    const state = baseState({ currentSessionId: 'sess-existing' });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.StartSession,
        actor: ownerActor,
        payload: { attendingCharacterIds: ['c1'] },
      }),
    );
    expect(result.errors?.[0]?.code).toBe('session_already_active');
  });

  it('rejects an invalid payload', () => {
    const state = baseState({ currentSessionId: null });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.StartSession,
        actor: ownerActor,
        payload: { attendingCharacterIds: [] },
      }),
    );
    expect(result.errors?.[0]?.code).toBe('invalid_payload');
  });
});
