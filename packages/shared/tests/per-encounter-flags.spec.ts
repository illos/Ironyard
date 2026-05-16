import { describe, expect, it } from 'vitest';
import {
  PerEncounterFlagsSchema,
  PerTurnFlagKeySchema,
  defaultPerEncounterFlags,
  defaultPerRoundFlags,
  defaultPerEncounterLatches,
} from '../src/per-encounter-flags';

describe('PerEncounterFlagsSchema', () => {
  it('parses an empty default', () => {
    const parsed = PerEncounterFlagsSchema.parse(defaultPerEncounterFlags());
    expect(parsed.perTurn.entries).toEqual([]);
    expect(parsed.perRound.tookDamage).toBe(false);
    expect(parsed.perEncounter.firstTimeWindedTriggered).toBe(false);
  });

  it('parses with populated perTurn entries', () => {
    const parsed = PerEncounterFlagsSchema.parse({
      perTurn: {
        entries: [
          { scopedToTurnOf: 'pc-fury', key: 'damageDealtThisTurn', value: true },
          { scopedToTurnOf: 'pc-fury', key: 'forcedMovementApplied', value: 1 },
          { scopedToTurnOf: 'pc-shadow', key: 'teleportedAdjacentToThisTurn', value: ['enemy-1', 'enemy-2'] },
        ],
      },
      perRound: defaultPerRoundFlags(),
      perEncounter: defaultPerEncounterLatches(),
    });
    expect(parsed.perTurn.entries).toHaveLength(3);
  });

  it('parses with perRound latches set', () => {
    const parsed = PerEncounterFlagsSchema.parse({
      perTurn: { entries: [] },
      perRound: { ...defaultPerRoundFlags(), tookDamage: true, damagedJudgedTarget: true },
      perEncounter: defaultPerEncounterLatches(),
    });
    expect(parsed.perRound.tookDamage).toBe(true);
    expect(parsed.perRound.damagedJudgedTarget).toBe(true);
    expect(parsed.perRound.judgedTargetDamagedMe).toBe(false);
  });

  it('parses with Slice 2a Task 13 spatial-OA perRound latches set', () => {
    const parsed = PerEncounterFlagsSchema.parse({
      perTurn: { entries: [] },
      perRound: {
        ...defaultPerRoundFlags(),
        allyHeroicWithin10Triggered: true,
        nullFieldEnemyMainTriggered: true,
        elementalistDamageWithin10Triggered: true,
      },
      perEncounter: defaultPerEncounterLatches(),
    });
    expect(parsed.perRound.allyHeroicWithin10Triggered).toBe(true);
    expect(parsed.perRound.nullFieldEnemyMainTriggered).toBe(true);
    expect(parsed.perRound.elementalistDamageWithin10Triggered).toBe(true);
  });

  it('defaultPerRoundFlags returns every canon key set to false', () => {
    const flags = defaultPerRoundFlags();
    const expectedKeys = [
      'tookDamage',
      'judgedTargetDamagedMe',
      'damagedJudgedTarget',
      'markedTargetDamagedByAnyone',
      'dealtSurgeDamage',
      'directorSpentMalice',
      'creatureForceMoved',
      'allyHeroicWithin10Triggered',
      'nullFieldEnemyMainTriggered',
      'elementalistDamageWithin10Triggered',
    ] as const;
    expect(Object.keys(flags).sort()).toEqual([...expectedKeys].sort());
    for (const k of expectedKeys) {
      expect(flags[k]).toBe(false);
    }
  });

  it('parses with perEncounter latches set', () => {
    const parsed = PerEncounterFlagsSchema.parse({
      perTurn: { entries: [] },
      perRound: defaultPerRoundFlags(),
      perEncounter: { ...defaultPerEncounterLatches(), troubadourThreeHeroesTriggered: true },
    });
    expect(parsed.perEncounter.troubadourThreeHeroesTriggered).toBe(true);
  });

  it('rejects malformed perTurn entry (missing scopedToTurnOf)', () => {
    expect(() =>
      PerEncounterFlagsSchema.parse({
        perTurn: { entries: [{ key: 'damageDealtThisTurn', value: true }] },
        perRound: defaultPerRoundFlags(),
        perEncounter: defaultPerEncounterLatches(),
      }),
    ).toThrow();
  });

  it('rejects unknown perTurn key', () => {
    expect(() =>
      PerTurnFlagKeySchema.parse('nonsense'),
    ).toThrow();
  });

  it('accepts all 8 canon perTurn keys', () => {
    const keys = [
      'damageDealtThisTurn',
      'damageTakenThisTurn',
      'forcedMovementApplied',
      'usedJudgmentThisTurn',
      'movedViaAbilityThisTurn',
      'nullFieldTriggeredThisTurn',
      'teleportedAdjacentToThisTurn',
      'passedThroughSpaceThisTurn',
    ];
    for (const k of keys) {
      expect(() => PerTurnFlagKeySchema.parse(k)).not.toThrow();
    }
  });
});
