import {
  defaultPerEncounterFlags,
  defaultPsionFlags,
  defaultTargetingRelations,
} from '@ironyard/shared';
import type { HeroClass, Participant } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import {
  type CampaignState,
  type ReducerContext,
  type StampedIntent,
  applyIntent,
  emptyCampaignState,
  isParticipant,
} from '../src/index';
import type { StaticDataBundle } from '../src/static-data';
import {
  buildBundleWithFury,
  buildEmptyBundle,
  buildFuryL1Fixture,
} from './fixtures/character-runtime';

const T = 1_700_000_000_000;
const CAMPAIGN = 'sess_start_enc';

function makeIntent(payload: unknown): StampedIntent {
  return {
    id: `i_${Math.random().toString(36).slice(2)}`,
    campaignId: CAMPAIGN,
    actor: { userId: 'user-owner', role: 'director' },
    timestamp: T,
    source: 'manual',
    type: 'StartEncounter',
    payload,
    causedBy: undefined,
  };
}

function baseState(overrides: Partial<CampaignState> = {}): CampaignState {
  return {
    ...emptyCampaignState(CAMPAIGN, 'user-owner'),
    currentSessionId: 'sess-test',
    ...overrides,
  };
}

describe('applyStartEncounter — new atomic payload shape', () => {
  it('materializes a PC from stampedPcs with ownerId and characterId', () => {
    const character = buildFuryL1Fixture();
    const ctx: ReducerContext = { staticData: buildBundleWithFury() };

    const result = applyIntent(
      baseState(),
      makeIntent({
        characterIds: ['c1'],
        monsters: [],
        stampedPcs: [{ characterId: 'c1', name: 'Hero', ownerId: 'user-1', character }],
        stampedMonsters: [],
      }),
      ctx,
    );

    expect(result.errors).toBeUndefined();
    expect(result.state.encounter).not.toBeNull();

    const pc = result.state.participants.find(
      (p): p is Participant => isParticipant(p) && p.kind === 'pc',
    );
    expect(pc).toBeDefined();
    expect(pc?.ownerId).toBe('user-1');
    expect(pc?.characterId).toBe('c1');
    expect(pc?.id).toBe('pc:c1');
  });

  it('applies persisted currentStamina from the character blob (clamped to max)', () => {
    const character = buildFuryL1Fixture({ currentStamina: 10 });
    const ctx: ReducerContext = { staticData: buildBundleWithFury() };

    const result = applyIntent(
      baseState(),
      makeIntent({
        characterIds: ['c1'],
        monsters: [],
        stampedPcs: [{ characterId: 'c1', name: 'Hero', ownerId: 'u1', character }],
        stampedMonsters: [],
      }),
      ctx,
    );

    const pc = result.state.participants.find(
      (p): p is Participant => isParticipant(p) && p.kind === 'pc',
    );
    expect(pc?.currentStamina).toBe(10);
  });

  it('uses derived maxStamina when character.currentStamina is null (fresh encounter)', () => {
    const character = buildFuryL1Fixture({ currentStamina: null });
    const ctx: ReducerContext = { staticData: buildBundleWithFury() };

    const result = applyIntent(
      baseState(),
      makeIntent({
        characterIds: ['c1'],
        monsters: [],
        stampedPcs: [{ characterId: 'c1', name: 'Hero', ownerId: 'u1', character }],
        stampedMonsters: [],
      }),
      ctx,
    );

    const pc = result.state.participants.find(
      (p): p is Participant => isParticipant(p) && p.kind === 'pc',
    );
    // buildBundleWithFury: startingStamina=21, staminaPerLevel=9, level=1 → maxStamina=21
    expect(pc?.currentStamina).toBe(21);
    expect(pc?.maxStamina).toBe(21);
  });

  it('applies recoveriesUsed to compute recoveries.current', () => {
    // 3 recoveries used out of 10 → 7 remaining
    const character = buildFuryL1Fixture({ recoveriesUsed: 3 });
    const ctx: ReducerContext = { staticData: buildBundleWithFury() };

    const result = applyIntent(
      baseState(),
      makeIntent({
        characterIds: ['c1'],
        monsters: [],
        stampedPcs: [{ characterId: 'c1', name: 'Hero', ownerId: 'u1', character }],
        stampedMonsters: [],
      }),
      ctx,
    );

    const pc = result.state.participants.find(
      (p): p is Participant => isParticipant(p) && p.kind === 'pc',
    );
    // buildBundleWithFury: recoveries = 10
    expect(pc?.recoveries.max).toBe(10);
    expect(pc?.recoveries.current).toBe(7);
  });

  it('materializes monsters from stampedMonsters (respects quantity)', () => {
    const monster = {
      id: 'goblin',
      name: 'Goblin',
      level: 1,
      roles: [],
      ancestry: [],
      ev: { ev: 2 },
      stamina: { base: 15 },
      speed: 5,
      movement: [],
      size: '1S',
      stability: 0,
      freeStrike: 2,
      characteristics: { might: 0, agility: 1, reason: -1, intuition: 0, presence: -1 },
      immunities: [],
      weaknesses: [],
      abilities: [],
    };

    const result = applyIntent(
      baseState(),
      makeIntent({
        characterIds: [],
        monsters: [{ monsterId: 'goblin', quantity: 3 }],
        stampedPcs: [],
        stampedMonsters: [{ monsterId: 'goblin', quantity: 3, monster }],
      }),
    );

    expect(result.errors).toBeUndefined();
    const monsters = result.state.participants.filter(
      (p): p is Participant => isParticipant(p) && p.kind === 'monster',
    );
    expect(monsters.map((m) => m.name)).toEqual(['Goblin 1', 'Goblin 2', 'Goblin 3']);
  });

  it('REPLACES the existing participant roster (no duplicate carry-over)', () => {
    const oldMonster: Participant = {
      id: 'old-monster-1',
      name: 'Old Orc',
      kind: 'monster',
      level: 3,
      currentStamina: 0,
      maxStamina: 40,
      characteristics: { might: 2, agility: 0, reason: -1, intuition: 0, presence: -1 },
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
    const s = baseState({ participants: [oldMonster] });

    const result = applyIntent(
      s,
      makeIntent({
        characterIds: [],
        monsters: [],
        stampedPcs: [],
        stampedMonsters: [],
      }),
    );

    expect(result.state.participants).toHaveLength(0);
  });

  it('rejects if an encounter is already active', () => {
    const s = baseState({
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
    });

    const result = applyIntent(
      s,
      makeIntent({ characterIds: [], monsters: [], stampedPcs: [], stampedMonsters: [] }),
    );

    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'encounter_already_active' })]),
    );
  });

  it('accepts an empty payload (no PCs, no monsters) — valid but empty encounter', () => {
    const result = applyIntent(
      baseState(),
      makeIntent({ characterIds: [], monsters: [], stampedPcs: [], stampedMonsters: [] }),
    );

    expect(result.errors).toBeUndefined();
    expect(result.state.encounter).not.toBeNull();
    expect(result.state.participants).toHaveLength(0);
  });

  it('seeds zipper-init fields to null/null/[] on a fresh encounter', () => {
    const result = applyIntent(
      baseState(),
      makeIntent({ characterIds: [], monsters: [], stampedPcs: [], stampedMonsters: [] }),
    );

    expect(result.state.encounter?.firstSide).toBeNull();
    expect(result.state.encounter?.currentPickingSide).toBeNull();
    expect(result.state.encounter?.actedThisRound).toEqual([]);
  });

  it('rejects with no_active_session when currentSessionId is null', () => {
    const result = applyIntent(
      baseState({ currentSessionId: null }),
      makeIntent({ characterIds: [], monsters: [], stampedPcs: [], stampedMonsters: [] }),
    );
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'no_active_session' })]),
    );
  });
});

