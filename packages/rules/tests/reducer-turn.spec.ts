import {
  defaultPerEncounterFlags,
  defaultPsionFlags,
  defaultTargetingRelations,
} from '@ironyard/shared';
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
    surprised: false,
    role: null,
    ancestry: [],
    size: null,
    speed: null,
    stability: null,
    freeStrike: null,
    ev: null,
    withCaptain: null,
    className: null,
    staminaState: 'healthy',
    staminaOverride: null,
    bodyIntact: true,
    triggeredActionUsedThisRound: false,
    perEncounterFlags: defaultPerEncounterFlags(),
    posthumousDramaEligible: false,
    psionFlags: defaultPsionFlags(),
    maintainedAbilities: [],
    purchasedTraits: [],
    equippedTitleIds: [],
    targetingRelations: defaultTargetingRelations(),
    movementMode: null,
    bloodfireActive: false,
    conditionImmunities: [],
    disengageBonus: 0,
    meleeDistanceBonus: 0,
    rangedDistanceBonus: 0,
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
      activeParticipantId: null,
      turnState: {},
      malice: { current: 0, lastMaliciousStrikeRound: null },
      firstSide: 'heroes',
      currentPickingSide: 'heroes',
      actedThisRound: [],
      pendingTriggers: null,
      perEncounterFlags: { perTurn: { heroesActedThisTurn: [] } },
    },
  };
}

