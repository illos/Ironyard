import { IntentTypes } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import { applyIntent } from '../../src/reducer';
import { baseState, ownerActor, stamped } from './test-utils';

describe('applyUpdateSessionAttendance', () => {
  it('adds new character ids', () => {
    const state = baseState({
      currentSessionId: 'sess-1',
      attendingCharacterIds: ['c1'],
    });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.UpdateSessionAttendance,
        actor: ownerActor,
        payload: { add: ['c2', 'c3'] },
      }),
    );
    expect(result.errors).toBeUndefined();
    expect(result.state.attendingCharacterIds).toEqual(['c1', 'c2', 'c3']);
  });

  it('removes character ids', () => {
    const state = baseState({
      currentSessionId: 'sess-1',
      attendingCharacterIds: ['c1', 'c2', 'c3'],
    });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.UpdateSessionAttendance,
        actor: ownerActor,
        payload: { remove: ['c2'] },
      }),
    );
    expect(result.state.attendingCharacterIds).toEqual(['c1', 'c3']);
  });

  it('mixed add + remove in one intent', () => {
    const state = baseState({
      currentSessionId: 'sess-1',
      attendingCharacterIds: ['c1', 'c2'],
    });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.UpdateSessionAttendance,
        actor: ownerActor,
        payload: { add: ['c3'], remove: ['c1'] },
      }),
    );
    expect(result.state.attendingCharacterIds).toEqual(['c2', 'c3']);
  });

  it('idempotent on duplicate adds', () => {
    const state = baseState({
      currentSessionId: 'sess-1',
      attendingCharacterIds: ['c1'],
    });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.UpdateSessionAttendance,
        actor: ownerActor,
        payload: { add: ['c1'] },
      }),
    );
    expect(result.state.attendingCharacterIds).toEqual(['c1']);
  });

  it('rejects when no session is active', () => {
    const state = baseState({ currentSessionId: null });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.UpdateSessionAttendance,
        actor: ownerActor,
        payload: { add: ['c1'] },
      }),
    );
    expect(result.errors?.[0]?.code).toBe('no_active_session');
  });
});
