import { describe, expect, it } from 'vitest';
import { applyIntent } from '../../src/index';
import { baseState, ownerActor, stamped } from './test-utils';

describe('applyRemoveApprovedCharacter', () => {
  it('active director can remove an approved character', () => {
    const state = baseState();
    const result = applyIntent(
      state,
      stamped({
        type: 'RemoveApprovedCharacter',
        actor: ownerActor,
        payload: { characterId: 'char-1' },
      }),
    );
    expect(result.errors).toBeUndefined();
    expect(result.state.seq).toBe(state.seq + 1);
  });

  it('does not touch state.participants (side-effect intent)', () => {
    const state = baseState();
    const result = applyIntent(
      state,
      stamped({
        type: 'RemoveApprovedCharacter',
        actor: ownerActor,
        payload: { characterId: 'char-1' },
      }),
    );
    expect(result.state.participants).toHaveLength(0);
  });

  it('rejects when actor is not the active director', () => {
    const state = baseState();
    const result = applyIntent(
      state,
      stamped({
        type: 'RemoveApprovedCharacter',
        actor: { userId: 'random-player', role: 'player' },
        payload: { characterId: 'char-1' },
      }),
    );
    expect(result.errors?.[0]?.code).toBe('not_active_director');
  });

  it('rejects with invalid_payload when characterId is missing', () => {
    const state = baseState();
    const result = applyIntent(
      state,
      stamped({
        type: 'RemoveApprovedCharacter',
        actor: ownerActor,
        payload: {},
      }),
    );
    expect(result.errors?.[0]?.code).toBe('invalid_payload');
  });
});
