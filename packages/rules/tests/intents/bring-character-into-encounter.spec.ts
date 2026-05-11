import { describe, expect, it } from 'vitest';
import { applyBringCharacterIntoEncounter } from '../../src/intents/bring-character-into-encounter';
import { emptyCampaignState } from '../../src/types';
import type { StampedIntent } from '../../src/types';

const T = 1_700_000_000_000;

function stamp(
  partial: Pick<StampedIntent, 'type' | 'actor' | 'payload'> & Partial<StampedIntent>,
): StampedIntent {
  return {
    id: partial.id ?? `i_${Math.random().toString(36).slice(2)}`,
    campaignId: partial.campaignId ?? 'c-test',
    actor: partial.actor,
    timestamp: partial.timestamp ?? T,
    source: partial.source ?? 'manual',
    type: partial.type,
    payload: partial.payload,
    causedBy: partial.causedBy,
  };
}

describe('applyBringCharacterIntoEncounter', () => {
  it('adds a pc-placeholder to the roster, not a full participant', () => {
    const state = emptyCampaignState('c-1', 'u-owner');
    state.activeDirectorId = 'u-owner';
    const intent = stamp({
      type: 'BringCharacterIntoEncounter',
      actor: { userId: 'u-owner', role: 'director' },
      payload: { characterId: 'char-1', ownerId: 'u-player', position: 0 },
    });
    const { state: next } = applyBringCharacterIntoEncounter(state, intent);
    expect(next.participants).toHaveLength(1);
    expect(next.participants[0]).toEqual({
      kind: 'pc-placeholder',
      characterId: 'char-1',
      ownerId: 'u-player',
      position: 0,
    });
  });

  it('uses participants.length as default position when not supplied', () => {
    const state = emptyCampaignState('c-1', 'u-owner');
    state.activeDirectorId = 'u-owner';
    const intent = stamp({
      type: 'BringCharacterIntoEncounter',
      actor: { userId: 'u-owner', role: 'director' },
      payload: { characterId: 'char-2', ownerId: 'u-player' }, // no position
    });
    const { state: next } = applyBringCharacterIntoEncounter(state, intent);
    expect(next.participants[0]).toMatchObject({ position: 0 });
  });

  it('rejects duplicate characterId', () => {
    let state = emptyCampaignState('c-1', 'u-owner');
    state.activeDirectorId = 'u-owner';
    const intent = stamp({
      type: 'BringCharacterIntoEncounter',
      actor: { userId: 'u-owner', role: 'director' },
      payload: { characterId: 'char-1', ownerId: 'u-player' },
    });
    state = applyBringCharacterIntoEncounter(state, intent).state;
    const { errors } = applyBringCharacterIntoEncounter(state, intent);
    expect(errors?.[0]?.code).toBe('already_in_roster');
  });

  it('rejects when actor is not the active director', () => {
    const state = emptyCampaignState('c-1', 'u-owner');
    state.activeDirectorId = 'u-owner';
    const intent = stamp({
      type: 'BringCharacterIntoEncounter',
      actor: { userId: 'u-player', role: 'player' },
      payload: { characterId: 'char-1', ownerId: 'u-player' },
    });
    const { errors } = applyBringCharacterIntoEncounter(state, intent);
    expect(errors?.[0]?.code).toBe('permission_denied');
  });

  it('rejects invalid payload', () => {
    const state = emptyCampaignState('c-1', 'u-owner');
    state.activeDirectorId = 'u-owner';
    const intent = stamp({
      type: 'BringCharacterIntoEncounter',
      actor: { userId: 'u-owner', role: 'director' },
      payload: { characterId: '' }, // missing ownerId, empty characterId
    });
    const { errors } = applyBringCharacterIntoEncounter(state, intent);
    expect(errors?.[0]?.code).toBe('invalid_payload');
  });

  it('advances seq', () => {
    const state = emptyCampaignState('c-1', 'u-owner');
    state.activeDirectorId = 'u-owner';
    const intent = stamp({
      type: 'BringCharacterIntoEncounter',
      actor: { userId: 'u-owner', role: 'director' },
      payload: { characterId: 'char-1', ownerId: 'u-player' },
    });
    const { state: next } = applyBringCharacterIntoEncounter(state, intent);
    expect(next.seq).toBe(state.seq + 1);
  });
});
