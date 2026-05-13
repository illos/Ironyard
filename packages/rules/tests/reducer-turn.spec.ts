import type { Intent, Participant } from '@ironyard/shared';
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

function part(id: string, name = id): Participant {
  return {
    id,
    name,
    kind: 'pc',
    level: 1,
    currentStamina: 30,
    maxStamina: 30,
    characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
    immunities: [],
    weaknesses: [],
    conditions: [],
    heroicResources: [],
    extras: [],
    surges: 0,
    recoveries: { current: 0, max: 0 },
    recoveryValue: 0,
    ownerId: null,
    characterId: null,
    weaponDamageBonus: { melee: [0, 0, 0], ranged: [0, 0, 0] },
    activeAbilities: [],
  };
}

function readyState(participantIds: string[] = ['alice', 'bob', 'cleric']): CampaignState {
  const participants = participantIds.map((id) => part(id));
  const s = emptyCampaignState(campaignId, 'user-owner');
  // Directly construct state with encounter phase — independent of StartEncounter
  // roster-replacement semantics (StartEncounter now atomically replaces the
  // roster from stampedPcs; seeded participants would be wiped out).
  return {
    ...s,
    participants,
    encounter: {
      id: 'enc_test',
      currentRound: 1,
      turnOrder: participants.map((p) => p.id),
      activeParticipantId: null,
      turnState: {},
      malice: { current: 0, lastMaliciousStrikeRound: null },
    },
  };
}

describe('SetInitiative', () => {
  it('replaces turnOrder with the provided list', () => {
    const r = applyIntent(
      readyState(),
      intent('SetInitiative', { order: ['cleric', 'alice', 'bob'] }),
    );
    expect(r.errors).toBeUndefined();
    expect(r.state.encounter?.turnOrder).toEqual(['cleric', 'alice', 'bob']);
  });

  it('rejects when the order set differs from the participant set', () => {
    const r = applyIntent(readyState(), intent('SetInitiative', { order: ['alice', 'bob'] }));
    expect(r.errors?.[0]?.code).toBe('invalid_order');
  });

  it('rejects unknown ids', () => {
    const r = applyIntent(
      readyState(),
      intent('SetInitiative', { order: ['alice', 'bob', 'ghost'] }),
    );
    expect(r.errors?.[0]?.code).toBe('invalid_order');
  });

  it('rejects duplicates even if all ids are valid', () => {
    const r = applyIntent(
      readyState(['alice', 'bob']),
      intent('SetInitiative', { order: ['alice', 'alice'] }),
    );
    expect(r.errors?.[0]?.code).toBe('invalid_order');
  });

  it('rejects with no active encounter', () => {
    const r = applyIntent(
      emptyCampaignState(campaignId, 'user-owner'),
      intent('SetInitiative', { order: ['alice'] }),
    );
    expect(r.errors?.[0]?.code).toBe('no_active_encounter');
  });
});

describe('StartRound / EndRound', () => {
  function withOrder(): CampaignState {
    let s = readyState();
    s = applyIntent(s, intent('SetInitiative', { order: ['alice', 'bob', 'cleric'] })).state;
    return s;
  }

  it('StartRound increments currentRound and activates the first in order', () => {
    // StartEncounter already sets currentRound to 1; StartRound advances to 2
    const r = applyIntent(withOrder(), intent('StartRound', {}));
    expect(r.errors).toBeUndefined();
    expect(r.state.encounter?.currentRound).toBe(2);
    expect(r.state.encounter?.activeParticipantId).toBe('alice');
  });

  it('StartRound a second time increments by 1 again', () => {
    let s = applyIntent(withOrder(), intent('StartRound', {})).state; // round 2
    s = applyIntent(s, intent('EndRound', {})).state;
    const r = applyIntent(s, intent('StartRound', {}));
    expect(r.state.encounter?.currentRound).toBe(3);
    expect(r.state.encounter?.activeParticipantId).toBe('alice');
  });

  it('StartRound with empty turnOrder leaves activeParticipantId null', () => {
    const s = applyIntent(readyState([]), intent('StartRound', {}));
    expect(s.state.encounter?.currentRound).toBe(2); // 1 from StartEncounter + 1 from StartRound
    expect(s.state.encounter?.activeParticipantId).toBeNull();
  });

  it('EndRound clears activeParticipantId but preserves currentRound for the log', () => {
    const s = applyIntent(withOrder(), intent('StartRound', {})).state; // round 2
    const r = applyIntent(s, intent('EndRound', {}));
    expect(r.state.encounter?.activeParticipantId).toBeNull();
    expect(r.state.encounter?.currentRound).toBe(2);
  });

  it('EndRound when no round is in progress is a no-op (still advances seq)', () => {
    const r = applyIntent(withOrder(), intent('EndRound', {}));
    expect(r.errors).toBeUndefined();
    expect(r.state.seq).toBe(withOrder().seq + 1);
  });
});

describe('StartTurn / EndTurn', () => {
  function inRoundOne(): CampaignState {
    let s = readyState();
    s = applyIntent(s, intent('SetInitiative', { order: ['alice', 'bob', 'cleric'] })).state;
    s = applyIntent(s, intent('StartRound', {})).state;
    return s;
  }

  it('StartTurn sets activeParticipantId explicitly (turn jump)', () => {
    const r = applyIntent(inRoundOne(), intent('StartTurn', { participantId: 'cleric' }));
    expect(r.errors).toBeUndefined();
    expect(r.state.encounter?.activeParticipantId).toBe('cleric');
  });

  it('StartTurn rejects unknown participants', () => {
    const r = applyIntent(inRoundOne(), intent('StartTurn', { participantId: 'ghost' }));
    expect(r.errors?.[0]?.code).toBe('participant_missing');
  });

  it('EndTurn advances to the next participant in order', () => {
    const r = applyIntent(inRoundOne(), intent('EndTurn', {}));
    expect(r.errors).toBeUndefined();
    expect(r.state.encounter?.activeParticipantId).toBe('bob');
  });

  it('EndTurn at the last in order parks activeParticipantId at null', () => {
    const s = applyIntent(inRoundOne(), intent('StartTurn', { participantId: 'cleric' })).state;
    const r = applyIntent(s, intent('EndTurn', {}));
    expect(r.state.encounter?.activeParticipantId).toBeNull();
  });

  it('full round walkthrough: StartRound → 3× EndTurn → null → EndRound', () => {
    let s = inRoundOne(); // StartEncounter sets round 1; StartRound (in inRoundOne) advances to 2
    expect(s.encounter?.activeParticipantId).toBe('alice');
    s = applyIntent(s, intent('EndTurn', {})).state;
    expect(s.encounter?.activeParticipantId).toBe('bob');
    s = applyIntent(s, intent('EndTurn', {})).state;
    expect(s.encounter?.activeParticipantId).toBe('cleric');
    s = applyIntent(s, intent('EndTurn', {})).state;
    expect(s.encounter?.activeParticipantId).toBeNull();
    s = applyIntent(s, intent('EndRound', {})).state;
    expect(s.encounter?.currentRound).toBe(2);
    expect(s.encounter?.activeParticipantId).toBeNull();
  });

  it('all turn intents require an active encounter', () => {
    const empty = emptyCampaignState(campaignId, 'user-owner');
    for (const t of ['StartRound', 'EndRound', 'StartTurn', 'EndTurn']) {
      const payload = t === 'StartTurn' ? { participantId: 'x' } : {};
      const r = applyIntent(empty, intent(t, payload));
      expect(r.errors?.[0]?.code).toBe('no_active_encounter');
    }
  });
});