// ── Helpers for resource preload tests ───────────────────────────────────────

function buildBundleWithClass(
  classId: string,
  heroicResource: string,
  characteristicArrays: number[][],
): StaticDataBundle {
  const bundle = buildEmptyBundle();
  bundle.classes.set(classId, {
    id: classId,
    name: classId,
    description: '',
    lockedCharacteristics: [],
    characteristicArrays,
    potencyCharacteristic: 'might',
    heroicResource,
    startingStamina: 20,
    staminaPerLevel: 8,
    recoveries: 8,
    startingSkillsNote: '',
    startingSkillCount: 0,
    startingSkillGroups: [],
    subclassLabel: 'Subclass',
    subclasses: [{ id: 'sub', name: 'Sub', description: '', skillGrant: null }],
    levels: Array.from({ length: 10 }, (_, i) => ({
      level: i + 1,
      featureNames: [],
      abilitySlots: [],
      grantsPerk: false,
      grantsSkill: false,
      grantsCharacteristicIncrease: false,
    })),
  } satisfies HeroClass);
  return bundle;
}

function makePcStamped(
  characterId: string,
  overrides: {
    classId?: string;
    victories?: number;
    characteristicArray?: number[];
    subclassId?: string;
  } = {},
) {
  const character = buildFuryL1Fixture({
    classId: overrides.classId ?? 'fury',
    victories: overrides.victories ?? 0,
    characteristicArray: overrides.characteristicArray,
    subclassId: overrides.subclassId ?? 'berserker',
  });
  return { characterId, name: `Hero-${characterId}`, ownerId: `owner-${characterId}`, character };
}

