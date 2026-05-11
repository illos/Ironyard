import { describe, expect, it } from 'vitest';
import { applySwapKit } from '../../src/intents/swap-kit';
import { OWNER_ID, baseState, makeRunningEncounterPhase, stamped } from './test-utils';

const BASE_PAYLOAD = { characterId: 'c-1', newKitId: 'panther', ownerId: 'u-player' };

describe('applySwapKit', () => {
  it('rejects mid-encounter', () => {
    const state = baseState({
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const result = applySwapKit(
      state,
      stamped({
        type: 'SwapKit',
        actor: { userId: 'u-player', role: 'player' },
        payload: BASE_PAYLOAD,
      }),
    );
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0]?.code).toBe('in_encounter');
    // State unchanged
    expect(result.state).toBe(state);
  });

  it('rejects non-owner non-director', () => {
    const state = baseState();
    const result = applySwapKit(
      state,
      stamped({
        type: 'SwapKit',
        actor: { userId: 'u-stranger', role: 'player' },
        payload: { ...BASE_PAYLOAD, ownerId: 'u-player' },
      }),
    );
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0]?.code).toBe('permission_denied');
    expect(result.state).toBe(state);
  });

  it('accepts character owner', () => {
    const state = baseState();
    const result = applySwapKit(
      state,
      stamped({
        type: 'SwapKit',
        actor: { userId: 'u-player', role: 'player' },
        payload: { ...BASE_PAYLOAD, ownerId: 'u-player' },
      }),
    );
    expect(result.errors).toBeUndefined();
    expect(result.log).toHaveLength(1);
  });

  it('accepts active director (campaign owner)', () => {
    const state = baseState(); // activeDirectorId === OWNER_ID by default
    const result = applySwapKit(
      state,
      stamped({
        type: 'SwapKit',
        actor: { userId: OWNER_ID, role: 'director' },
        payload: { ...BASE_PAYLOAD, ownerId: 'u-player' },
      }),
    );
    expect(result.errors).toBeUndefined();
    expect(result.log).toHaveLength(1);
  });

  it('returns state with seq incremented on success', () => {
    const state = baseState();
    const result = applySwapKit(
      state,
      stamped({
        type: 'SwapKit',
        actor: { userId: 'u-player', role: 'player' },
        payload: { ...BASE_PAYLOAD, ownerId: 'u-player' },
      }),
    );
    expect(result.state.seq).toBe(state.seq + 1);
  });

  it('returns unchanged CampaignState on error (no seq bump)', () => {
    const state = baseState();
    const result = applySwapKit(
      state,
      stamped({
        type: 'SwapKit',
        actor: { userId: 'u-stranger', role: 'player' },
        payload: { ...BASE_PAYLOAD, ownerId: 'u-player' },
      }),
    );
    // On rejection the original state object is returned unchanged
    expect(result.state).toBe(state);
    expect(result.state.seq).toBe(state.seq);
  });

  it('rejects invalid payload (missing ownerId)', () => {
    const state = baseState();
    const result = applySwapKit(
      state,
      stamped({
        type: 'SwapKit',
        actor: { userId: 'u-player', role: 'player' },
        payload: { characterId: 'c-1', newKitId: 'wrecker' }, // ownerId missing
      }),
    );
    expect(result.errors?.[0]?.code).toBe('invalid_payload');
  });
});
