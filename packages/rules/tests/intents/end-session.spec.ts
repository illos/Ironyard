import { IntentTypes } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import { applyIntent } from '../../src/reducer';
import { baseState, ownerActor, stamped } from './test-utils';

describe('applyEndSession', () => {
  it('closes the active session', () => {
    const state = baseState({
      currentSessionId: 'sess-1',
      attendingCharacterIds: ['c1', 'c2'],
      heroTokens: 2,
    });
    const result = applyIntent(
      state,
      stamped({ type: IntentTypes.EndSession, actor: ownerActor, payload: {} }),
    );
    expect(result.errors).toBeUndefined();
    expect(result.state.currentSessionId).toBeNull();
    expect(result.state.attendingCharacterIds).toEqual([]);
    // heroTokens preserved as historical snapshot; pool inaccessible w/o session
    expect(result.state.heroTokens).toBe(2);
  });

  it('rejects when no session is active', () => {
    const state = baseState({ currentSessionId: null });
    const result = applyIntent(
      state,
      stamped({ type: IntentTypes.EndSession, actor: ownerActor, payload: {} }),
    );
    expect(result.errors?.[0]?.code).toBe('no_active_session');
  });
});
