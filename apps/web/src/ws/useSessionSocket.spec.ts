import {
  IntentTypes,
  type MaliceState,
  type Participant,
  defaultPerEncounterFlags,
  defaultPsionFlags,
  defaultTargetingRelations,
} from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import { type ActiveEncounter, type RosterEntry, reflect } from './useSessionSocket';

// ────────────────────────────────────────────────────────────────────────────
// Test factories. The mirror's reflect() works at participant / encounter
// granularity; build the smallest valid Participant + ActiveEncounter possible
// without depending on schema defaults (which are applied at parse-time, not
// when callers construct literals).
// ────────────────────────────────────────────────────────────────────────────

function makePc(id: string, overrides: Partial<Participant> = {}): Participant {
  const base: Participant = {
    id,
    name: id,
    kind: 'pc',
    level: 1,
    currentStamina: 20,
    maxStamina: 20,
    characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
    immunities: [],
    weaknesses: [],
    conditions: [],
    heroicResources: [],
    extras: [],
    surges: 0,
    recoveries: { current: 8, max: 8 },
    recoveryValue: 5,
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
    stability: 0,
    freeStrike: 1,
    ev: 11,
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
    targetingRelations: defaultTargetingRelations(),
    purchasedTraits: [],
    equippedTitleIds: [],
  };
  return { ...base, ...overrides };
}

function makeEncounter(participants: RosterEntry[]): ActiveEncounter {
  const malice: MaliceState = { current: 0, lastMaliciousStrikeRound: null };
  return {
    encounterId: 'enc-1',
    participants,
    currentRound: 1,
    activeParticipantId: null,
    firstSide: null,
    currentPickingSide: null,
    actedThisRound: [],
    malice,
    pendingTriggers: null,
  };
}

function getPc(state: ActiveEncounter | null, id: string): Participant {
  if (!state) throw new Error('state is null');
  const p = state.participants.find((x) => x.id === id);
  if (!p) throw new Error(`participant ${id} not found`);
  return p as Participant;
}

// ────────────────────────────────────────────────────────────────────────────
// Slice 2a reflect tests
// ────────────────────────────────────────────────────────────────────────────