describe('StartRound / EndRound', () => {
  function withOrder(): CampaignState {
    return readyState();
  }

  it('StartRound increments currentRound and sets currentPickingSide to firstSide', () => {
    // StartEncounter already sets currentRound to 1; StartRound advances to 2.
    // Zipper initiative: StartRound no longer auto-activates first participant;
    // it resets currentPickingSide to firstSide so the director can pick.
    const r = applyIntent(withOrder(), intent('StartRound', {}));
    expect(r.errors).toBeUndefined();
    expect(r.state.encounter?.currentRound).toBe(2);
    expect(r.state.encounter?.currentPickingSide).toBe('heroes');
    expect(r.state.encounter?.activeParticipantId).toBeNull();
  });

  it('StartRound a second time increments by 1 again and resets pick state', () => {
    let s = applyIntent(withOrder(), intent('StartRound', {})).state; // round 2
    s = applyIntent(s, intent('EndRound', {})).state;
    const r = applyIntent(s, intent('StartRound', {}));
    expect(r.state.encounter?.currentRound).toBe(3);
    expect(r.state.encounter?.currentPickingSide).toBe('heroes');
    expect(r.state.encounter?.activeParticipantId).toBeNull();
  });

  it('StartRound with no participants leaves activeParticipantId null', () => {
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

  it('EndTurn clears activeParticipantId (zipper: director picks next via PickNextActor)', () => {
    // Under zipper initiative, EndTurn no longer auto-advances the participant;
    // it clears activeParticipantId and derives currentPickingSide.
    // All 3 participants are PCs (heroes); foes side is empty, so run-out rule
    // keeps currentPickingSide on 'heroes'.
    const r = applyIntent(inRoundOne(), intent('EndTurn', {}));
    expect(r.errors).toBeUndefined();
    expect(r.state.encounter?.activeParticipantId).toBeNull();
    expect(r.state.encounter?.currentPickingSide).toBe('heroes');
  });

  it('EndTurn always clears activeParticipantId regardless of position in order', () => {
    // Old assertion was "parks at null when last in order"; now it always parks.
    const s = applyIntent(inRoundOne(), intent('StartTurn', { participantId: 'cleric' })).state;
    const r = applyIntent(s, intent('EndTurn', {}));
    expect(r.state.encounter?.activeParticipantId).toBeNull();
    expect(r.state.encounter?.currentPickingSide).toBe('heroes');
  });

  it('full round walkthrough (zipper): StartRound → EndTurn × 3 → null × 3 → EndRound', () => {
    // Under zipper initiative each EndTurn clears activeParticipantId and
    // currentPickingSide reflects who picks next. actedThisRound is not updated
    // by EndTurn itself (PickNextActor updates it); so after each EndTurn the
    // unacted counts remain the same — run-out rule: all-heroes roster keeps
    // currentPickingSide on 'heroes'.
    let s = inRoundOne(); // round 2 after StartRound
    // StartRound no longer auto-activates; it sets currentPickingSide so the director picks.
    expect(s.encounter?.activeParticipantId).toBeNull();
    expect(s.encounter?.currentPickingSide).toBe('heroes');

    // Director picks alice via StartTurn (PickNextActor wires this in full flow).
    s = applyIntent(s, intent('StartTurn', { participantId: 'alice' })).state;
    s = applyIntent(s, intent('EndTurn', {})).state;
    expect(s.encounter?.activeParticipantId).toBeNull();
    expect(s.encounter?.currentPickingSide).toBe('heroes');

    // Simulate director picking bob via StartTurn (PickNextActor wires this in full flow).
    s = applyIntent(s, intent('StartTurn', { participantId: 'bob' })).state;
    s = applyIntent(s, intent('EndTurn', {})).state;
    expect(s.encounter?.activeParticipantId).toBeNull();
    expect(s.encounter?.currentPickingSide).toBe('heroes');

    s = applyIntent(s, intent('StartTurn', { participantId: 'cleric' })).state;
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
    // Kill one PC. Phase 2b 2b.15 lifted the alive predicate from
    // `currentStamina > -windedValue` to `staminaState !== 'dead'`, so the
    // formal state machine is the source of truth.
    const dead = s.participants.find((p) => isParticipant(p) && p.kind === 'pc');
    if (dead) {
      (dead as Participant).currentStamina = -100;
      (dead as Participant).staminaState = 'dead';
    }
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
    s = {
      ...s,
      encounter: { ...s.encounter!, currentRound: 3 },
      openActions: [
        {
          id: 'oa-now',
          kind: 'title-doomed-opt-in',
          participantId: 'alice',
          raisedAtRound: 3,
          raisedByIntentId: 'x',
          expiresAtRound: 3,
          payload: {},
        },
        {
          id: 'oa-later',
          kind: 'title-doomed-opt-in',
          participantId: 'alice',
          raisedAtRound: 3,
          raisedByIntentId: 'x',
          expiresAtRound: 5,
          payload: {},
        },
        {
          id: 'oa-null',
          kind: 'title-doomed-opt-in',
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
    resourceName:
      | 'wrath'
      | 'piety'
      | 'essence'
      | 'ferocity'
      | 'discipline'
      | 'insight'
      | 'focus'
      | 'clarity'
      | 'drama';
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
        activeParticipantId: null,
        turnState: {},
        malice: { current: 0, lastMaliciousStrikeRound: null },
        firstSide: null,
        currentPickingSide: null,
        actedThisRound: [],
        pendingTriggers: null,
        perEncounterFlags: { perTurn: { heroesActedThisTurn: [] } },
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
    const s = stateWith([
      pcWithResource({ id: 'talent', resourceName: 'clarity', value: 0, floor: -4 }),
    ]);
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
    const s = stateWith([
      pcWithResource({ id: 'talent', resourceName: 'clarity', value: 0, floor: -4 }),
    ]);
    const r = applyIntent(s, intent('StartTurn', { participantId: 'talent' }));
    expect(r.errors?.[0]?.code).toBe('missing_dice');
  });

  it('d3 out of range (4) → rejected at schema layer', () => {
    const s = stateWith([
      pcWithResource({ id: 'talent', resourceName: 'clarity', value: 0, floor: -4 }),
    ]);
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
    const s = stateWith([
      pcWithResource({ id: 'talent', resourceName: 'clarity', value: -2, floor: -4 }),
    ]);
    const r = applyIntent(s, intent('StartTurn', { participantId: 'talent', rolls: { d3: 2 } }));
    expect(r.errors).toBeUndefined();
    const pc = r.state.participants.find((p) => isParticipant(p) && p.id === 'talent');
    expect(pc && isParticipant(pc) ? pc.heroicResources[0]?.value : null).toBe(0);
  });
});

describe('EndTurn (zipper-init)', () => {
  function stateWith(
    picking: 'heroes' | 'foes',
    acted: string[],
    active: string | null,
  ): CampaignState {
    const s = readyState(['alice', 'bob']); // 2 PCs
    // Add a monster to give us a foes side too. readyState's `part()` makes PCs;
    // mutate one to monster.
    const goblin: Participant = {
      ...(s.participants[0] as Participant),
      id: 'goblin',
      kind: 'monster',
      name: 'goblin',
    };
    const next: CampaignState = {
      ...s,
      participants: [...s.participants, goblin],
      encounter: {
        ...(s.encounter as NonNullable<CampaignState['encounter']>),
        firstSide: 'heroes' as const,
        currentPickingSide: picking,
        actedThisRound: acted,
        activeParticipantId: active,
      },
    };
    return next;
  }

  it('clears activeParticipantId and flips to the other side when both sides have unacted', () => {
    const s = stateWith('heroes', ['alice'], 'alice');
    const r = applyIntent(s, intent('EndTurn', {}));
    expect(r.errors).toBeUndefined();
    expect(r.state.encounter?.activeParticipantId).toBeNull();
    expect(r.state.encounter?.currentPickingSide).toBe('foes');
  });

  it('stays on the same side when the other side is exhausted (run-out rule)', () => {
    // alice and bob remain on heroes; goblin already acted.
    const s = stateWith('foes', ['goblin'], 'goblin');
    const r = applyIntent(s, intent('EndTurn', {}));
    expect(r.errors).toBeUndefined();
    expect(r.state.encounter?.currentPickingSide).toBe('heroes');
  });

  it('returns currentPickingSide null when both sides are exhausted', () => {
    const s = stateWith('foes', ['alice', 'bob', 'goblin'], 'goblin');
    const r = applyIntent(s, intent('EndTurn', {}));
    expect(r.errors).toBeUndefined();
    expect(r.state.encounter?.currentPickingSide).toBeNull();
  });
});

describe('StartRound (zipper-init)', () => {
  it('rounds 2+ reset currentPickingSide to firstSide and clear actedThisRound', () => {
    const base = readyState(['alice', 'bob']);
    // Force into "round 1 ended" state with heroes having won.
    const s: CampaignState = {
      ...base,
      encounter: {
        ...(base.encounter as NonNullable<CampaignState['encounter']>),
        firstSide: 'heroes',
        currentPickingSide: null,
        actedThisRound: ['alice', 'bob'],
        activeParticipantId: null,
        currentRound: 1,
      },
    };
    const r = applyIntent(s, intent('StartRound', {}));
    expect(r.errors).toBeUndefined();
    expect(r.state.encounter?.currentRound).toBe(2);
    expect(r.state.encounter?.currentPickingSide).toBe('heroes');
    expect(r.state.encounter?.actedThisRound).toEqual([]);
  });
});

describe('EndRound (zipper-init)', () => {
  it('clears surprised on every participant at end of round 1', () => {
    const base = readyState(['alice']);
    const s: CampaignState = {
      ...base,
      participants: base.participants.map((p) =>
        isParticipant(p) ? { ...p, surprised: true } : p,
      ),
      encounter: {
        ...(base.encounter as NonNullable<CampaignState['encounter']>),
        currentRound: 1,
      },
    };
    const r = applyIntent(s, intent('EndRound', {}));
    expect(r.errors).toBeUndefined();
    const alice = r.state.participants[0] as Participant;
    expect(alice.surprised).toBe(false);
  });

  it('leaves surprised alone on rounds > 1 (already cleared earlier)', () => {
    const base = readyState(['alice']);
    const s: CampaignState = {
      ...base,
      participants: base.participants.map((p) =>
        isParticipant(p) ? { ...p, surprised: true } : p,
      ),
      encounter: {
        ...(base.encounter as NonNullable<CampaignState['encounter']>),
        currentRound: 2,
      },
    };
    const r = applyIntent(s, intent('EndRound', {}));
    expect(r.errors).toBeUndefined();
    // round-2 surprise is a defensive-no-op; the field stays as-is.
    expect((r.state.participants[0] as Participant).surprised).toBe(true);
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
        activeParticipantId: null,
        turnState: {},
        malice: { current: 0, lastMaliciousStrikeRound: null },
        firstSide: null,
        currentPickingSide: null,
        actedThisRound: [],
        pendingTriggers: null,
        perEncounterFlags: { perTurn: { heroesActedThisTurn: [] } },
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
    const pc1: Participant = {
      ...part('pc-1'),
      turnActionUsage: { main: true, maneuver: true, move: true },
    };
    const pc2: Participant = {
      ...part('pc-2'),
      turnActionUsage: { main: true, maneuver: false, move: true },
    };
    const s: CampaignState = {
      ...emptyCampaignState(campaignId, 'user-owner'),
      participants: [pc1, pc2],
      encounter: {
        id: 'enc-1',
        currentRound: 1,
        activeParticipantId: null,
        turnState: {},
        malice: { current: 0, lastMaliciousStrikeRound: null },
        firstSide: null,
        currentPickingSide: null,
        actedThisRound: [],
        pendingTriggers: null,
        perEncounterFlags: { perTurn: { heroesActedThisTurn: [] } },
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
        activeParticipantId: null,
        turnState: {},
        malice: { current: 0, lastMaliciousStrikeRound: null },
        firstSide: null,
        currentPickingSide: null,
        actedThisRound: [],
        pendingTriggers: null,
        perEncounterFlags: { perTurn: { heroesActedThisTurn: [] } },
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

// Pass 3 Slice 1 — Task 15b: EndRound resets triggeredActionUsedThisRound (canon §4.10)
describe('applyEndRound — Pass 3 Slice 1 triggeredActionUsedThisRound reset', () => {
  it('resets triggeredActionUsedThisRound to false on every participant regardless of prior value', () => {
    const participants = [
      { ...part('alice'), triggeredActionUsedThisRound: true },
      { ...part('bob'), triggeredActionUsedThisRound: true },
      { ...part('carol'), triggeredActionUsedThisRound: false },
    ];
    const s: CampaignState = {
      ...emptyCampaignState(campaignId, 'user-owner'),
      participants,
      encounter: {
        id: 'enc_test',
        currentRound: 2,
        activeParticipantId: null,
        turnState: {},
        malice: { current: 0, lastMaliciousStrikeRound: null },
        firstSide: null,
        currentPickingSide: null,
        actedThisRound: [],
        pendingTriggers: null,
        perEncounterFlags: { perTurn: { heroesActedThisTurn: [] } },
      },
    };

    const r = applyIntent(s, intent('EndRound', {}));
    expect(r.errors).toBeUndefined();
    for (const entry of r.state.participants) {
      if (isParticipant(entry)) {
        expect(entry.triggeredActionUsedThisRound).toBe(false);
      }
    }
  });

  it('preserves surprise-clearing on round 1 (pre-existing behavior)', () => {
    const participants = [
      { ...part('alice'), surprised: true, triggeredActionUsedThisRound: true },
      { ...part('bob'), surprised: false, triggeredActionUsedThisRound: true },
    ];
    const s: CampaignState = {
      ...emptyCampaignState(campaignId, 'user-owner'),
      participants,
      encounter: {
        id: 'enc_round1',
        currentRound: 1,
        activeParticipantId: null,
        turnState: {},
        malice: { current: 0, lastMaliciousStrikeRound: null },
        firstSide: null,
        currentPickingSide: null,
        actedThisRound: [],
        pendingTriggers: null,
        perEncounterFlags: { perTurn: { heroesActedThisTurn: [] } },
      },
    };

    const r = applyIntent(s, intent('EndRound', {}));
    expect(r.errors).toBeUndefined();
    // Surprise cleared on round 1
    for (const entry of r.state.participants) {
      if (isParticipant(entry)) {
        expect(entry.surprised).toBe(false);
        // triggeredActionUsedThisRound also reset
        expect(entry.triggeredActionUsedThisRound).toBe(false);
      }
    }
  });

  it('preserves OpenAction expiry on EndRound (pre-existing behavior)', () => {
    const s: CampaignState = {
      ...emptyCampaignState(campaignId, 'user-owner'),
      participants: [{ ...part('alice'), triggeredActionUsedThisRound: true }],
      openActions: [
        {
          id: 'oa_1',
          kind: 'title-doomed-opt-in' as const,
          participantId: 'alice',
          raisedAtRound: 1,
          raisedByIntentId: 'i_raise_1',
          expiresAtRound: 2,
          payload: {},
        },
      ],
      encounter: {
        id: 'enc_test',
        currentRound: 2,
        activeParticipantId: null,
        turnState: {},
        malice: { current: 0, lastMaliciousStrikeRound: null },
        firstSide: null,
        currentPickingSide: null,
        actedThisRound: [],
        pendingTriggers: null,
        perEncounterFlags: { perTurn: { heroesActedThisTurn: [] } },
      },
    };

    const r = applyIntent(s, intent('EndRound', {}));
    expect(r.errors).toBeUndefined();
    // OpenAction that expires at round 2 is gone
    expect(r.state.openActions).toHaveLength(0);
    // triggeredActionUsedThisRound also reset
    const alice = r.state.participants.find((p) => isParticipant(p) && p.id === 'alice');
    expect(alice && isParticipant(alice) ? alice.triggeredActionUsedThisRound : undefined).toBe(
      false,
    );
  });
});
