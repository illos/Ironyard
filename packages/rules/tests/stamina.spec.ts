import type { Participant } from '@ironyard/shared';
import { defaultPerEncounterFlags, defaultPsionFlags } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import { applyTransitionSideEffects, recomputeStaminaState, wouldHitDead } from '../src/stamina';

function pc(overrides: Partial<Participant> = {}): Participant {
  return {
    id: 'p1',
    name: 'Korva',
    kind: 'pc',
    ownerId: 'u1',
    characterId: 'c1',
    level: 5,
    currentStamina: 30,
    maxStamina: 30,
    characteristics: { might: 2, agility: 1, reason: 0, intuition: 0, presence: 0 },
    immunities: [],
    weaknesses: [],
    conditions: [],
    heroicResources: [],
    extras: [],
    surges: 0,
    recoveries: { current: 8, max: 8 },
    recoveryValue: 10,
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
    className: 'Tactician',
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
    conditionImmunities: [],
    ...overrides,
  } as Participant;
}

function foe(overrides: Partial<Participant> = {}): Participant {
  return pc({
    id: 'f1',
    kind: 'monster',
    ownerId: null,
    characterId: null,
    className: null,
    ...overrides,
  });
}

describe('recomputeStaminaState — heroes', () => {
  it('healthy → healthy when stamina > windedValue', () => {
    const p = pc({ currentStamina: 20, maxStamina: 30 }); // windedValue = 15
    expect(recomputeStaminaState(p).newState).toBe('healthy');
  });

  it('healthy → winded when stamina ≤ windedValue but > 0', () => {
    const p = pc({ currentStamina: 10, maxStamina: 30 });
    expect(recomputeStaminaState(p).newState).toBe('winded');
  });

  it('winded → dying when stamina ≤ 0 but > -windedValue', () => {
    const p = pc({ currentStamina: -5, maxStamina: 30, staminaState: 'winded' });
    expect(recomputeStaminaState(p).newState).toBe('dying');
  });

  it('dying → dead when stamina ≤ -windedValue', () => {
    const p = pc({ currentStamina: -20, maxStamina: 30, staminaState: 'dying' });
    expect(recomputeStaminaState(p).newState).toBe('dead');
  });

  it('marks transitioned=true when state changes', () => {
    const p = pc({ currentStamina: -5, maxStamina: 30, staminaState: 'healthy' });
    expect(recomputeStaminaState(p).transitioned).toBe(true);
  });

  it('marks transitioned=false when state is stable', () => {
    const p = pc({ currentStamina: 20, maxStamina: 30, staminaState: 'healthy' });
    expect(recomputeStaminaState(p).transitioned).toBe(false);
  });
});

describe('recomputeStaminaState — director creatures', () => {
  it('die at currentStamina ≤ 0 (no dying state)', () => {
    const f = foe({ currentStamina: 0, maxStamina: 30 });
    expect(recomputeStaminaState(f).newState).toBe('dead');
  });

  it('cannot enter dying', () => {
    const f = foe({ currentStamina: -5, maxStamina: 30 });
    expect(recomputeStaminaState(f).newState).toBe('dead');
  });
});

describe('recomputeStaminaState — overrides', () => {
  it('inert override holds state at "inert" while currentStamina ≤ -windedValue', () => {
    const p = pc({
      currentStamina: -20, // ≤ -windedValue (-15) — dead threshold
      maxStamina: 30,
      staminaOverride: {
        kind: 'inert',
        source: 'revenant',
        instantDeathDamageTypes: ['fire'],
        regainHours: 12,
        regainAmount: 'recoveryValue',
        canRegainStamina: false,
      },
    });
    expect(recomputeStaminaState(p).newState).toBe('inert');
  });

  it('rubble override holds state at "rubble" while currentStamina ≤ -windedValue', () => {
    const p = pc({
      currentStamina: -20,
      maxStamina: 30,
      staminaOverride: {
        kind: 'rubble',
        source: 'hakaan-doomsight',
        regainHours: 12,
        regainAmount: 'recoveryValue',
        canRegainStamina: false,
      },
    });
    expect(recomputeStaminaState(p).newState).toBe('rubble');
  });

  it('doomed (hakaan) override locks state regardless of stamina', () => {
    const p = pc({
      currentStamina: -100,
      maxStamina: 30,
      staminaOverride: {
        kind: 'doomed',
        source: 'hakaan-doomsight',
        canRegainStamina: true,
        autoTier3OnPowerRolls: true,
        staminaDeathThreshold: 'none',
        dieAtEncounterEnd: true,
      },
    });
    expect(recomputeStaminaState(p).newState).toBe('doomed');
  });

  it('doomed (title) override yields dead when stamina ≤ -staminaMax', () => {
    const p = pc({
      currentStamina: -30,
      maxStamina: 30,
      staminaOverride: {
        kind: 'doomed',
        source: 'title-doomed',
        canRegainStamina: false,
        autoTier3OnPowerRolls: true,
        staminaDeathThreshold: 'staminaMax',
        dieAtEncounterEnd: true,
      },
    });
    expect(recomputeStaminaState(p).newState).toBe('dead');
  });

  it('CoP extra-dying-trigger forces dying when recoveries exhausted', () => {
    const p = pc({
      currentStamina: 20, // healthy stamina, but...
      maxStamina: 30,
      recoveries: { current: 0, max: 8 },
      staminaOverride: {
        kind: 'extra-dying-trigger',
        source: 'curse-of-punishment',
        predicate: 'recoveries-exhausted',
      },
    });
    expect(recomputeStaminaState(p).newState).toBe('dying');
  });

  it('CoP override is dormant when recoveries non-zero', () => {
    const p = pc({
      currentStamina: 20,
      maxStamina: 30,
      recoveries: { current: 3, max: 8 },
      staminaOverride: {
        kind: 'extra-dying-trigger',
        source: 'curse-of-punishment',
        predicate: 'recoveries-exhausted',
      },
    });
    expect(recomputeStaminaState(p).newState).toBe('healthy');
  });
});