// ── StartEncounter heroic resource preload ────────────────────────────────────

describe('StartEncounter heroic resource preload', () => {
  it("seeds each PC's heroic resource pool from character.victories", () => {
    // Talent (clarity) with victories=4, Censor (wrath) with victories=2
    const talentBundle = buildBundleWithClass('talent', 'clarity', [[2, 0, 2, 0, 0]]);
    const censorBundle = buildBundleWithClass('censor', 'wrath', [[0, 1, -1, 1, 0]]);

    // Two separate StartEncounters so we can inspect each PC independently
    const talentStamped = {
      ...buildFuryL1Fixture({ victories: 4 }),
      classId: 'talent',
      subclassId: 'sub',
      // reason=2 (index 2 in characteristicArray)
      characteristicArray: [2, 0, 2, 0, 0] as [number, number, number, number, number],
    };
    const talentResult = applyIntent(
      baseState(),
      makeIntent({
        characterIds: ['t1'],
        monsters: [],
        stampedPcs: [
          { characterId: 't1', name: 'Talent', ownerId: 'u-t', character: talentStamped },
        ],
        stampedMonsters: [],
      }),
      { staticData: talentBundle },
    );
    const talentPc = talentResult.state.participants.find(
      (p): p is Participant => isParticipant(p) && p.kind === 'pc',
    );
    expect(talentPc?.heroicResources[0]?.name).toBe('clarity');
    expect(talentPc?.heroicResources[0]?.value).toBe(4);
    // reason=2 → floor = -(1+2) = -3
    expect(talentPc?.heroicResources[0]?.floor).toBe(-3);

    const censorStamped = {
      ...buildFuryL1Fixture({ victories: 2 }),
      classId: 'censor',
      subclassId: 'sub',
      characteristicArray: [0, 1, -1, 1, 0] as [number, number, number, number, number],
    };
    const censorResult = applyIntent(
      baseState(),
      makeIntent({
        characterIds: ['c1'],
        monsters: [],
        stampedPcs: [
          { characterId: 'c1', name: 'Censor', ownerId: 'u-c', character: censorStamped },
        ],
        stampedMonsters: [],
      }),
      { staticData: censorBundle },
    );
    const censorPc = censorResult.state.participants.find(
      (p): p is Participant => isParticipant(p) && p.kind === 'pc',
    );
    expect(censorPc?.heroicResources[0]?.name).toBe('wrath');
    expect(censorPc?.heroicResources[0]?.value).toBe(2);
    expect(censorPc?.heroicResources[0]?.floor).toBe(0);
  });

  it('sets clarity.floor to -(1 + reason)', () => {
    // Single Talent with reason=3
    const bundle = buildBundleWithClass('talent', 'clarity', [[2, 0, 3, 0, 0]]);
    const character = {
      ...buildFuryL1Fixture({ victories: 0 }),
      classId: 'talent',
      subclassId: 'sub',
      characteristicArray: [2, 0, 3, 0, 0] as [number, number, number, number, number],
    };
    const result = applyIntent(
      baseState(),
      makeIntent({
        characterIds: ['t1'],
        monsters: [],
        stampedPcs: [{ characterId: 't1', name: 'Talent', ownerId: 'u1', character }],
        stampedMonsters: [],
      }),
      { staticData: bundle },
    );
    const pc = result.state.participants.find(
      (p): p is Participant => isParticipant(p) && p.kind === 'pc',
    );
    expect(pc?.heroicResources[0]?.floor).toBe(-4); // -(1 + 3)
  });

  it('materializes participant.victories from character.victories', () => {
    // Single PC with victories=7
    const character = buildFuryL1Fixture({ victories: 7 });
    const result = applyIntent(
      baseState(),
      makeIntent({
        characterIds: ['c1'],
        monsters: [],
        stampedPcs: [{ characterId: 'c1', name: 'Hero', ownerId: 'u1', character }],
        stampedMonsters: [],
      }),
      { staticData: buildBundleWithFury() },
    );
    const pc = result.state.participants.find(
      (p): p is Participant => isParticipant(p) && p.kind === 'pc',
    );
    expect(pc?.victories).toBe(7);
  });

  it('gracefully yields heroicResources=[] for a PC with unknown class (no resource config)', () => {
    // Character with classId not present in staticData → runtime.heroicResource.name = 'unknown'
    const character = buildFuryL1Fixture({ victories: 3, classId: 'unknown-class' } as Parameters<
      typeof buildFuryL1Fixture
    >[0]);
    const result = applyIntent(
      baseState(),
      makeIntent({
        characterIds: ['c1'],
        monsters: [],
        stampedPcs: [{ characterId: 'c1', name: 'Mystery', ownerId: 'u1', character }],
        stampedMonsters: [],
      }),
      { staticData: buildEmptyBundle() },
    );
    const pc = result.state.participants.find(
      (p): p is Participant => isParticipant(p) && p.kind === 'pc',
    );
    expect(pc?.heroicResources).toEqual([]);
  });
});

