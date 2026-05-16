import { describe, expect, it } from 'vitest';
import { ParticipantSchema } from '../src/participant';
import { defaultPerEncounterFlags, defaultPsionFlags } from '../src';

describe('ParticipantSchema.turnActionUsage', () => {
  it('defaults to all-false when omitted', () => {
    const parsed = ParticipantSchema.parse({
      id: 'p1',
      name: 'Mira',
      kind: 'pc',
      currentStamina: 10,
      maxStamina: 20,
      characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
    });
    expect(parsed.turnActionUsage).toEqual({ main: false, maneuver: false, move: false });
  });

  it('preserves explicit values', () => {
    const parsed = ParticipantSchema.parse({
      id: 'p1',
      name: 'Mira',
      kind: 'pc',
      currentStamina: 10,
      maxStamina: 20,
      characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
      turnActionUsage: { main: true, maneuver: false, move: true },
    });
    expect(parsed.turnActionUsage).toEqual({ main: true, maneuver: false, move: true });
  });
});

describe('ParticipantSchema slice-1 additions', () => {
  const base = {
    id: 'p1',
    name: 'Korva',
    kind: 'pc' as const,
    level: 5,
    currentStamina: 30,
    maxStamina: 30,
    characteristics: { might: 2, agility: 1, reason: 0, intuition: 0, presence: 0 },
  };

  it('defaults staminaState to "healthy"', () => {
    const p = ParticipantSchema.parse(base);
    expect(p.staminaState).toBe('healthy');
  });

  it('defaults staminaOverride to null', () => {
    const p = ParticipantSchema.parse(base);
    expect(p.staminaOverride).toBeNull();
  });

  it('defaults bodyIntact to true', () => {
    const p = ParticipantSchema.parse(base);
    expect(p.bodyIntact).toBe(true);
  });

  it('defaults triggeredActionUsedThisRound to false', () => {
    const p = ParticipantSchema.parse(base);
    expect(p.triggeredActionUsedThisRound).toBe(false);
  });

  it('accepts negative currentStamina (dying hero)', () => {
    const p = ParticipantSchema.parse({ ...base, currentStamina: -5 });
    expect(p.currentStamina).toBe(-5);
  });

  it('accepts a populated staminaOverride', () => {
    const p = ParticipantSchema.parse({
      ...base,
      staminaState: 'doomed',
      staminaOverride: {
        kind: 'doomed',
        source: 'hakaan-doomsight',
        canRegainStamina: true,
        autoTier3OnPowerRolls: true,
        staminaDeathThreshold: 'none',
        dieAtEncounterEnd: true,
      },
    });
    expect(p.staminaOverride?.kind).toBe('doomed');
  });
});

describe('ParticipantSchema — targetingRelations', () => {
  it('defaults targetingRelations to three empty arrays when omitted', () => {
    const base = {
      id: 'p1',
      name: 'Aldric',
      kind: 'pc' as const,
      currentStamina: 20,
      maxStamina: 20,
      characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
    };
    const parsed = ParticipantSchema.parse(base);
    expect(parsed.targetingRelations).toEqual({ judged: [], marked: [], nullField: [] });
  });
  it('round-trips populated targetingRelations', () => {
    const base = {
      id: 'p1',
      name: 'Aldric',
      kind: 'pc' as const,
      currentStamina: 20,
      maxStamina: 20,
      characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
      targetingRelations: { judged: ['goblin-a'], marked: [], nullField: ['goblin-b'] },
    };
    const parsed = ParticipantSchema.parse(base);
    expect(parsed.targetingRelations.judged).toEqual(['goblin-a']);
    expect(parsed.targetingRelations.nullField).toEqual(['goblin-b']);
  });
});

describe('Participant — slice 2a additions', () => {
  const base = {
    id: 'p1',
    name: 'Korva',
    kind: 'pc' as const,
    level: 5,
    currentStamina: 30,
    maxStamina: 30,
    characteristics: { might: 2, agility: 1, reason: 0, intuition: 0, presence: 0 },
  };

  it('defaults the new slice-2a fields correctly on a minimal PC', () => {
    const minimal = ParticipantSchema.parse(base);
    expect(minimal.perEncounterFlags).toEqual(defaultPerEncounterFlags());
    expect(minimal.posthumousDramaEligible).toBe(false);
    expect(minimal.psionFlags).toEqual(defaultPsionFlags());
    expect(minimal.maintainedAbilities).toEqual([]);
  });

  it('round-trips populated values for the slice-2a fields', () => {
    const populated = ParticipantSchema.parse({
      ...base,
      perEncounterFlags: {
        perTurn: {
          entries: [
            { scopedToTurnOf: 'p1', key: 'damageDealtThisTurn', value: true },
          ],
        },
        perRound: {
          tookDamage: true,
          judgedTargetDamagedMe: false,
          damagedJudgedTarget: false,
          markedTargetDamagedByAnyone: false,
          dealtSurgeDamage: false,
          directorSpentMalice: false,
          creatureForceMoved: false,
        },
        perEncounter: {
          firstTimeWindedTriggered: true,
          firstTimeDyingTriggered: false,
          troubadourThreeHeroesTriggered: false,
          troubadourAnyHeroWindedTriggered: false,
          troubadourReviveOARaised: false,
        },
      },
      posthumousDramaEligible: true,
      psionFlags: { clarityDamageOptOutThisTurn: true },
      maintainedAbilities: [
        { abilityId: 'elementalist-storm-aegis', costPerTurn: 2, startedAtRound: 2 },
      ],
    });

    expect(populated.perEncounterFlags.perTurn.entries).toEqual([
      { scopedToTurnOf: 'p1', key: 'damageDealtThisTurn', value: true },
    ]);
    expect(populated.perEncounterFlags.perRound.tookDamage).toBe(true);
    expect(populated.perEncounterFlags.perEncounter.firstTimeWindedTriggered).toBe(true);
    expect(populated.posthumousDramaEligible).toBe(true);
    expect(populated.psionFlags).toEqual({ clarityDamageOptOutThisTurn: true });
    expect(populated.maintainedAbilities).toEqual([
      { abilityId: 'elementalist-storm-aegis', costPerTurn: 2, startedAtRound: 2 },
    ]);
  });
});
