/**
 * Tests for applyRollPower — focused on the Pass 3 Slice 1 §4.10 crit
 * extra-main-action behaviour. Other RollPower tests live in
 * tests/reducer-encounter.spec.ts.
 */
import { describe, expect, it } from 'vitest';
import { applyIntent } from '../../src/index';
import {
  OWNER_ID,
  baseState,
  makeHeroParticipant,
  makeMonsterParticipant,
  makeRunningEncounterPhase,
  ownerActor,
  stamped,
} from './test-utils';

const PC_ID = 'pc:hero-1';
const MONSTER_ID = 'monster:goblin-1';

const LADDER = {
  t1: { damage: 2, damageType: 'fire' as const, conditions: [] },
  t2: { damage: 5, damageType: 'fire' as const, conditions: [] },
  t3: { damage: 9, damageType: 'fire' as const, conditions: [] },
};

function stateWithBoth(heroOverrides = {}, monsterOverrides = {}) {
  const hero = makeHeroParticipant(PC_ID, { ownerId: OWNER_ID, ...heroOverrides });
  const goblin = makeMonsterParticipant(MONSTER_ID, monsterOverrides);
  return baseState({
    participants: [hero, goblin],
    encounter: makeRunningEncounterPhase('enc-1'),
  });
}

function rollPowerIntent(opts: {
  d10: [number, number];
  abilityType?: 'action' | 'maneuver' | 'triggered' | 'free-triggered' | 'villain' | 'trait';
  surgesSpent?: number;
  attackerId?: string;
}) {
  return stamped({
    type: 'RollPower',
    actor: ownerActor,
    payload: {
      abilityId: 'slam',
      attackerId: opts.attackerId ?? PC_ID,
      targetIds: [MONSTER_ID],
      characteristic: 'might',
      edges: 0,
      banes: 0,
      rolls: { d10: opts.d10 },
      ladder: LADDER,
      abilityType: opts.abilityType,
      surgesSpent: opts.surgesSpent ?? 0,
    },
  });
}

describe('applyRollPower — GrantExtraMainAction (§4.10 crit)', () => {
  it('emits GrantExtraMainAction on nat 19 with main-action ability', () => {
    // d10 [10, 9] → natural 19 → crit; abilityType 'action' → main action
    const s = stateWithBoth();
    const r = applyIntent(s, rollPowerIntent({ d10: [10, 9], abilityType: 'action' }));

    expect(r.errors).toBeUndefined();
    const grant = r.derived.find((d) => d.type === 'GrantExtraMainAction');
    expect(grant).toBeDefined();
    expect((grant?.payload as { participantId: string }).participantId).toBe(PC_ID);
  });

  it('emits GrantExtraMainAction on nat 20 with main-action ability', () => {
    // d10 [10, 10] → natural 20 → crit
    const s = stateWithBoth();
    const r = applyIntent(s, rollPowerIntent({ d10: [10, 10], abilityType: 'action' }));

    expect(r.errors).toBeUndefined();
    const grant = r.derived.find((d) => d.type === 'GrantExtraMainAction');
    expect(grant).toBeDefined();
  });

  it('emits GrantExtraMainAction on nat 19/20 even when actor is Dazed', () => {
    // Canon §4.10: crit extra-main-action ignores Dazed cap — actor still gets
    // the extra action even though Dazed limits them to one of {main, maneuver,
    // move} per turn.
    const s = stateWithBoth({
      conditions: [
        { name: 'Dazed', duration: 'end-of-turn', source: { kind: 'ability', id: 'x' } },
      ],
    });
    const r = applyIntent(s, rollPowerIntent({ d10: [10, 9], abilityType: 'action' }));

    expect(r.errors).toBeUndefined();
    const grant = r.derived.find((d) => d.type === 'GrantExtraMainAction');
    expect(grant).toBeDefined();
  });

  it('does NOT emit GrantExtraMainAction when ability is a maneuver (nat 19)', () => {
    const s = stateWithBoth();
    const r = applyIntent(s, rollPowerIntent({ d10: [10, 9], abilityType: 'maneuver' }));

    expect(r.errors).toBeUndefined();
    const grant = r.derived.find((d) => d.type === 'GrantExtraMainAction');
    expect(grant).toBeUndefined();
  });

  it('does NOT emit GrantExtraMainAction when abilityType is omitted (legacy payload)', () => {
    // Legacy payloads without abilityType must not trigger the crit bonus.
    const s = stateWithBoth();
    const r = applyIntent(s, rollPowerIntent({ d10: [10, 9], abilityType: undefined }));

    expect(r.errors).toBeUndefined();
    const grant = r.derived.find((d) => d.type === 'GrantExtraMainAction');
    expect(grant).toBeUndefined();
  });

  it('does NOT emit GrantExtraMainAction when actor is dead (nat 19 main action)', () => {
    const s = stateWithBoth({ staminaState: 'dead' });
    const r = applyIntent(s, rollPowerIntent({ d10: [10, 9], abilityType: 'action' }));

    expect(r.errors).toBeUndefined();
    const grant = r.derived.find((d) => d.type === 'GrantExtraMainAction');
    expect(grant).toBeUndefined();
  });

  it('does NOT emit GrantExtraMainAction on non-crit roll (nat 18) with main action', () => {
    // d10 [9, 9] → natural 18 — not a crit
    const s = stateWithBoth();
    const r = applyIntent(s, rollPowerIntent({ d10: [9, 9], abilityType: 'action' }));

    expect(r.errors).toBeUndefined();
    const grant = r.derived.find((d) => d.type === 'GrantExtraMainAction');
    expect(grant).toBeUndefined();
  });
});