describe('recomputeStaminaState — inert threshold (B1)', () => {
  // Per canon Revenant.md:91: "when your Stamina reaches the negative of your
  // winded value, you become inert instead of dying." The inert override
  // replaces the *dead* transition (stamina ≤ -windedValue), not the dying one.
  it('inert override releases when stamina is in dying range (above -windedValue)', () => {
    const p = pc({
      currentStamina: -5, // dying range, above -windedValue (-15)
      maxStamina: 30,
      staminaOverride: {
        kind: 'inert',
        source: 'revenant',
        instantDeathDamageTypes: ['fire'],
        regainHours: 12,
        regainAmount: 'recoveryValue',
        canRegainStamina: false,
      },
    });
    expect(recomputeStaminaState(p).newState).toBe('dying');
  });

  it('inert override holds at "inert" when stamina ≤ -windedValue', () => {
    const p = pc({
      currentStamina: -15, // exactly at -windedValue
      maxStamina: 30,
      staminaOverride: {
        kind: 'inert',
        source: 'revenant',
        instantDeathDamageTypes: ['fire'],
        regainHours: 12,
        regainAmount: 'recoveryValue',
        canRegainStamina: false,
      },
    });
    expect(recomputeStaminaState(p).newState).toBe('inert');
  });
});

describe('applyTransitionSideEffects', () => {
  // B2 — Revenant.md:91: "You fall prone and can't stand." Mirror KO path.
  it('→ inert adds Prone condition', () => {
    const p = pc({ currentStamina: -15, maxStamina: 30, staminaState: 'healthy' });
    const result = applyTransitionSideEffects(p, 'healthy', 'inert');
    expect(result.staminaState).toBe('inert');
    const prone = result.conditions.find((c) => c.type === 'Prone');
    expect(prone).toBeDefined();
    expect(prone?.source).toEqual({ kind: 'effect', id: 'inert-state' });
  });

  it('→ rubble does NOT add Prone (canon describes unawareness, not prone)', () => {
    const p = pc({ currentStamina: -20, maxStamina: 30, staminaState: 'dying' });
    const result = applyTransitionSideEffects(p, 'dying', 'rubble');
    expect(result.staminaState).toBe('rubble');
    expect(result.conditions.find((c) => c.type === 'Prone')).toBeUndefined();
  });

  // B3 — Revenant Bloodless: "can't be made bleeding even while dying."
  // Phase 2b slice 2: Bloodless now flows through participant.conditionImmunities
  // (snapshotted from runtime at StartEncounter via the condition-immunity
  // attachment effect kind). The purchasedTraits flag is retained for
  // attribution but no longer the source of truth for the suppression.
  it('→ dying does NOT apply dying-Bleeding to a Revenant with Bloodless', () => {
    const p = pc({
      currentStamina: -5,
      maxStamina: 30,
      staminaState: 'winded',
      ancestry: ['revenant'],
      purchasedTraits: ['bloodless'],
      conditionImmunities: ['Bleeding'],
    });
    const result = applyTransitionSideEffects(p, 'winded', 'dying');
    expect(result.staminaState).toBe('dying');
    expect(result.conditions.find((c) => c.type === 'Bleeding')).toBeUndefined();
  });

  it('→ dying applies dying-Bleeding to a Revenant without Bloodless', () => {
    const p = pc({
      currentStamina: -5,
      maxStamina: 30,
      staminaState: 'winded',
      ancestry: ['revenant'],
      purchasedTraits: [],
    });
    const result = applyTransitionSideEffects(p, 'winded', 'dying');
    const bleed = result.conditions.find((c) => c.type === 'Bleeding');
    expect(bleed).toBeDefined();
    expect(bleed?.source).toEqual({ kind: 'effect', id: 'dying-state' });
  });

  it('→ dying applies dying-Bleeding to a non-Revenant PC', () => {
    const p = pc({
      currentStamina: -5,
      maxStamina: 30,
      staminaState: 'winded',
      ancestry: ['human'],
    });
    const result = applyTransitionSideEffects(p, 'winded', 'dying');
    expect(result.conditions.find((c) => c.type === 'Bleeding')).toBeDefined();
  });
});

describe('wouldHitDead', () => {
  it('returns true for a hero whose stamina would land below -windedValue', () => {
    const p = pc({ currentStamina: -10, maxStamina: 30 });
    expect(wouldHitDead(p, -20)).toBe(true); // -20 ≤ -15
  });

  it('returns false for a hero in dying range', () => {
    const p = pc({ currentStamina: 0, maxStamina: 30 });
    expect(wouldHitDead(p, -10)).toBe(false);
  });

  it('returns true for a foe whose stamina would land ≤ 0', () => {
    const f = foe({ currentStamina: 5, maxStamina: 30 });
    expect(wouldHitDead(f, -1)).toBe(true);
  });
});
