import type { Intent, Participant } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import {
  type CampaignState,
  type StampedIntent,
  applyIntent,
  emptyCampaignState,
} from '../src/index';
import { isParticipant } from '../src/types';

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
    victories: 0,
    turnActionUsage: { main: false, maneuver: false, move: false },
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

describe('applyStartRound Malice tick', () => {
  it('round 2 with 5 alive heroes → malice += 7', () => {
    const s = readyState(['alice', 'bob', 'cleric', 'ranger', 'barbarian']);
    s.encounter!.currentRound = 1;
    s.encounter!.malice.current = 9; // from round-1 init
    const result = applyIntent(s, intent('StartRound', {}));
    // After StartRound: currentRound = 2; malice += aliveHeroes(5) + 2 = 7.
    expect(result.errors).toBeUndefined();
    expect(result.state.encounter!.currentRound).toBe(2);
    expect(result.state.encounter!.malice.current).toBe(16);
  });

  it('hero death drops the alive count for subsequent ticks', () => {
    const s = readyState(['alice', 'bob', 'cleric']);
    s.encounter!.currentRound = 2;
    s.encounter!.malice.current = 16;
    // Kill one PC (currentStamina past -windedValue).
    const dead = s.participants.find((p) => isParticipant(p) && p.kind === 'pc');
    if (dead) (dead as Participant).currentStamina = -100;
    const result = applyIntent(s, intent('StartRound', {}));
    // currentRound becomes 3; aliveHeroes = 2 (one is dead); malice += 2 + 3 = 5.
    expect(result.errors).toBeUndefined();
    expect(result.state.encounter!.currentRound).toBe(3);
    expect(result.state.encounter!.malice.current).toBe(21);
  });
});

describe('applyEndRound + OpenAction expiry', () => {
  it('removes OAs whose expiresAtRound === currentRound', () => {
    let s = readyState();
    s = applyIntent(s, intent('SetInitiative', { order: ['alice', 'bob', 'cleric'] })).state;
    s = {
      ...s,
      encounter: { ...s.encounter!, currentRound: 3 },
      openActions: [
        {
          id: 'oa-now',
          kind: '__sentinel_2b_0__',
          participantId: 'alice',
          raisedAtRound: 3,
          raisedByIntentId: 'x',
          expiresAtRound: 3,
          payload: {},
        },
        {
          id: 'oa-later',
          kind: '__sentinel_2b_0__',
          participantId: 'alice',
          raisedAtRound: 3,
          raisedByIntentId: 'x',
          expiresAtRound: 5,
          payload: {},
        },
        {
          id: 'oa-null',
          kind: '__sentinel_2b_0__',
          participantId: 'alice',
          raisedAtRound: 3,
          raisedByIntentId: 'x',
          expiresAtRound: null,
          payload: {},
        },
      ],
    };
    const result = applyIntent(s, intent('EndRound', {}));
    const remainingIds = result.state.openActions.map((o) => o.id);
    expect(remainingIds).toEqual(['oa-later', 'oa-null']);
  });
});

describe('applyStartTurn per-turn heroic resource gain', () => {
  function pcWithResource(opts: {
    id: string;
    resourceName: 'wrath' | 'piety' | 'essence' | 'ferocity' | 'discipline' | 'insight' | 'focus' | 'clarity' | 'drama';
    value: number;
    floor?: number;
  }): Participant {
    return {
      ...part(opts.id),
      heroicResources: [{ name: opts.resourceName, value: opts.value, floor: opts.floor ?? 0 }],
    };
  }

  function stateWith(pcs: Participant[]): CampaignState {
    const s = emptyCampaignState(campaignId, 'user-owner');
    return {
      ...s,
      participants: pcs,
      encounter: {
        id: 'enc_test',
        currentRound: 1,
        turnOrder: pcs.map((p) => p.id),
        activeParticipantId: null,
        turnState: {},
        malice: { current: 0, lastMaliciousStrikeRound: null },
      },
    };
  }

  it('flat-class (Censor wrath) gains +2 on turn start with no rolls payload', () => {
    const s = stateWith([pcWithResource({ id: 'censor', resourceName: 'wrath', value: 0 })]);
    const r = applyIntent(s, intent('StartTurn', { participantId: 'censor' }));
    expect(r.errors).toBeUndefined();
    const pc = r.state.participants.find((p) => isParticipant(p) && p.id === 'censor');
    expect(pc && isParticipant(pc) ? pc.heroicResources[0]?.value : null).toBe(2);
  });

  it('d3-class (Talent clarity) gains rolls.d3 on turn start', () => {
    const s = stateWith([pcWithResource({ id: 'talent', resourceName: 'clarity', value: 0, floor: -4 })]);
    const r = applyIntent(s, intent('StartTurn', { participantId: 'talent', rolls: { d3: 3 } }));
    expect(r.errors).toBeUndefined();
    const pc = r.state.participants.find((p) => isParticipant(p) && p.id === 'talent');
    expect(pc && isParticipant(pc) ? pc.heroicResources[0]?.value : null).toBe(3);
  });

  it('flat-class with rolls.d3 set → rejected (wrong_payload_shape)', () => {
    const s = stateWith([pcWithResource({ id: 'censor', resourceName: 'wrath', value: 0 })]);
    const r = applyIntent(s, intent('StartTurn', { participantId: 'censor', rolls: { d3: 2 } }));
    expect(r.errors?.[0]?.code).toBe('wrong_payload_shape');
  });

  it('d3-class with rolls.d3 missing → rejected (missing_dice)', () => {
    const s = stateWith([pcWithResource({ id: 'talent', resourceName: 'clarity', value: 0, floor: -4 })]);
    const r = applyIntent(s, intent('StartTurn', { participantId: 'talent' }));
    expect(r.errors?.[0]?.code).toBe('missing_dice');
  });

  it('d3 out of range (4) → rejected at schema layer', () => {
    const s = stateWith([pcWithResource({ id: 'talent', resourceName: 'clarity', value: 0, floor: -4 })]);
    const r = applyIntent(s, intent('StartTurn', { participantId: 'talent', rolls: { d3: 4 } }));
    expect(r.errors?.[0]?.code).toBe('invalid_payload');
  });

  it('gain is additive — does not zero existing value', () => {
    const s = stateWith([pcWithResource({ id: 'censor', resourceName: 'wrath', value: 5 })]);
    const r = applyIntent(s, intent('StartTurn', { participantId: 'censor' }));
    expect(r.errors).toBeUndefined();
    const pc = r.state.participants.find((p) => isParticipant(p) && p.id === 'censor');
    expect(pc && isParticipant(pc) ? pc.heroicResources[0]?.value : null).toBe(7);
  });

  it('Talent with negative clarity still gains normally (no clamp on gain)', () => {
    const s = stateWith([pcWithResource({ id: 'talent', resourceName: 'clarity', value: -2, floor: -4 })]);
    const r = applyIntent(s, intent('StartTurn', { participantId: 'talent', rolls: { d3: 2 } }));
    expect(r.errors).toBeUndefined();
    const pc = r.state.participants.find((p) => isParticipant(p) && p.id === 'talent');
    expect(pc && isParticipant(pc) ? pc.heroicResources[0]?.value : null).toBe(0);
  });
});

