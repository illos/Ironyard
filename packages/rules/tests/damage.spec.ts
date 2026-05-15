import { describe, expect, it } from 'vitest';
import type { Participant } from '@ironyard/shared';
import { applyDamageStep } from '../src/damage';

function hero(overrides: Partial<Participant> = {}): Participant {
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
    purchasedTraits: [],
    equippedTitleIds: [],
    staminaState: 'healthy',
    staminaOverride: null,
    bodyIntact: true,
    triggeredActionUsedThisRound: false,
    ...overrides,
  } as Participant;
}

describe('applyDamageStep — natural transitions', () => {
  it('hero healthy → winded on a partial blow', () => {
    const r = applyDamageStep(hero({ currentStamina: 30, maxStamina: 30 }), 20, 'fire');
    expect(r.after).toBe(10);
    expect(r.newParticipant.staminaState).toBe('winded');
    expect(r.transitionedTo).toBe('winded');
  });

  it('hero → dying gets non-removable Bleeding', () => {
    const r = applyDamageStep(hero({ currentStamina: 5, maxStamina: 30 }), 10, 'fire');
    expect(r.after).toBe(-5);
    expect(r.newParticipant.staminaState).toBe('dying');
    expect(
      r.newParticipant.conditions.some(
        (c) => c.type === 'Bleeding' && c.source.id === 'dying-state' && c.removable === false,
      ),
    ).toBe(true);
  });

  it('hero → dead clears all conditions', () => {
    const start = hero({
      currentStamina: -10,
      maxStamina: 30,
      staminaState: 'dying',
      conditions: [
        {
          type: 'Bleeding',
          duration: { kind: 'manual' },
          source: { kind: 'effect', id: 'dying-state' },
          removable: false,
          appliedAtSeq: 0,
        },
      ],
    });
    const r = applyDamageStep(start, 20, 'fire');
    expect(r.newParticipant.staminaState).toBe('dead');
    expect(r.newParticipant.conditions).toHaveLength(0);
  });
});

describe('applyDamageStep — KO interception', () => {
  it("intent='knock-out' at would-kill stops the damage and sets unconscious", () => {
    const start = hero({ currentStamina: -10, maxStamina: 30, staminaState: 'dying' });
    const r = applyDamageStep(start, 20, 'fire', 'knock-out');
    expect(r.delivered).toBe(0);
    expect(r.knockedOut).toBe(true);
    expect(r.newParticipant.currentStamina).toBe(-10);
    expect(r.newParticipant.staminaState).toBe('unconscious');
    expect(r.newParticipant.conditions.some((c) => c.type === 'Unconscious')).toBe(true);
    expect(r.newParticipant.conditions.some((c) => c.type === 'Prone')).toBe(true);
  });

  it("intent='knock-out' at non-killing blow applies damage normally", () => {
    // 20 stamina - 10 damage = 10; windedValue(30) = 15; 10 ≤ 15 → winded.
    // wouldHitDead: 10 > -15 → false → KO interception does NOT fire.
    const r = applyDamageStep(hero({ currentStamina: 20, maxStamina: 30 }), 10, 'fire', 'knock-out');
    expect(r.delivered).toBe(10);
    expect(r.knockedOut).toBe(false);
    expect(r.newParticipant.staminaState).toBe('winded');
  });

  it('an unconscious target takes further damage and dies', () => {
    // Start at -14 (one below dead threshold of -15 for maxStamina=30).
    // 1 more damage → -15 ≤ -windedValue(15) → dead.
    const start = hero({
      currentStamina: -14,
      maxStamina: 30,
      staminaState: 'unconscious',
      conditions: [
        {
          type: 'Unconscious',
          duration: { kind: 'manual' },
          source: { kind: 'effect', id: 'ko-interception' },
          removable: true,
          appliedAtSeq: 0,
        },
        {
          type: 'Prone',
          duration: { kind: 'manual' },
          source: { kind: 'effect', id: 'ko-interception' },
          removable: true,
          appliedAtSeq: 0,
        },
      ],
    });
    const r = applyDamageStep(start, 1, 'fire');
    expect(r.newParticipant.staminaState).toBe('dead');
  });
});

describe('applyDamageStep — overrides', () => {
  it('inert + fire damage → instant death', () => {
    const start = hero({
      currentStamina: -5,
      maxStamina: 30,
      staminaState: 'inert',
      staminaOverride: {
        kind: 'inert',
        source: 'revenant',
        instantDeathDamageTypes: ['fire'],
        regainHours: 12,
        regainAmount: 'recoveryValue',
      },
    });
    const r = applyDamageStep(start, 1, 'fire');
    expect(r.newParticipant.staminaState).toBe('dead');
    expect(r.newParticipant.staminaOverride).toBeNull();
  });

  it('inert + cold damage → still inert (only listed types instant-death)', () => {
    const start = hero({
      currentStamina: -5,
      maxStamina: 30,
      staminaState: 'inert',
      staminaOverride: {
        kind: 'inert',
        source: 'revenant',
        instantDeathDamageTypes: ['fire'],
        regainHours: 12,
        regainAmount: 'recoveryValue',
      },
    });
    const r = applyDamageStep(start, 10, 'cold');
    // Damage applies (stamina drops further) but state holds at 'inert' per
    // override's currentStamina ≤ 0 rule.
    expect(r.newParticipant.staminaState).toBe('inert');
  });

  it('doomed (hakaan) absorbs would-kill damage without dying', () => {
    const start = hero({
      currentStamina: -10,
      maxStamina: 30,
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
    const r = applyDamageStep(start, 100, 'fire');
    // Damage applies; stamina goes very negative; state stays doomed.
    expect(r.newParticipant.staminaState).toBe('doomed');
  });

  it('doomed (title) dies when stamina ≤ -staminaMax', () => {
    const start = hero({
      currentStamina: -10,
      maxStamina: 30,
      staminaState: 'doomed',
      staminaOverride: {
        kind: 'doomed',
        source: 'title-doomed',
        canRegainStamina: false,
        autoTier3OnPowerRolls: true,
        staminaDeathThreshold: 'staminaMax',
        dieAtEncounterEnd: true,
      },
    });
    const r = applyDamageStep(start, 30, 'fire');
    expect(r.newParticipant.staminaState).toBe('dead');
  });
});
