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