describe('applyRollPower — Pass 3 Slice 2a action-trigger evaluation', () => {
  // --- Shadow Insight (surge-spent-with-damage) ---

  it('Shadow + surge-spent + damage → emits +1 insight via class-trigger', () => {
    // d10 [5, 4] → nat 9 → tier 2 (after +2 might → total 11) → 5 fire damage,
    // surgesSpent: 1 → Shadow's surge-spent-with-damage trigger fires.
    const hero = makeHeroParticipant(PC_ID, {
      ownerId: OWNER_ID,
      className: 'Shadow',
      heroicResources: [{ name: 'insight', value: 0, floor: 0 }],
    });
    const goblin = makeMonsterParticipant(MONSTER_ID);
    const s = baseState({
      participants: [hero, goblin],
      encounter: makeRunningEncounterPhase('enc-1'),
    });

    const r = applyIntent(s, rollPowerIntent({ d10: [5, 4], surgesSpent: 1 }));

    expect(r.errors).toBeUndefined();
    const insightGain = r.derived.find(
      (d) =>
        d.type === 'GainResource' &&
        (d.payload as { name: string; participantId: string }).name === 'insight' &&
        (d.payload as { name: string; participantId: string }).participantId === PC_ID,
    );
    expect(insightGain).toBeDefined();
    expect((insightGain?.payload as { amount: number }).amount).toBe(1);
    expect(insightGain?.causedBy).toBe(r.derived[0]?.causedBy); // shares the parent intent id
    // Shadow's trigger also emits the per-round latch flip
    const latch = r.derived.find(
      (d) =>
        d.type === 'SetParticipantPerRoundFlag' &&
        (d.payload as { key: string }).key === 'dealtSurgeDamage',
    );
    expect(latch).toBeDefined();
  });

  it('Shadow + NO surges spent → no insight emission', () => {
    const hero = makeHeroParticipant(PC_ID, {
      ownerId: OWNER_ID,
      className: 'Shadow',
      heroicResources: [{ name: 'insight', value: 0, floor: 0 }],
    });
    const goblin = makeMonsterParticipant(MONSTER_ID);
    const s = baseState({
      participants: [hero, goblin],
      encounter: makeRunningEncounterPhase('enc-1'),
    });

    const r = applyIntent(s, rollPowerIntent({ d10: [5, 4], surgesSpent: 0 }));

    expect(r.errors).toBeUndefined();
    const insightGain = r.derived.find(
      (d) => d.type === 'GainResource' && (d.payload as { name: string }).name === 'insight',
    );
    expect(insightGain).toBeUndefined();
  });

  // Phase 2b 2b.16 B19 — Shadow Insight must check delivered damage, not
  // tier-computed damage. A fully fire-immune target absorbs the whole tier.
  it('Shadow + surge-spent + fully fire-immune target → NO insight emission', () => {
    const hero = makeHeroParticipant(PC_ID, {
      ownerId: OWNER_ID,
      className: 'Shadow',
      heroicResources: [{ name: 'insight', value: 0, floor: 0 }],
    });
    // d10 [5,4] → nat 9, +2 might → total 11 → tier 1 → 2 fire damage.
    // Immunity 2 reduces delivered to 0.
    const goblin = makeMonsterParticipant(MONSTER_ID, {
      immunities: [{ type: 'fire', value: 2 }],
    });
    const s = baseState({
      participants: [hero, goblin],
      encounter: makeRunningEncounterPhase('enc-1'),
    });

    const r = applyIntent(s, rollPowerIntent({ d10: [5, 4], surgesSpent: 1 }));

    expect(r.errors).toBeUndefined();
    const insightGain = r.derived.find(
      (d) => d.type === 'GainResource' && (d.payload as { name: string }).name === 'insight',
    );
    expect(insightGain).toBeUndefined();
  });

  it('Shadow + surge-spent + partially fire-immune target → insight DOES emit', () => {
    const hero = makeHeroParticipant(PC_ID, {
      ownerId: OWNER_ID,
      className: 'Shadow',
      heroicResources: [{ name: 'insight', value: 0, floor: 0 }],
    });
    // d10 [5,4] → tier 1 → 2 fire damage; immunity 1 → delivered 1.
    const goblin = makeMonsterParticipant(MONSTER_ID, {
      immunities: [{ type: 'fire', value: 1 }],
    });
    const s = baseState({
      participants: [hero, goblin],
      encounter: makeRunningEncounterPhase('enc-1'),
    });

    const r = applyIntent(s, rollPowerIntent({ d10: [5, 4], surgesSpent: 1 }));

    const insightGain = r.derived.find(
      (d) => d.type === 'GainResource' && (d.payload as { name: string }).name === 'insight',
    );
    expect(insightGain).toBeDefined();
  });

  it('Non-Shadow + surge-spent → no insight emission', () => {
    // Fury actor still spends a surge, but the Shadow trigger gates on class.
    const hero = makeHeroParticipant(PC_ID, {
      ownerId: OWNER_ID,
      className: 'Fury',
      heroicResources: [{ name: 'ferocity', value: 0, floor: 0 }],
    });
    const goblin = makeMonsterParticipant(MONSTER_ID);
    const s = baseState({
      participants: [hero, goblin],
      encounter: makeRunningEncounterPhase('enc-1'),
    });

    const r = applyIntent(s, rollPowerIntent({ d10: [5, 4], surgesSpent: 1 }));

    expect(r.errors).toBeUndefined();
    const insightGain = r.derived.find(
      (d) => d.type === 'GainResource' && (d.payload as { name: string }).name === 'insight',
    );
    expect(insightGain).toBeUndefined();
  });

  // --- Troubadour LoE 19/20 (roll-power-outcome) ---

  it('Troubadour exists + natural 20 rolled → spatial-trigger-troubadour-line-of-effect OA raised', () => {
    const hero = makeHeroParticipant(PC_ID, {
      ownerId: OWNER_ID,
      className: 'Fury',
    });
    const trou = makeHeroParticipant('pc:trou-1', {
      ownerId: OWNER_ID,
      className: 'Troubadour',
      heroicResources: [{ name: 'drama', value: 0, floor: 0 }],
    });
    const goblin = makeMonsterParticipant(MONSTER_ID);
    const s = baseState({
      participants: [hero, trou, goblin],
      encounter: makeRunningEncounterPhase('enc-1'),
    });

    // d10 [10, 10] → nat 20 → Troubadour LoE OA should be raised
    const r = applyIntent(s, rollPowerIntent({ d10: [10, 10] }));

    expect(r.errors).toBeUndefined();
    const oa = r.derived.find(
      (d) =>
        d.type === 'RaiseOpenAction' &&
        (d.payload as { kind: string }).kind === 'spatial-trigger-troubadour-line-of-effect',
    );
    expect(oa).toBeDefined();
    expect(
      (oa?.payload as { payload: { naturalValue: number; actorId: string } }).payload.naturalValue,
    ).toBe(20);
    expect((oa?.payload as { participantId: string }).participantId).toBe('pc:trou-1');
  });

  it('Troubadour exists + natural 19 rolled → spatial-trigger-troubadour-line-of-effect OA raised', () => {
    const trou = makeHeroParticipant('pc:trou-1', {
      ownerId: OWNER_ID,
      className: 'Troubadour',
      heroicResources: [{ name: 'drama', value: 0, floor: 0 }],
    });
    const hero = makeHeroParticipant(PC_ID, { ownerId: OWNER_ID, className: 'Fury' });
    const goblin = makeMonsterParticipant(MONSTER_ID);
    const s = baseState({
      participants: [hero, trou, goblin],
      encounter: makeRunningEncounterPhase('enc-1'),
    });

    // d10 [10, 9] → nat 19
    const r = applyIntent(s, rollPowerIntent({ d10: [10, 9] }));

    expect(r.errors).toBeUndefined();
    const oa = r.derived.find(
      (d) =>
        d.type === 'RaiseOpenAction' &&
        (d.payload as { kind: string }).kind === 'spatial-trigger-troubadour-line-of-effect',
    );
    expect(oa).toBeDefined();
    expect((oa?.payload as { payload: { naturalValue: number } }).payload.naturalValue).toBe(19);
  });

  it('No Troubadour + natural 20 → no OA raised', () => {
    const hero = makeHeroParticipant(PC_ID, { ownerId: OWNER_ID, className: 'Fury' });
    const goblin = makeMonsterParticipant(MONSTER_ID);
    const s = baseState({
      participants: [hero, goblin],
      encounter: makeRunningEncounterPhase('enc-1'),
    });

    const r = applyIntent(s, rollPowerIntent({ d10: [10, 10] }));

    expect(r.errors).toBeUndefined();
    const oa = r.derived.find(
      (d) =>
        d.type === 'RaiseOpenAction' &&
        (d.payload as { kind: string }).kind === 'spatial-trigger-troubadour-line-of-effect',
    );
    expect(oa).toBeUndefined();
  });

  it('Troubadour exists + natural 12 (no crit) → no LoE OA raised', () => {
    const trou = makeHeroParticipant('pc:trou-1', {
      ownerId: OWNER_ID,
      className: 'Troubadour',
      heroicResources: [{ name: 'drama', value: 0, floor: 0 }],
    });
    const hero = makeHeroParticipant(PC_ID, { ownerId: OWNER_ID, className: 'Fury' });
    const goblin = makeMonsterParticipant(MONSTER_ID);
    const s = baseState({
      participants: [hero, trou, goblin],
      encounter: makeRunningEncounterPhase('enc-1'),
    });

    // d10 [6, 6] → nat 12
    const r = applyIntent(s, rollPowerIntent({ d10: [6, 6] }));

    expect(r.errors).toBeUndefined();
    const oa = r.derived.find(
      (d) =>
        d.type === 'RaiseOpenAction' &&
        (d.payload as { kind: string }).kind === 'spatial-trigger-troubadour-line-of-effect',
    );
    expect(oa).toBeUndefined();
  });
});