describe('applyStartTurn — turnActionUsage', () => {
  function stateWithPc(overrides: Partial<Participant> = {}): CampaignState {
    const pc: Participant = { ...part('pc-1'), ...overrides };
    const s = emptyCampaignState(campaignId, 'user-owner');
    return {
      ...s,
      participants: [pc],
      encounter: {
        id: 'enc-1',
        currentRound: 1,
        turnOrder: ['pc-1'],
        activeParticipantId: null,
        turnState: {},
        malice: { current: 0, lastMaliciousStrikeRound: null },
      },
    };
  }

  it("resets the turn-holder's turnActionUsage to all-false", () => {
    const s = stateWithPc({ turnActionUsage: { main: true, maneuver: true, move: true } });
    const r = applyIntent(s, intent('StartTurn', { participantId: 'pc-1' }));
    expect(r.errors).toBeUndefined();
    const p = r.state.participants.find((x) => isParticipant(x) && x.id === 'pc-1');
    expect(p && isParticipant(p) ? p.turnActionUsage : null).toEqual({
      main: false,
      maneuver: false,
      move: false,
    });
  });

  it('does not touch other participants turnActionUsage', () => {
    const pc1: Participant = { ...part('pc-1'), turnActionUsage: { main: true, maneuver: true, move: true } };
    const pc2: Participant = { ...part('pc-2'), turnActionUsage: { main: true, maneuver: false, move: true } };
    const s: CampaignState = {
      ...emptyCampaignState(campaignId, 'user-owner'),
      participants: [pc1, pc2],
      encounter: {
        id: 'enc-1',
        currentRound: 1,
        turnOrder: ['pc-1', 'pc-2'],
        activeParticipantId: null,
        turnState: {},
        malice: { current: 0, lastMaliciousStrikeRound: null },
      },
    };
    const r = applyIntent(s, intent('StartTurn', { participantId: 'pc-1' }));
    expect(r.errors).toBeUndefined();
    const p2 = r.state.participants.find((x) => isParticipant(x) && x.id === 'pc-2');
    expect(p2 && isParticipant(p2) ? p2.turnActionUsage : null).toEqual({
      main: true,
      maneuver: false,
      move: true,
    });
  });

  it('reset composes with heroic resource gain (flat class)', () => {
    const pc: Participant = {
      ...part('censor'),
      heroicResources: [{ name: 'wrath', value: 3, floor: 0 }],
      turnActionUsage: { main: true, maneuver: true, move: false },
    };
    const s: CampaignState = {
      ...emptyCampaignState(campaignId, 'user-owner'),
      participants: [pc],
      encounter: {
        id: 'enc-1',
        currentRound: 1,
        turnOrder: ['censor'],
        activeParticipantId: null,
        turnState: {},
        malice: { current: 0, lastMaliciousStrikeRound: null },
      },
    };
    const r = applyIntent(s, intent('StartTurn', { participantId: 'censor' }));
    expect(r.errors).toBeUndefined();
    const p = r.state.participants.find((x) => isParticipant(x) && x.id === 'censor');
    // Resource gain applied
    expect(p && isParticipant(p) ? p.heroicResources[0]?.value : null).toBe(5);
    // And turnActionUsage reset
    expect(p && isParticipant(p) ? p.turnActionUsage : null).toEqual({
      main: false,
      maneuver: false,
      move: false,
    });
  });
});
