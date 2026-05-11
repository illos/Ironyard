import { describe, expect, it } from 'vitest';
import { applyIntent } from '../../src/index';
import { OWNER_ID, baseState, makeMonsterParticipant, ownerActor, stamped } from './test-utils';

describe('applyKickPlayer', () => {
  it('active director can kick a player', () => {
    const state = baseState();
    const result = applyIntent(
      state,
      stamped({
        type: 'KickPlayer',
        actor: ownerActor,
        payload: { userId: 'player-1', participantIdsToRemove: [] },
      }),
    );
    expect(result.errors).toBeUndefined();
    expect(result.state.seq).toBe(state.seq + 1);
  });

  it('emits derived RemoveParticipant intents for each participant to remove', () => {
    const state = baseState({
      participants: [makeMonsterParticipant('hero-1'), makeMonsterParticipant('hero-2')],
    });
    const result = applyIntent(
      state,
      stamped({
        type: 'KickPlayer',
        actor: ownerActor,
        payload: { userId: 'player-1', participantIdsToRemove: ['hero-1', 'hero-2'] },
      }),
    );
    expect(result.errors).toBeUndefined();
    expect(result.derived).toHaveLength(2);
    expect(result.derived[0]?.type).toBe('RemoveParticipant');
    expect((result.derived[0]?.payload as Record<string, unknown>).participantId).toBe('hero-1');
    expect(result.derived[1]?.type).toBe('RemoveParticipant');
    expect((result.derived[1]?.payload as Record<string, unknown>).participantId).toBe('hero-2');
  });

  it('emits no derived intents when participantIdsToRemove is empty', () => {
    const state = baseState();
    const result = applyIntent(
      state,
      stamped({
        type: 'KickPlayer',
        actor: ownerActor,
        payload: { userId: 'player-1', participantIdsToRemove: [] },
      }),
    );
    expect(result.derived).toHaveLength(0);
  });

  it('rejects when trying to kick the campaign owner', () => {
    const state = baseState();
    const result = applyIntent(
      state,
      stamped({
        type: 'KickPlayer',
        actor: ownerActor,
        payload: { userId: OWNER_ID, participantIdsToRemove: [] },
      }),
    );
    expect(result.errors?.[0]?.code).toBe('cannot_kick_owner');
  });

  it('rejects when actor is not the active director', () => {
    const state = baseState();
    const result = applyIntent(
      state,
      stamped({
        type: 'KickPlayer',
        actor: { userId: 'random-player', role: 'player' },
        payload: { userId: 'another-player', participantIdsToRemove: [] },
      }),
    );
    expect(result.errors?.[0]?.code).toBe('not_active_director');
  });

  it('rejects with invalid_payload when payload is malformed', () => {
    const state = baseState();
    const result = applyIntent(
      state,
      stamped({
        type: 'KickPlayer',
        actor: ownerActor,
        payload: { userId: 'player-1' }, // missing participantIdsToRemove
      }),
    );
    expect(result.errors?.[0]?.code).toBe('invalid_payload');
  });
});
