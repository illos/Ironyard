import type { ConditionInstance, Participant } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import {
  computeRollContributions,
  gateActionForDazed,
  removeTriggerEndedConditions,
} from '../src/condition-hooks';

function pc(over: Partial<Participant> = {}): Participant {
  return {
    id: 'pc_alice',
    name: 'Alice',
    kind: 'pc',
    level: 1,
    currentStamina: 30,
    maxStamina: 30,
    characteristics: { might: 2, agility: 1, reason: 0, intuition: 0, presence: 0 },
    immunities: [],
    weaknesses: [],
    conditions: [],
    ...over,
  };
}

function monster(over: Partial<Participant> = {}): Participant {
  return {
    id: 'm_goblin',
    name: 'Goblin',
    kind: 'monster',
    level: 1,
    currentStamina: 20,
    maxStamina: 20,
    characteristics: { might: 0, agility: 1, reason: -1, intuition: 0, presence: -1 },
    immunities: [],
    weaknesses: [],
    conditions: [],
    ...over,
  };
}

function cond(
  type: ConditionInstance['type'],
  sourceId: string,
  duration: ConditionInstance['duration'] = { kind: 'EoT' },
): ConditionInstance {
  return {
    type,
    source: { kind: 'creature', id: sourceId },
    duration,
    appliedAtSeq: 1,
    removable: true,
  };
}

describe('computeRollContributions', () => {
  it('Weakened attacker contributes +1 bane', () => {
    const attacker = pc({ conditions: [cond('Weakened', 'spell_1')] });
    const defender = monster();
    const r = computeRollContributions(attacker, [defender]);
    expect(r.extraBanes).toBe(1);
    expect(r.extraEdges).toBe(0);
  });

  it('Restrained attacker contributes +1 bane', () => {
    const attacker = pc({ conditions: [cond('Restrained', 'spell_1')] });
    const defender = monster();
    const r = computeRollContributions(attacker, [defender]);
    expect(r.extraBanes).toBe(1);
  });

  it('Restrained defender contributes +1 edge to attacker', () => {
    const attacker = pc();
    const defender = monster({ conditions: [cond('Restrained', 'spell_1')] });
    const r = computeRollContributions(attacker, [defender]);
    expect(r.extraEdges).toBe(1);
  });

  it('Frightened-on-attacker with source=defender contributes +1 bane', () => {
    const defender = monster();
    const attacker = pc({ conditions: [cond('Frightened', defender.id)] });
    const r = computeRollContributions(attacker, [defender]);
    expect(r.extraBanes).toBe(1);
  });

  it('Frightened-on-defender with source=attacker contributes +1 edge', () => {
    const attacker = pc();
    const defender = monster({ conditions: [cond('Frightened', attacker.id)] });
    const r = computeRollContributions(attacker, [defender]);
    expect(r.extraEdges).toBe(1);
  });

  it('Taunted attacker against non-taunter contributes +2 banes', () => {
    const taunter = pc({ id: 'pc_bob' });
    const defender = monster();
    const attacker = pc({ conditions: [cond('Taunted', taunter.id)] });
    const r = computeRollContributions(attacker, [defender]);
    expect(r.extraBanes).toBe(2);
  });

  it('Taunted attacker targeting the taunter contributes no bane', () => {
    const taunter = pc({ id: 'pc_bob' });
    const attacker = pc({ conditions: [cond('Taunted', taunter.id)] });
    const r = computeRollContributions(attacker, [taunter]);
    expect(r.extraBanes).toBe(0);
  });

  it('Grabbed attacker targeting grabber contributes no bane', () => {
    const grabber = monster();
    const attacker = pc({ conditions: [cond('Grabbed', grabber.id)] });
    const r = computeRollContributions(attacker, [grabber]);
    expect(r.extraBanes).toBe(0);
  });

  it('Grabbed attacker targeting a non-grabber contributes +1 bane', () => {
    const grabber = monster({ id: 'm_orc' });
    const defender = monster({ id: 'm_goblin' });
    const attacker = pc({ conditions: [cond('Grabbed', grabber.id)] });
    const r = computeRollContributions(attacker, [defender]);
    expect(r.extraBanes).toBe(1);
  });

  it('Prone attacker contributes +1 bane (strike-style simplification)', () => {
    const attacker = pc({ conditions: [cond('Prone', 'spell_1')] });
    const defender = monster();
    const r = computeRollContributions(attacker, [defender]);
    expect(r.extraBanes).toBe(1);
  });

  it('Prone defender contributes +1 edge to attacker', () => {
    const attacker = pc();
    const defender = monster({ conditions: [cond('Prone', 'spell_1')] });
    const r = computeRollContributions(attacker, [defender]);
    expect(r.extraEdges).toBe(1);
  });

  it('records human-readable reasons for the log', () => {
    const attacker = pc({ conditions: [cond('Weakened', 'spell_1')] });
    const defender = monster();
    const r = computeRollContributions(attacker, [defender]);
    expect(r.reasons.some((m) => m.includes('Weakened'))).toBe(true);
  });
});

describe('gateActionForDazed', () => {
  it('allows the first action on a Dazed turn', () => {
    const actor = pc({ conditions: [cond('Dazed', 'spell_1')] });
    const r = gateActionForDazed({ dazeActionUsedThisTurn: false }, actor, 'main_action');
    expect(r.ok).toBe(true);
  });

  it('rejects the second action on a Dazed turn with action_gated', () => {
    const actor = pc({ conditions: [cond('Dazed', 'spell_1')] });
    const r = gateActionForDazed({ dazeActionUsedThisTurn: true }, actor, 'main_action');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('action_gated');
      expect(r.reason).toMatch(/Dazed/);
    }
  });

  it('passes through for actors without Dazed', () => {
    const actor = pc();
    const r = gateActionForDazed({ dazeActionUsedThisTurn: true }, actor, 'main_action');
    expect(r.ok).toBe(true);
  });
});

describe('removeTriggerEndedConditions', () => {
  it('drops Grabbed on a teleport event', () => {
    const subject = pc({ conditions: [cond('Grabbed', 'm_goblin')] });
    const next = removeTriggerEndedConditions(subject, { kind: 'teleport' });
    expect(next.find((c) => c.type === 'Grabbed')).toBeUndefined();
  });

  it('drops Grabbed on a force_move_apart event', () => {
    const subject = pc({ conditions: [cond('Grabbed', 'm_goblin')] });
    const next = removeTriggerEndedConditions(subject, { kind: 'force_move_apart' });
    expect(next.find((c) => c.type === 'Grabbed')).toBeUndefined();
  });

  it('drops Restrained on teleport', () => {
    const subject = pc({ conditions: [cond('Restrained', 'spell_1')] });
    const next = removeTriggerEndedConditions(subject, { kind: 'teleport' });
    expect(next.find((c) => c.type === 'Restrained')).toBeUndefined();
  });

  it('does NOT drop Restrained on force_move_apart (canon §3.5.6)', () => {
    const subject = pc({ conditions: [cond('Restrained', 'spell_1')] });
    const next = removeTriggerEndedConditions(subject, { kind: 'force_move_apart' });
    expect(next.find((c) => c.type === 'Restrained')).toBeDefined();
  });

  it('leaves unrelated conditions untouched', () => {
    const subject = pc({
      conditions: [cond('Grabbed', 'm_goblin'), cond('Bleeding', 'spell_1')],
    });
    const next = removeTriggerEndedConditions(subject, { kind: 'teleport' });
    expect(next.find((c) => c.type === 'Bleeding')).toBeDefined();
    expect(next.find((c) => c.type === 'Grabbed')).toBeUndefined();
  });
});