// Slice 10 / Phase 2b Group A+B (2b.3.a) — verify the ranged-damage branch
// of the kit weapon-damage-bonus fold is symmetric with melee. The existing
// tier-and-keyword coverage in tests/attachments/weapon-damage-bonus.spec.ts
// already exercises both slots; this test asserts the regression guarantee
// at the RollPower spec level so future refactors that reintroduce a
// melee-only hardcode fail loudly here. No engine code change was needed —
// the slot is selected as `isMelee ? 'melee' : 'ranged'` from the lowercased
// ability keywords.
describe('applyRollPower — ranged weapon damage bonus reaches roll output (2b.3.a)', () => {
  it('Arcane-Archer-shaped ranged attacker: ranged tier bonus folds into damage', () => {
    // weaponDamageBonus.ranged = [2,2,2]; ladder t1=2, t2=5, t3=9.
    // d10 [5,4] → nat 9 + 2 might → 11 → tier 1 → 2 fire damage; +2 ranged
    // bonus = 4 delivered.
    const archer = makeHeroParticipant(PC_ID, {
      ownerId: OWNER_ID,
      weaponDamageBonus: { melee: [9, 9, 9], ranged: [2, 2, 2] },
    });
    const goblin = makeMonsterParticipant(MONSTER_ID);
    const s = baseState({
      participants: [archer, goblin],
      encounter: makeRunningEncounterPhase('enc-1'),
    });

    const intent = stamped({
      type: 'RollPower',
      actor: ownerActor,
      payload: {
        abilityId: 'arcane-archer-shot',
        attackerId: PC_ID,
        targetIds: [MONSTER_ID],
        characteristic: 'might',
        edges: 0,
        banes: 0,
        rolls: { d10: [5, 4] },
        ladder: LADDER,
        abilityKeywords: ['Ranged', 'Weapon'],
      },
    });
    const r = applyIntent(s, intent);

    expect(r.errors).toBeUndefined();
    const apply = r.derived.find((d) => d.type === 'ApplyDamage');
    expect(apply).toBeDefined();
    // Base t1 damage 2 + ranged bonus tier-0 entry 2 = 4 — and NOT the melee
    // slot value 9 (the regression guard).
    expect((apply?.payload as { amount: number }).amount).toBe(4);
  });
});