// ── StartEncounter Malice generation ─────────────────────────────────────────

describe('StartEncounter Malice generation', () => {
  it('5 PCs with 3 victories each → malice = 3 + 5 + 1 = 9 (canon § 5.5 worked example)', () => {
    const ctx: ReducerContext = { staticData: buildBundleWithFury() };
    const stampedPcs = Array.from({ length: 5 }, (_, i) => ({
      characterId: `c${i + 1}`,
      name: `Hero ${i + 1}`,
      ownerId: `u${i + 1}`,
      character: buildFuryL1Fixture({ victories: 3 }),
    }));

    const result = applyIntent(
      baseState(),
      makeIntent({
        characterIds: stampedPcs.map((p) => p.characterId),
        monsters: [],
        stampedPcs,
        stampedMonsters: [],
      }),
      ctx,
    );

    expect(result.errors).toBeUndefined();
    expect(result.state.encounter?.malice.current).toBe(9);
  });

  it('leaves currentRound at 1 — UI must NOT also dispatch StartRound (would bump to 2)', () => {
    // Regression for the EncounterBuilder bug where StartEncounter was
    // immediately followed by StartRound. Engine contract: StartEncounter
    // alone leaves you at round 1 with round-1 Malice applied. A follow-up
    // StartRound would bump to round 2 and double-tick Malice. See the
    // comment in packages/rules/src/intents/turn.ts: "Round 1 is applied at
    // StartEncounter time; rounds 2+ apply here."
    const ctx: ReducerContext = { staticData: buildBundleWithFury() };
    const stampedPcs = Array.from({ length: 5 }, (_, i) => ({
      characterId: `c${i + 1}`,
      name: `Hero ${i + 1}`,
      ownerId: `u${i + 1}`,
      character: buildFuryL1Fixture({ victories: 3 }),
    }));

    const result = applyIntent(
      baseState(),
      makeIntent({
        characterIds: stampedPcs.map((p) => p.characterId),
        monsters: [],
        stampedPcs,
        stampedMonsters: [],
      }),
      ctx,
    );

    expect(result.errors).toBeUndefined();
    expect(result.state.encounter?.currentRound).toBe(1);
    expect(result.state.encounter?.malice.current).toBe(9); // 3 + 5 + 1
  });

  it('empty PC roster → malice 0 + 0 + 1 = 1 (formula yields, no special case)', () => {
    const monster = {
      id: 'goblin',
      name: 'Goblin',
      level: 1,
      roles: [],
      ancestry: [],
      ev: { ev: 2 },
      stamina: { base: 15 },
      speed: 5,
      movement: [],
      size: '1S',
      stability: 0,
      freeStrike: 2,
      characteristics: { might: 0, agility: 1, reason: -1, intuition: 0, presence: -1 },
      immunities: [],
      weaknesses: [],
      abilities: [],
    };

    const result = applyIntent(
      baseState(),
      makeIntent({
        characterIds: [],
        monsters: [{ monsterId: 'goblin', quantity: 1 }],
        stampedPcs: [],
        stampedMonsters: [{ monsterId: 'goblin', quantity: 1, monster }],
      }),
    );

    expect(result.errors).toBeUndefined();
    expect(result.state.encounter?.malice.current).toBe(1);
  });
});
