import { describe, expect, it } from 'vitest';
import { applyIntent } from '../../src/index';
import type { PcPlaceholder } from '../../src/types';
import { OWNER_ID, baseState, makeHeroParticipant, makeMonsterParticipant, ownerActor, stamped } from './test-utils';

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

  it('removes pc-placeholder entries owned by the kicked user from state.participants', () => {
    const placeholder: PcPlaceholder = {
      kind: 'pc-placeholder',
      characterId: 'char-abc',
      ownerId: 'player-1',
      position: 0,
    };
    const state = baseState({
      participants: [placeholder, makeMonsterParticipant('monster-1')],
    });
    const result = applyIntent(
      state,
      stamped({
        type: 'KickPlayer',
        actor: ownerActor,
        payload: {
          userId: 'player-1',
          participantIdsToRemove: [],
          placeholderCharacterIdsToRemove: ['char-abc'],
        },
      }),
    );
    expect(result.errors).toBeUndefined();
    // Placeholder must be gone; monster must remain
    expect(result.state.participants).toHaveLength(1);
    expect(result.state.participants[0]?.kind).toBe('monster');
    // No derived intents (there are no full Participants to remove)
    expect(result.derived).toHaveLength(0);
  });

  it('evicts both a full Participant and a placeholder when the user has both', () => {
    const placeholder: PcPlaceholder = {
      kind: 'pc-placeholder',
      characterId: 'char-secondary',
      ownerId: 'player-1',
      position: 1,
    };
    const hero = makeHeroParticipant('char-primary', { kind: 'pc' });
    const state = baseState({
      participants: [hero, placeholder, makeMonsterParticipant('monster-1')],
    });
    const result = applyIntent(
      state,
      stamped({
        type: 'KickPlayer',
        actor: ownerActor,
        payload: {
          userId: 'player-1',
          participantIdsToRemove: ['char-primary'],
          placeholderCharacterIdsToRemove: ['char-secondary'],
        },
      }),
    );
    expect(result.errors).toBeUndefined();
    // The placeholder is removed directly from state; the full Participant is handled
    // by a derived RemoveParticipant intent (applied downstream by the DO).
    // After KickPlayer: placeholder gone, full Participant still in state (awaiting derived),
    // monster untouched.
    expect(result.state.participants).toHaveLength(2);
    const kinds = result.state.participants.map((p) => p.kind);
    expect(kinds).not.toContain('pc-placeholder');
    expect(kinds).toContain('pc');
    expect(kinds).toContain('monster');
    // One derived RemoveParticipant for the full Participant
    expect(result.derived).toHaveLength(1);
    expect(result.derived[0]?.type).toBe('RemoveParticipant');
    expect((result.derived[0]?.payload as Record<string, unknown>).participantId).toBe('char-primary');
  });

  it('leaves roster untouched when placeholderCharacterIdsToRemove is empty or absent', () => {
    const placeholder: PcPlaceholder = {
      kind: 'pc-placeholder',
      characterId: 'char-other-user',
      ownerId: 'other-user',
      position: 0,
    };
    const state = baseState({
      participants: [placeholder],
    });
    const result = applyIntent(
      state,
      stamped({
        type: 'KickPlayer',
        actor: ownerActor,
        payload: {
          userId: 'player-1',
          participantIdsToRemove: [],
          placeholderCharacterIdsToRemove: [],
        },
      }),
    );
    expect(result.errors).toBeUndefined();
    // Other user's placeholder must remain
    expect(result.state.participants).toHaveLength(1);
    expect(result.state.participants[0]?.kind).toBe('pc-placeholder');
  });
});
