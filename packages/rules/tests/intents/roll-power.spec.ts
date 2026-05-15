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
}) {
  return stamped({
    type: 'RollPower',
    actor: ownerActor,
    payload: {
      abilityId: 'slam',
      attackerId: PC_ID,
      targetIds: [MONSTER_ID],
      characteristic: 'might',
      edges: 0,
      banes: 0,
      rolls: { d10: opts.d10 },
      ladder: LADDER,
      abilityType: opts.abilityType,
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
      conditions: [{ name: 'Dazed', duration: 'end-of-turn', source: { kind: 'ability', id: 'x' } }],
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