// Slice 10 / Phase 2b Group A+B — slice-6 carry-over: the Shadow Insight
// predelivery check must consult `getEffectiveWeaknesses` rather than
// reading `participant.weaknesses` directly. A flying Devil/Dragon-Knight
// with Wings at echelon 1 (level ≤ 3) gains a conditional +5 fire weakness
// that only lives in the effective helper. Without this fix, a fire-immune
// flying-Wings defender misses the insight even when the conditional
// weakness pushes delivered damage > 0.
describe('applyRollPower — Shadow Insight predelivery uses getEffectiveWeaknesses (slice-6 carry)', () => {
  it('Shadow vs flying Devil with Wings + fire-immunity 2: delivered fire damage from Wings weakness fires the insight gain', () => {
    // Ladder: t1 = 2 fire damage. Target has fire immunity 2 → without the
    // conditional Wings weakness, delivered = max(0, 2 + 0 - 2) = 0 and the
    // Shadow Insight predelivery gate suppresses the GainResource.
    // With the fix, getEffectiveWeaknesses(d, 1) returns [{type:'fire', value:5}]
    // → delivered = max(0, 2 + 5 - 2) = 5 → insight fires.
    const shadow = makeHeroParticipant(PC_ID, {
      ownerId: OWNER_ID,
      className: 'Shadow',
      heroicResources: [{ name: 'insight', value: 0, floor: 0 }],
    });
    const flyingDevil = makeHeroParticipant('pc:devil-1', {
      ownerId: OWNER_ID,
      ancestry: ['devil'],
      purchasedTraits: ['wings'],
      movementMode: { mode: 'flying', roundsRemaining: 3 },
      level: 1,
      immunities: [{ type: 'fire', value: 2 }],
      // Stamina cannot drop to 0 from this test; we only care about the
      // predelivery check flipping.
      currentStamina: 30,
      maxStamina: 30,
    });
    const s = baseState({
      participants: [shadow, flyingDevil],
      encounter: makeRunningEncounterPhase('enc-1'),
    });

    // d10 [5, 4] → nat 9, +2 might → total 11 → tier 1 → 2 fire damage.
    const intent = stamped({
      type: 'RollPower',
      actor: ownerActor,
      payload: {
        abilityId: 'slam',
        attackerId: PC_ID,
        targetIds: ['pc:devil-1'],
        characteristic: 'might',
        edges: 0,
        banes: 0,
        rolls: { d10: [5, 4] },
        ladder: LADDER, // already fire-typed at top of file
        surgesSpent: 1,
      },
    });
    const r = applyIntent(s, intent);

    expect(r.errors).toBeUndefined();
    const insightGain = r.derived.find(
      (d) =>
        d.type === 'GainResource' &&
        (d.payload as { name: string; participantId: string }).name === 'insight' &&
        (d.payload as { name: string; participantId: string }).participantId === PC_ID,
    );
    expect(insightGain).toBeDefined();
  });

  it('Shadow vs grounded Devil with Wings + fire-immunity 2: no insight (Wings weakness only applies when flying)', () => {
    // Same fixture but movementMode null → Wings conditional weakness does
    // not apply → delivered = max(0, 2 + 0 - 2) = 0 → no insight.
    // Regression guard: the helper must remain gated by movementMode.
    const shadow = makeHeroParticipant(PC_ID, {
      ownerId: OWNER_ID,
      className: 'Shadow',
      heroicResources: [{ name: 'insight', value: 0, floor: 0 }],
    });
    const groundedDevil = makeHeroParticipant('pc:devil-1', {
      ownerId: OWNER_ID,
      ancestry: ['devil'],
      purchasedTraits: ['wings'],
      movementMode: null,
      level: 1,
      immunities: [{ type: 'fire', value: 2 }],
      currentStamina: 30,
      maxStamina: 30,
    });
    const s = baseState({
      participants: [shadow, groundedDevil],
      encounter: makeRunningEncounterPhase('enc-1'),
    });

    const intent = stamped({
      type: 'RollPower',
      actor: ownerActor,
      payload: {
        abilityId: 'slam',
        attackerId: PC_ID,
        targetIds: ['pc:devil-1'],
        characteristic: 'might',
        edges: 0,
        banes: 0,
        rolls: { d10: [5, 4] },
        ladder: LADDER,
        surgesSpent: 1,
      },
    });
    const r = applyIntent(s, intent);

    expect(r.errors).toBeUndefined();
    const insightGain = r.derived.find(
      (d) => d.type === 'GainResource' && (d.payload as { name: string }).name === 'insight',
    );
    expect(insightGain).toBeUndefined();
  });
});
