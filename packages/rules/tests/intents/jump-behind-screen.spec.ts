import { describe, expect, it } from 'vitest';
import { applyIntent } from '../../src/index';
import { OWNER_ID, baseState, ownerActor, stamped } from './test-utils';

describe('applyJumpBehindScreen', () => {
  it('owner can jump regardless of permitted flag being false', () => {
    const state = baseState();
    const result = applyIntent(
      state,
      stamped({
        type: 'JumpBehindScreen',
        actor: { userId: OWNER_ID, role: 'director' },
        payload: { permitted: false },
      }),
    );
    expect(result.errors).toBeUndefined();
    expect(result.state.activeDirectorId).toBe(OWNER_ID);
  });

  it('director-permitted member can jump', () => {
    const state = baseState({ activeDirectorId: OWNER_ID });
    const result = applyIntent(
      state,
      stamped({
        type: 'JumpBehindScreen',
        actor: { userId: 'co-dm', role: 'player' },
        payload: { permitted: true },
      }),
    );
    expect(result.errors).toBeUndefined();
    expect(result.state.activeDirectorId).toBe('co-dm');
  });

  it('changes activeDirectorId to the jumping user', () => {
    const state = baseState({ activeDirectorId: OWNER_ID });
    const result = applyIntent(
      state,
      stamped({
        type: 'JumpBehindScreen',
        actor: { userId: 'co-dm', role: 'player' },
        payload: { permitted: true },
      }),
    );
    expect(result.state.activeDirectorId).toBe('co-dm');
  });

  it('advances seq', () => {
    const state = baseState();
    const result = applyIntent(
      state,
      stamped({
        type: 'JumpBehindScreen',
        actor: ownerActor,
        payload: { permitted: true },
      }),
    );
    expect(result.state.seq).toBe(state.seq + 1);
  });

  it('rejects when not permitted and not owner', () => {
    const state = baseState();
    const result = applyIntent(
      state,
      stamped({
        type: 'JumpBehindScreen',
        actor: { userId: 'random-player', role: 'player' },
        payload: { permitted: false },
      }),
    );
    expect(result.errors?.[0]?.code).toBe('not_director_permitted');
    expect(result.state.activeDirectorId).toBe(OWNER_ID); // unchanged
  });

  it('rejects with invalid_payload when payload is malformed', () => {
    const state = baseState();
    const result = applyIntent(
      state,
      stamped({
        type: 'JumpBehindScreen',
        actor: ownerActor,
        payload: {}, // missing permitted
      }),
    );
    expect(result.errors?.[0]?.code).toBe('invalid_payload');
  });
});
