import { describe, expect, it } from 'vitest';
import { applyIntent } from '../../src/index';
import { baseState, stamped } from './test-utils';

describe('applySubmitCharacter', () => {
  it('accepts when caller owns the character and is a campaign member', () => {
    const state = baseState();
    const result = applyIntent(
      state,
      stamped({
        type: 'SubmitCharacter',
        actor: { userId: 'player-1', role: 'player' },
        payload: { characterId: 'char-1', ownsCharacter: true, isCampaignMember: true },
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
        type: 'SubmitCharacter',
        actor: { userId: 'player-1', role: 'player' },
        payload: { characterId: 'char-1', ownsCharacter: true, isCampaignMember: true },
      }),
    );
    expect(result.state.participants).toHaveLength(0);
  });

  it('rejects when caller does not own the character', () => {
    const state = baseState();
    const result = applyIntent(
      state,
      stamped({
        type: 'SubmitCharacter',
        actor: { userId: 'player-1', role: 'player' },
        payload: { characterId: 'char-1', ownsCharacter: false, isCampaignMember: true },
      }),
    );
    expect(result.errors?.[0]?.code).toBe('not_character_owner');
    expect(result.state.seq).toBe(state.seq); // unchanged
  });

  it('rejects when caller is not a campaign member', () => {
    const state = baseState();
    const result = applyIntent(
      state,
      stamped({
        type: 'SubmitCharacter',
        actor: { userId: 'player-1', role: 'player' },
        payload: { characterId: 'char-1', ownsCharacter: true, isCampaignMember: false },
      }),
    );
    expect(result.errors?.[0]?.code).toBe('not_campaign_member');
  });

  it('rejects with invalid_payload when payload is malformed', () => {
    const state = baseState();
    const result = applyIntent(
      state,
      stamped({
        type: 'SubmitCharacter',
        actor: { userId: 'player-1', role: 'player' },
        payload: { characterId: 'char-1' }, // missing ownsCharacter, isCampaignMember
      }),
    );
    expect(result.errors?.[0]?.code).toBe('invalid_payload');
  });
});
