import type { Intent } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import {
  type CampaignState,
  type StampedIntent,
  applyIntent,
  emptyCampaignState,
} from '../src/index';

const T = 1_700_000_000_000;
const campaignId = 'sess_test';

function intent(type: string, payload: unknown, overrides: Partial<Intent> = {}): StampedIntent {
  return {
    id: overrides.id ?? `i_${Math.random().toString(36).slice(2)}`,
    campaignId: overrides.campaignId ?? campaignId,
    actor: overrides.actor ?? { userId: 'alice', role: 'director' },
    timestamp: overrides.timestamp ?? T,
    source: overrides.source ?? 'manual',
    type,
    payload,
    causedBy: overrides.causedBy,
  };
}

describe('applyIntent — JoinLobby', () => {
  it('adds a new member to connectedMembers and advances seq', () => {
    const state = emptyCampaignState(campaignId);
    const i = intent('JoinLobby', { userId: 'alice', displayName: 'Alice' });
    const result = applyIntent(state, i);
    expect(result.errors).toBeUndefined();
    expect(result.state.connectedMembers).toEqual([{ userId: 'alice', displayName: 'Alice' }]);
    expect(result.state.seq).toBe(1);
    expect(result.log[0]?.text).toContain('Alice joined');
  });

  it('is idempotent: rejoining the same user is a no-op (still advances seq)', () => {
    let s = emptyCampaignState(campaignId);
    s = applyIntent(s, intent('JoinLobby', { userId: 'alice', displayName: 'Alice' })).state;
    const second = applyIntent(s, intent('JoinLobby', { userId: 'alice', displayName: 'Alice' }));
    expect(second.state.connectedMembers).toHaveLength(1);
    expect(second.state.seq).toBe(2);
    expect(second.log[0]?.text).toContain('rejoined');
  });

  it('rejects an empty userId', () => {
    const state = emptyCampaignState(campaignId);
    const result = applyIntent(state, intent('JoinLobby', { userId: '', displayName: 'X' }));
    expect(result.errors?.[0]?.code).toBe('invalid_payload');
    expect(result.state).toEqual(state); // state untouched
  });

  it('rejects a missing displayName', () => {
    const state = emptyCampaignState(campaignId);
    const result = applyIntent(state, intent('JoinLobby', { userId: 'alice' }));
    expect(result.errors?.[0]?.code).toBe('invalid_payload');
  });
});

describe('applyIntent — LeaveLobby', () => {
  function withTwo(): CampaignState {
    let s = emptyCampaignState(campaignId);
    s = applyIntent(s, intent('JoinLobby', { userId: 'alice', displayName: 'Alice' })).state;
    s = applyIntent(s, intent('JoinLobby', { userId: 'bob', displayName: 'Bob' })).state;
    return s;
  }

  it('removes a member and advances seq', () => {
    const result = applyIntent(withTwo(), intent('LeaveLobby', { userId: 'bob' }));
    expect(result.state.connectedMembers.map((m) => m.userId)).toEqual(['alice']);
    expect(result.state.seq).toBe(3);
    expect(result.log[0]?.text).toContain('Bob left');
  });

  it('is idempotent: leaving twice is a no-op', () => {
    let s = withTwo();
    s = applyIntent(s, intent('LeaveLobby', { userId: 'bob' })).state;
    const second = applyIntent(s, intent('LeaveLobby', { userId: 'bob' }));
    expect(second.state.connectedMembers.map((m) => m.userId)).toEqual(['alice']);
    expect(second.state.seq).toBe(4);
    expect(second.log[0]?.text).toContain('already absent');
  });

  it('rejects an empty userId', () => {
    const state = withTwo();
    const result = applyIntent(state, intent('LeaveLobby', { userId: '' }));
    expect(result.errors?.[0]?.code).toBe('invalid_payload');
    expect(result.state).toEqual(state);
  });
});

describe('applyIntent — Note', () => {
  it('appends a NoteEntry with intentId, actorId, text, and timestamp', () => {
    const state = emptyCampaignState(campaignId);
    const i = intent(
      'Note',
      { text: 'first blood' },
      { id: 'i_note_1', actor: { userId: 'alice', role: 'director' }, timestamp: T + 5 },
    );
    const result = applyIntent(state, i);
    expect(result.errors).toBeUndefined();
    expect(result.state.notes).toEqual([
      { intentId: 'i_note_1', actorId: 'alice', text: 'first blood', timestamp: T + 5 },
    ]);
    expect(result.state.seq).toBe(1);
  });

  it('rejects an empty note', () => {
    const state = emptyCampaignState(campaignId);
    const result = applyIntent(state, intent('Note', { text: '' }));
    expect(result.errors?.[0]?.code).toBe('invalid_payload');
  });

  it('rejects a note over 2000 chars', () => {
    const state = emptyCampaignState(campaignId);
    const result = applyIntent(state, intent('Note', { text: 'x'.repeat(2001) }));
    expect(result.errors?.[0]?.code).toBe('invalid_payload');
  });

  it('preserves prior notes when appending', () => {
    let s = emptyCampaignState(campaignId);
    s = applyIntent(s, intent('Note', { text: 'first' })).state;
    s = applyIntent(s, intent('Note', { text: 'second' })).state;
    expect(s.notes.map((n) => n.text)).toEqual(['first', 'second']);
    expect(s.seq).toBe(2);
  });
});

describe('applyIntent — unknown intent type', () => {
  it('returns an unknown_intent error and leaves state alone', () => {
    const state = emptyCampaignState(campaignId);
    const result = applyIntent(state, intent('NotYetImplemented', { foo: 'bar' }));
    expect(result.errors?.[0]?.code).toBe('unknown_intent');
    expect(result.state).toEqual(state);
  });
});

describe('applyIntent — purity', () => {
  it('does not mutate the input state', () => {
    const state = emptyCampaignState(campaignId);
    const snapshot = JSON.stringify(state);
    applyIntent(state, intent('Note', { text: 'hello' }));
    applyIntent(state, intent('JoinLobby', { userId: 'alice', displayName: 'A' }));
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});