describe('reflect — Pass 3 Slice 2a intents', () => {
  it('StartMaintenance appends to participant.maintainedAbilities', () => {
    const prev = makeEncounter([makePc('p1')]);
    const next = reflect(prev, IntentTypes.StartMaintenance, {
      participantId: 'p1',
      abilityId: 'fire-elemental',
      costPerTurn: 2,
    });
    const p = getPc(next, 'p1');
    expect(p.maintainedAbilities).toHaveLength(1);
    expect(p.maintainedAbilities[0]).toMatchObject({
      abilityId: 'fire-elemental',
      costPerTurn: 2,
      startedAtRound: 1,
    });
  });

  it('StartMaintenance is idempotent on abilityId', () => {
    const prev = makeEncounter([
      makePc('p1', {
        maintainedAbilities: [{ abilityId: 'fire-elemental', costPerTurn: 2, startedAtRound: 1, targetId: null }],
      }),
    ]);
    const next = reflect(prev, IntentTypes.StartMaintenance, {
      participantId: 'p1',
      abilityId: 'fire-elemental',
      costPerTurn: 3, // different cost, but already maintained — no-op
    });
    const p = getPc(next, 'p1');
    expect(p.maintainedAbilities).toHaveLength(1);
    expect(p.maintainedAbilities[0]?.costPerTurn).toBe(2);
  });

  it('StopMaintenance filters from participant.maintainedAbilities', () => {
    const prev = makeEncounter([
      makePc('p1', {
        maintainedAbilities: [
          { abilityId: 'fire-elemental', costPerTurn: 2, startedAtRound: 1, targetId: null },
          { abilityId: 'water-shield', costPerTurn: 1, startedAtRound: 2, targetId: null },
        ],
      }),
    ]);
    const next = reflect(prev, IntentTypes.StopMaintenance, {
      participantId: 'p1',
      abilityId: 'fire-elemental',
    });
    const p = getPc(next, 'p1');
    expect(p.maintainedAbilities).toHaveLength(1);
    expect(p.maintainedAbilities[0]?.abilityId).toBe('water-shield');
  });

  it('TroubadourAutoRevive sets stamina to 1, drama to 0, clears latches, recomputes state', () => {
    const prev = makeEncounter([
      makePc('p1', {
        currentStamina: -10,
        staminaState: 'dead',
        posthumousDramaEligible: true,
        heroicResources: [{ name: 'drama', value: 35, floor: 0 }],
        perEncounterFlags: {
          ...defaultPerEncounterFlags(),
          perEncounter: {
            ...defaultPerEncounterFlags().perEncounter,
            troubadourReviveOARaised: true,
          },
        },
      }),
    ]);
    const next = reflect(prev, IntentTypes.TroubadourAutoRevive, {
      participantId: 'p1',
    });
    const p = getPc(next, 'p1');
    expect(p.currentStamina).toBe(1);
    expect(p.heroicResources[0]?.value).toBe(0);
    expect(p.posthumousDramaEligible).toBe(false);
    expect(p.perEncounterFlags.perEncounter.troubadourReviveOARaised).toBe(false);
    // recomputeStaminaState should put us back in 'winded' (1/20 = 5% ≤ 50%)
    // — strictly: not 'dead' anymore.
    expect(p.staminaState).not.toBe('dead');
  });

  it('SetParticipantPerEncounterLatch flips the named perEncounter latch', () => {
    const prev = makeEncounter([makePc('p1')]);
    const next = reflect(prev, IntentTypes.SetParticipantPerEncounterLatch, {
      participantId: 'p1',
      key: 'firstTimeWindedTriggered',
      value: true,
    });
    const p = getPc(next, 'p1');
    expect(p.perEncounterFlags.perEncounter.firstTimeWindedTriggered).toBe(true);
  });

  it('SetParticipantPerRoundFlag flips the named perRound flag', () => {
    const prev = makeEncounter([makePc('p1')]);
    const next = reflect(prev, IntentTypes.SetParticipantPerRoundFlag, {
      participantId: 'p1',
      key: 'tookDamage',
      value: true,
    });
    const p = getPc(next, 'p1');
    expect(p.perEncounterFlags.perRound.tookDamage).toBe(true);
  });

  it('SetParticipantPerTurnEntry appends a dedup-by-(scope,key) entry', () => {
    const prev = makeEncounter([makePc('p1')]);
    const once = reflect(prev, IntentTypes.SetParticipantPerTurnEntry, {
      participantId: 'p1',
      scopedToTurnOf: 'p1',
      key: 'damageDealtThisTurn',
      value: true,
    });
    // Re-emit the same (scope, key) with a different value — should dedup,
    // keeping only the latest entry.
    const twice = reflect(once, IntentTypes.SetParticipantPerTurnEntry, {
      participantId: 'p1',
      scopedToTurnOf: 'p1',
      key: 'damageDealtThisTurn',
      value: false,
    });
    const p = getPc(twice, 'p1');
    expect(p.perEncounterFlags.perTurn.entries).toHaveLength(1);
    expect(p.perEncounterFlags.perTurn.entries[0]).toMatchObject({
      scopedToTurnOf: 'p1',
      key: 'damageDealtThisTurn',
      value: false,
    });
  });

  it('SetParticipantPosthumousDramaEligible flips the latch', () => {
    const prev = makeEncounter([makePc('p1')]);
    const next = reflect(prev, IntentTypes.SetParticipantPosthumousDramaEligible, {
      participantId: 'p1',
      value: true,
    });
    const p = getPc(next, 'p1');
    expect(p.posthumousDramaEligible).toBe(true);
  });

  it('UseAbility with talentClarityDamageOptOutThisTurn sets psionFlags', () => {
    const prev = makeEncounter([makePc('p1')]);
    const next = reflect(prev, IntentTypes.UseAbility, {
      participantId: 'p1',
      abilityId: 'mind-spike',
      source: { kind: 'class', classId: 'talent' },
      duration: { kind: 'EoT' },
      talentClarityDamageOptOutThisTurn: true,
    });
    const p = getPc(next, 'p1');
    expect(p.psionFlags.clarityDamageOptOutThisTurn).toBe(true);
  });

  it('UseAbility without talentClarityDamageOptOutThisTurn leaves psionFlags unchanged', () => {
    const prev = makeEncounter([makePc('p1')]);
    const next = reflect(prev, IntentTypes.UseAbility, {
      participantId: 'p1',
      abilityId: 'cleave',
      source: { kind: 'class', classId: 'fury' },
      duration: { kind: 'EoT' },
    });
    const p = getPc(next, 'p1');
    expect(p.psionFlags.clarityDamageOptOutThisTurn).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// EndRound mirror — Task 25 semantics: reset perEncounterFlags.perRound ONLY.
// perTurn entries + perEncounter latches must survive. The Task 3 surgical fix
// (commit 74eeca7) removed an over-eager clobber on this branch — guard against
// regression here.
// ────────────────────────────────────────────────────────────────────────────

describe('reflect — EndRound resets perRound only (Task 25 / Task 3 PS)', () => {
  it('clears perEncounterFlags.perRound to defaults', () => {
    const prev = makeEncounter([
      makePc('p1', {
        perEncounterFlags: {
          ...defaultPerEncounterFlags(),
          perRound: {
            ...defaultPerEncounterFlags().perRound,
            tookDamage: true,
            dealtSurgeDamage: true,
          },
        },
      }),
    ]);
    const next = reflect(prev, IntentTypes.EndRound, {});
    const p = getPc(next, 'p1');
    expect(p.perEncounterFlags.perRound.tookDamage).toBe(false);
    expect(p.perEncounterFlags.perRound.dealtSurgeDamage).toBe(false);
  });

  it('preserves perEncounter latches', () => {
    const prev = makeEncounter([
      makePc('p1', {
        perEncounterFlags: {
          ...defaultPerEncounterFlags(),
          perEncounter: {
            ...defaultPerEncounterFlags().perEncounter,
            firstTimeWindedTriggered: true,
            troubadourReviveOARaised: true,
          },
        },
      }),
    ]);
    const next = reflect(prev, IntentTypes.EndRound, {});
    const p = getPc(next, 'p1');
    expect(p.perEncounterFlags.perEncounter.firstTimeWindedTriggered).toBe(true);
    expect(p.perEncounterFlags.perEncounter.troubadourReviveOARaised).toBe(true);
  });

  it('preserves perTurn entries', () => {
    const prev = makeEncounter([
      makePc('p1', {
        perEncounterFlags: {
          ...defaultPerEncounterFlags(),
          perTurn: {
            entries: [{ scopedToTurnOf: 'p1', key: 'damageDealtThisTurn', value: true }],
          },
        },
      }),
    ]);
    const next = reflect(prev, IntentTypes.EndRound, {});
    const p = getPc(next, 'p1');
    expect(p.perEncounterFlags.perTurn.entries).toHaveLength(1);
  });

  it('preserves slice-2a participant fields (no over-eager wipe)', () => {
    const prev = makeEncounter([
      makePc('p1', {
        posthumousDramaEligible: true,
        psionFlags: { clarityDamageOptOutThisTurn: true },
        maintainedAbilities: [{ abilityId: 'fire-elemental', costPerTurn: 2, startedAtRound: 1, targetId: null }],
      }),
    ]);
    const next = reflect(prev, IntentTypes.EndRound, {});
    const p = getPc(next, 'p1');
    expect(p.posthumousDramaEligible).toBe(true);
    expect(p.psionFlags.clarityDamageOptOutThisTurn).toBe(true);
    expect(p.maintainedAbilities).toHaveLength(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Pass 3 Slice 2b — SetTargetingRelation mirror
// ────────────────────────────────────────────────────────────────────────────

describe('reflect — Pass 3 Slice 2b SetTargetingRelation', () => {
  it('adds targetId to source.targetingRelations[kind] when present:true', () => {
    const prev = makeEncounter([makePc('censor-1'), makePc('goblin-a')]);
    const next = reflect(prev, IntentTypes.SetTargetingRelation, {
      sourceId: 'censor-1',
      relationKind: 'judged',
      targetId: 'goblin-a',
      present: true,
    });
    const censor = getPc(next, 'censor-1');
    expect(censor.targetingRelations.judged).toEqual(['goblin-a']);
    // other relation kinds untouched
    expect(censor.targetingRelations.marked).toEqual([]);
    expect(censor.targetingRelations.nullField).toEqual([]);
  });

  it('removes targetId when present:false', () => {
    const prev = makeEncounter([
      makePc('censor-1', {
        targetingRelations: { judged: ['goblin-a'], marked: [], nullField: [] },
      }),
      makePc('goblin-a'),
    ]);
    const next = reflect(prev, IntentTypes.SetTargetingRelation, {
      sourceId: 'censor-1',
      relationKind: 'judged',
      targetId: 'goblin-a',
      present: false,
    });
    const censor = getPc(next, 'censor-1');
    expect(censor.targetingRelations.judged).toEqual([]);
  });

  it('is idempotent when adding a targetId already present', () => {
    const prev = makeEncounter([
      makePc('censor-1', {
        targetingRelations: { judged: ['goblin-a'], marked: [], nullField: [] },
      }),
      makePc('goblin-a'),
    ]);
    const next = reflect(prev, IntentTypes.SetTargetingRelation, {
      sourceId: 'censor-1',
      relationKind: 'judged',
      targetId: 'goblin-a',
      present: true,
    });
    const censor = getPc(next, 'censor-1');
    expect(censor.targetingRelations.judged).toEqual(['goblin-a']);
  });

  it('is idempotent when removing a targetId not present', () => {
    const prev = makeEncounter([makePc('censor-1'), makePc('goblin-a')]);
    const next = reflect(prev, IntentTypes.SetTargetingRelation, {
      sourceId: 'censor-1',
      relationKind: 'judged',
      targetId: 'goblin-a',
      present: false,
    });
    const censor = getPc(next, 'censor-1');
    expect(censor.targetingRelations.judged).toEqual([]);
  });

  it('does not touch other participants', () => {
    const prev = makeEncounter([makePc('censor-1'), makePc('goblin-a')]);
    const next = reflect(prev, IntentTypes.SetTargetingRelation, {
      sourceId: 'censor-1',
      relationKind: 'judged',
      targetId: 'goblin-a',
      present: true,
    });
    const goblin = getPc(next, 'goblin-a');
    expect(goblin.targetingRelations.judged).toEqual([]);
  });

  it('supports marked relationKind', () => {
    const prev = makeEncounter([makePc('tactician-1'), makePc('goblin-a')]);
    const next = reflect(prev, IntentTypes.SetTargetingRelation, {
      sourceId: 'tactician-1',
      relationKind: 'marked',
      targetId: 'goblin-a',
      present: true,
    });
    const tactician = getPc(next, 'tactician-1');
    expect(tactician.targetingRelations.marked).toEqual(['goblin-a']);
  });
});
