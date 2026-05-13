import type { ConditionInstance, Intent, Participant } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import {
  type CampaignState,
  type StampedIntent,
  applyIntent,
  emptyCampaignState,
  isParticipant,
} from '../src/index';

const T = 1_700_000_000_000;
const campaignId = 'sess_test';

function intent(type: string, payload: unknown, overrides: Partial<Intent> = {}): StampedIntent {
  return {
    id: overrides.id ?? `i_${Math.random().toString(36).slice(2)}`,
    campaignId: overrides.campaignId ?? campaignId,
    actor: overrides.actor ?? { userId: 'alice', role: 'director' },
    timestamp: overrides.timestamp ?? T,
    source: overrides.source ?? 'manual',
    type,
    payload,
    causedBy: overrides.causedBy,
  };
}

function pc(over: Partial<Participant> = {}): Participant {
  return {
    id: 'pc_alice',
    name: 'Alice',
    kind: 'pc',
    level: 3,
    currentStamina: 30,
    maxStamina: 30,
    characteristics: { might: 2, agility: 1, reason: 0, intuition: 0, presence: 0 },
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
    heroicResources: [],
    extras: [],
    surges: 0,
    recoveries: { current: 0, max: 0 },
    recoveryValue: 0,
    ownerId: null,
    characterId: null,
    weaponDamageBonus: { melee: [0, 0, 0], ranged: [0, 0, 0] },
    ...over,
  };
}

const ladder = {
  t1: { damage: 1, damageType: 'untyped' as const },
  t2: { damage: 5, damageType: 'untyped' as const },
  t3: { damage: 9, damageType: 'untyped' as const },
};

function readyState(parts: Participant[] = [pc(), monster()]): CampaignState {
  // Directly seed the roster — independent of BringCharacterIntoEncounter semantics.
  let s = emptyCampaignState(campaignId, 'user-owner');
  s = { ...s, participants: parts };
  s = applyIntent(s, intent('StartEncounter', {})).state;
  return s;
}

// Helper — start a round with the given initiative order, then start the
// attacker's turn so the daze-state tracker is initialised.
function inRoundWithActor(parts: Participant[], order: string[], actorId: string): CampaignState {
  let s = readyState(parts);
  s = applyIntent(s, intent('SetInitiative', { order })).state;
  s = applyIntent(s, intent('StartRound', {})).state;
  s = applyIntent(s, intent('StartTurn', { participantId: actorId })).state;
  return s;
}

function getConditions(state: CampaignState, participantId: string): ConditionInstance[] {
  return (
    state.participants.find((p): p is Participant => isParticipant(p) && p.id === participantId)
      ?.conditions ?? []
  );
}

// ============================================================================
// Bleeding hook
// ============================================================================

describe('reducer hooks — Bleeding on RollPower', () => {
  it('emits a derived ApplyDamage when the attacker has Bleeding and bleedingD6 is provided', () => {
    const attacker = pc({
      conditions: [
        {
          type: 'Bleeding',
          source: { kind: 'effect', id: 'spell_1' },
          duration: { kind: 'save_ends' },
          appliedAtSeq: 1,
          removable: true,
        },
      ],
    });
    const target = monster();
    const s = inRoundWithActor([attacker, target], [attacker.id, target.id], attacker.id);

    const r = applyIntent(
      s,
      intent('RollPower', {
        abilityId: 'free_strike',
        attackerId: attacker.id,
        targetIds: [target.id],
        characteristic: 'might',
        edges: 0,
        banes: 0,
        rolls: { d10: [5, 5] },
        ladder,
        bleedingD6: 4,
      }),
    );
    expect(r.errors).toBeUndefined();
    // One ApplyDamage for the attack, one ApplyDamage for Bleeding.
    const bleedingDerived = r.derived.filter(
      (d) =>
        d.type === 'ApplyDamage' &&
        d.payload &&
        (d.payload as { targetId: string }).targetId === attacker.id,
    );
    expect(bleedingDerived).toHaveLength(1);
    const bleedingPayload = bleedingDerived[0]?.payload as { amount: number; damageType: string };
    expect(bleedingPayload.amount).toBe(4 + attacker.level); // bleedingD6 + level
    expect(bleedingPayload.damageType).toBe('untyped');
  });

  it('does not emit Bleeding damage when the attacker has no Bleeding', () => {
    const attacker = pc();
    const target = monster();
    const s = inRoundWithActor([attacker, target], [attacker.id, target.id], attacker.id);

    const r = applyIntent(
      s,
      intent('RollPower', {
        abilityId: 'free_strike',
        attackerId: attacker.id,
        targetIds: [target.id],
        characteristic: 'might',
        edges: 0,
        banes: 0,
        rolls: { d10: [5, 5] },
        ladder,
        bleedingD6: 4,
      }),
    );
    const bleedingDerived = r.derived.filter(
      (d) =>
        d.type === 'ApplyDamage' && (d.payload as { targetId: string }).targetId === attacker.id,
    );
    expect(bleedingDerived).toHaveLength(0);
  });

  it('logs manual_override_required when Bleeding is present but bleedingD6 missing', () => {
    const attacker = pc({
      conditions: [
        {
          type: 'Bleeding',
          source: { kind: 'effect', id: 'spell_1' },
          duration: { kind: 'save_ends' },
          appliedAtSeq: 1,
          removable: true,
        },
      ],
    });
    const target = monster();
    const s = inRoundWithActor([attacker, target], [attacker.id, target.id], attacker.id);

    const r = applyIntent(
      s,
      intent('RollPower', {
        abilityId: 'free_strike',
        attackerId: attacker.id,
        targetIds: [target.id],
        characteristic: 'might',
        edges: 0,
        banes: 0,
        rolls: { d10: [5, 5] },
        ladder,
        // no bleedingD6
      }),
    );
    const bleedingDerived = r.derived.filter(
      (d) =>
        d.type === 'ApplyDamage' && (d.payload as { targetId: string }).targetId === attacker.id,
    );
    expect(bleedingDerived).toHaveLength(0);
    expect(r.log.some((l) => l.text.includes('manual_override_required'))).toBe(true);
  });

  it('Bleeding fires on Might-or-Agility rolls (characteristic-keyed branch)', () => {
    const attacker = pc({
      conditions: [
        {
          type: 'Bleeding',
          source: { kind: 'effect', id: 'spell_1' },
          duration: { kind: 'save_ends' },
          appliedAtSeq: 1,
          removable: true,
        },
      ],
    });
    const target = monster();
    const s = inRoundWithActor([attacker, target], [attacker.id, target.id], attacker.id);

    const r = applyIntent(
      s,
      intent('RollPower', {
        abilityId: 'agility_strike',
        attackerId: attacker.id,
        targetIds: [target.id],
        characteristic: 'agility',
        edges: 0,
        banes: 0,
        rolls: { d10: [5, 5] },
        ladder,
        bleedingD6: 3,
      }),
    );
    const bleedingDerived = r.derived.filter(
      (d) =>
        d.type === 'ApplyDamage' && (d.payload as { targetId: string }).targetId === attacker.id,
    );
    expect(bleedingDerived).toHaveLength(1);
  });
});

// ============================================================================
// Dazed action gate
// ============================================================================

describe('reducer hooks — Dazed action gate', () => {
  function dazedAttackerScenario(): { s: CampaignState; attackerId: string; targetId: string } {
    const attacker = pc({
      conditions: [
        {
          type: 'Dazed',
          source: { kind: 'effect', id: 'spell_1' },
          duration: { kind: 'EoT' },
          appliedAtSeq: 1,
          removable: true,
        },
      ],
    });
    const target = monster();
    const s = inRoundWithActor([attacker, target], [attacker.id, target.id], attacker.id);
    return { s, attackerId: attacker.id, targetId: target.id };
  }

  it('allows the first RollPower from a Dazed actor', () => {
    const { s, attackerId, targetId } = dazedAttackerScenario();
    const r = applyIntent(
      s,
      intent('RollPower', {
        abilityId: 'free_strike',
        attackerId,
        targetIds: [targetId],
        characteristic: 'might',
        edges: 0,
        banes: 0,
        rolls: { d10: [5, 5] },
        ladder,
      }),
    );
    expect(r.errors).toBeUndefined();
  });

  it('rejects a second RollPower from a Dazed actor with action_gated', () => {
    const { s, attackerId, targetId } = dazedAttackerScenario();
    const after1 = applyIntent(
      s,
      intent('RollPower', {
        abilityId: 'free_strike',
        attackerId,
        targetIds: [targetId],
        characteristic: 'might',
        edges: 0,
        banes: 0,
        rolls: { d10: [5, 5] },
        ladder,
      }),
    );
    const r = applyIntent(
      after1.state,
      intent('RollPower', {
        abilityId: 'second_attack',
        attackerId,
        targetIds: [targetId],
        characteristic: 'might',
        edges: 0,
        banes: 0,
        rolls: { d10: [5, 5] },
        ladder,
      }),
    );
    expect(r.errors?.[0]?.code).toBe('action_gated');
  });

  it('StartTurn resets the Dazed flag for the new turn', () => {
    const { s, attackerId, targetId } = dazedAttackerScenario();
    // Use the action, then end this turn and start a new one.
    const after1 = applyIntent(
      s,
      intent('RollPower', {
        abilityId: 'free_strike',
        attackerId,
        targetIds: [targetId],
        characteristic: 'might',
        edges: 0,
        banes: 0,
        rolls: { d10: [5, 5] },
        ladder,
      }),
    );
    const afterEnd = applyIntent(after1.state, intent('EndTurn', {}));
    const afterStart = applyIntent(
      afterEnd.state,
      intent('StartTurn', { participantId: attackerId }),
    );
    // Now the same actor should be allowed a fresh action.
    const r = applyIntent(
      afterStart.state,
      intent('RollPower', {
        abilityId: 'second_attack',
        attackerId,
        targetIds: [targetId],
        characteristic: 'might',
        edges: 0,
        banes: 0,
        rolls: { d10: [5, 5] },
        ladder,
      }),
    );
    expect(r.errors).toBeUndefined();
  });

  it('Non-Dazed actor is never gated', () => {
    const attacker = pc();
    const target = monster();
    const s = inRoundWithActor([attacker, target], [attacker.id, target.id], attacker.id);
    const after1 = applyIntent(
      s,
      intent('RollPower', {
        abilityId: 'a',
        attackerId: attacker.id,
        targetIds: [target.id],
        characteristic: 'might',
        edges: 0,
        banes: 0,
        rolls: { d10: [5, 5] },
        ladder,
      }),
    );
    const r = applyIntent(
      after1.state,
      intent('RollPower', {
        abilityId: 'b',
        attackerId: attacker.id,
        targetIds: [target.id],
        characteristic: 'might',
        edges: 0,
        banes: 0,
        rolls: { d10: [5, 5] },
        ladder,
      }),
    );
    expect(r.errors).toBeUndefined();
  });
});

// ============================================================================
// Edge/bane contributions on RollPower
// ============================================================================

describe('reducer hooks — edge/bane contributions on RollPower', () => {
  function rollWith(state: CampaignState, attackerId: string, targetId: string) {
    return applyIntent(
      state,
      intent('RollPower', {
        abilityId: 'a',
        attackerId,
        targetIds: [targetId],
        characteristic: 'might',
        edges: 0,
        banes: 0,
        // Total 12 = baseTier 2; one bane drops to 10 = baseTier 1.
        rolls: { d10: [6, 6] },
        ladder,
      }),
    );
  }

  it('Weakened attacker picks up a bane (tier drops from t2 to t1)', () => {
    const attacker = pc({
      conditions: [
        {
          type: 'Weakened',
          source: { kind: 'effect', id: 'spell_1' },
          duration: { kind: 'EoT' },
          appliedAtSeq: 1,
          removable: true,
        },
      ],
    });
    const target = monster();
    const s = inRoundWithActor([attacker, target], [attacker.id, target.id], attacker.id);
    // 5+5 + might 2 = 12 → t2; +1 bane → 10 → t1.
    const r = applyIntent(
      s,
      intent('RollPower', {
        abilityId: 'a',
        attackerId: attacker.id,
        targetIds: [target.id],
        characteristic: 'might',
        edges: 0,
        banes: 0,
        rolls: { d10: [5, 5] },
        ladder,
      }),
    );
    expect(r.log[0]?.text).toMatch(/t1/);
  });

  it('Frightened-against-source picks up a bane', () => {
    const target = monster();
    const attacker = pc({
      conditions: [
        {
          type: 'Frightened',
          source: { kind: 'creature', id: target.id },
          duration: { kind: 'end_of_encounter' },
          appliedAtSeq: 1,
          removable: true,
        },
      ],
    });
    const s = inRoundWithActor([attacker, target], [attacker.id, target.id], attacker.id);
    // 5+5 + might 2 = 12 → t2; +1 bane → 10 → t1.
    const r = applyIntent(
      s,
      intent('RollPower', {
        abilityId: 'a',
        attackerId: attacker.id,
        targetIds: [target.id],
        characteristic: 'might',
        edges: 0,
        banes: 0,
        rolls: { d10: [5, 5] },
        ladder,
      }),
    );
    expect(r.log[0]?.text).toMatch(/t1/);
  });

  it('Frightened-on-defender, source = attacker, picks up an edge for the attacker', () => {
    const attacker = pc();
    const target = monster({
      conditions: [
        {
          type: 'Frightened',
          source: { kind: 'creature', id: 'pc_alice' },
          duration: { kind: 'end_of_encounter' },
          appliedAtSeq: 1,
          removable: true,
        },
      ],
    });
    const s = inRoundWithActor([attacker, target], [attacker.id, target.id], attacker.id);
    // total 11 with attacker characteristic +2 = 13 → t2. With +1 edge: 15 → t2 still.
    // Use a roll that benefits visibly from +1 edge: 5+5 + might=2 = 12 → t2 base; +1 edge → 14 → still t2. Use 4+5: 9 + 2 = 11 → t1; +1 edge → 13 → t2.
    const r = applyIntent(
      s,
      intent('RollPower', {
        abilityId: 'a',
        attackerId: attacker.id,
        targetIds: [target.id],
        characteristic: 'might',
        edges: 0,
        banes: 0,
        rolls: { d10: [4, 5] },
        ladder,
      }),
    );
    expect(r.log[0]?.text).toMatch(/t2/);
  });

  it('Taunted attacker not-targeting-taunter contributes 2 banes (drops tier)', () => {
    const taunter = pc({ id: 'pc_bob', name: 'Bob' });
    const attacker = pc({
      conditions: [
        {
          type: 'Taunted',
          source: { kind: 'creature', id: taunter.id },
          duration: { kind: 'EoT' },
          appliedAtSeq: 1,
          removable: true,
        },
      ],
    });
    const target = monster();
    const s = inRoundWithActor(
      [attacker, taunter, target],
      [attacker.id, taunter.id, target.id],
      attacker.id,
    );
    // 6+6 + might 2 = 14 → t2 base; +2 banes (net 2 banes) → tier shifts down to t1.
    const r = rollWith(s, attacker.id, target.id);
    expect(r.log[0]?.text).toMatch(/t1/);
  });

  it('Taunted attacker targeting the taunter contributes no bane', () => {
    const taunter = pc({ id: 'pc_bob', name: 'Bob' });
    const attacker = pc({
      conditions: [
        {
          type: 'Taunted',
          source: { kind: 'creature', id: taunter.id },
          duration: { kind: 'EoT' },
          appliedAtSeq: 1,
          removable: true,
        },
      ],
    });
    const s = inRoundWithActor([attacker, taunter], [attacker.id, taunter.id], attacker.id);
    // 6+6 + might 2 = 14 → t2 base; no banes → stays t2.
    const r = rollWith(s, attacker.id, taunter.id);
    expect(r.log[0]?.text).toMatch(/t2/);
  });

  it('Grabbed attacker targeting grabber picks up no bane', () => {
    const grabber = monster();
    const attacker = pc({
      conditions: [
        {
          type: 'Grabbed',
          source: { kind: 'creature', id: grabber.id },
          duration: { kind: 'EoT' },
          appliedAtSeq: 1,
          removable: true,
        },
      ],
    });
    const s = inRoundWithActor([attacker, grabber], [attacker.id, grabber.id], attacker.id);
    const r = rollWith(s, attacker.id, grabber.id);
    expect(r.log[0]?.text).toMatch(/t2/);
  });

  it('Restrained attacker AND Restrained defender net to zero after §1.4 cancellation', () => {
    const attacker = pc({
      conditions: [
        {
          type: 'Restrained',
          source: { kind: 'effect', id: 'spell_a' },
          duration: { kind: 'EoT' },
          appliedAtSeq: 1,
          removable: true,
        },
      ],
    });
    const target = monster({
      conditions: [
        {
          type: 'Restrained',
          source: { kind: 'effect', id: 'spell_b' },
          duration: { kind: 'EoT' },
          appliedAtSeq: 1,
          removable: true,
        },
      ],
    });
    const s = inRoundWithActor([attacker, target], [attacker.id, target.id], attacker.id);
    // 1 bane + 1 edge → cancels per §1.4 → tier 2 from base total 14.
    const r = rollWith(s, attacker.id, target.id);
    expect(r.log[0]?.text).toMatch(/t2/);
  });

  it('§1.4 caps net contribution at 2 banes even when 4 banes contribute', () => {
    // Weakened + Restrained + Prone + Taunted-against-non-taunter = 1 + 1 + 1 + 2 = 5 banes
    const taunter = pc({ id: 'pc_bob', name: 'Bob' });
    const attacker = pc({
      conditions: [
        {
          type: 'Weakened',
          source: { kind: 'effect', id: 'sp_a' },
          duration: { kind: 'EoT' },
          appliedAtSeq: 1,
          removable: true,
        },
        {
          type: 'Restrained',
          source: { kind: 'effect', id: 'sp_b' },
          duration: { kind: 'EoT' },
          appliedAtSeq: 1,
          removable: true,
        },
        {
          type: 'Prone',
          source: { kind: 'effect', id: 'sp_c' },
          duration: { kind: 'EoT' },
          appliedAtSeq: 1,
          removable: true,
        },
        {
          type: 'Taunted',
          source: { kind: 'creature', id: taunter.id },
          duration: { kind: 'EoT' },
          appliedAtSeq: 1,
          removable: true,
        },
      ],
    });
    const target = monster();
    const s = inRoundWithActor(
      [attacker, taunter, target],
      [attacker.id, taunter.id, target.id],
      attacker.id,
    );
    // 6+6 + might 2 = 14 base. After cancellation: netBanes capped at 2 → drops tier.
    // baseTier = 2 (12 ≤ 14 ≤ 16) → -1 = 1
    const r = rollWith(s, attacker.id, target.id);
    expect(r.log[0]?.text).toMatch(/t1/);
  });
});

// ============================================================================
// EndTurn auto-fires RollResistance
// ============================================================================

describe('reducer hooks — EndTurn auto-fires RollResistance', () => {
  function turnEndsWithSaves(saveEndsCount: number): { s: CampaignState; actorId: string } {
    const conditions: ConditionInstance[] = [];
    for (let i = 0; i < saveEndsCount; i++) {
      conditions.push({
        type: 'Bleeding',
        source: { kind: 'effect', id: `spell_${i}` },
        duration: { kind: 'save_ends' },
        appliedAtSeq: i + 1,
        removable: true,
      });
    }
    const actor = pc({ conditions });
    const other = monster();
    const s = inRoundWithActor([actor, other], [actor.id, other.id], actor.id);
    return { s, actorId: actor.id };
  }

  it('emits one derived RollResistance per save_ends condition in appliedAtSeq order', () => {
    const { s, actorId } = turnEndsWithSaves(2);
    const r = applyIntent(s, intent('EndTurn', { saveRolls: [8, 9] }));
    const resists = r.derived.filter((d) => d.type === 'RollResistance');
    expect(resists).toHaveLength(2);
    expect((resists[0]?.payload as { effectId: string }).effectId).toBe('spell_0');
    expect((resists[1]?.payload as { effectId: string }).effectId).toBe('spell_1');
    expect((resists[0]?.payload as { rolls: { d10: number } }).rolls.d10).toBe(8);
    expect((resists[1]?.payload as { rolls: { d10: number } }).rolls.d10).toBe(9);
  });

  it('skips and logs manual_override_required when saveRolls is missing', () => {
    const { s } = turnEndsWithSaves(2);
    const r = applyIntent(s, intent('EndTurn', {}));
    expect(r.errors).toBeUndefined();
    const resists = r.derived.filter((d) => d.type === 'RollResistance');
    expect(resists).toHaveLength(0);
    expect(r.log.some((l) => l.text.includes('manual_override_required'))).toBe(true);
  });

  it('skips and logs manual_override_required when saveRolls length mismatches', () => {
    const { s } = turnEndsWithSaves(2);
    const r = applyIntent(s, intent('EndTurn', { saveRolls: [8] }));
    expect(r.errors).toBeUndefined();
    expect(r.derived.filter((d) => d.type === 'RollResistance')).toHaveLength(0);
    expect(r.log.some((l) => l.text.includes('manual_override_required'))).toBe(true);
  });

  it('does not emit RollResistance for non-save_ends conditions', () => {
    const actor = pc({
      conditions: [
        {
          type: 'Frightened',
          source: { kind: 'creature', id: 'm_goblin' },
          duration: { kind: 'end_of_encounter' },
          appliedAtSeq: 1,
          removable: true,
        },
        {
          type: 'Slowed',
          source: { kind: 'effect', id: 'spell_1' },
          duration: { kind: 'EoT' },
          appliedAtSeq: 2,
          removable: true,
        },
      ],
    });
    const s = inRoundWithActor([actor, monster()], [actor.id, 'm_goblin'], actor.id);
    const r = applyIntent(s, intent('EndTurn', {}));
    expect(r.derived.filter((d) => d.type === 'RollResistance')).toHaveLength(0);
  });

  it('emits no RollResistance when there are no save_ends conditions', () => {
    const { s } = turnEndsWithSaves(0);
    const r = applyIntent(s, intent('EndTurn', {}));
    expect(r.derived.filter((d) => d.type === 'RollResistance')).toHaveLength(0);
    // No saves expected, so no manual_override_required log either.
    expect(r.log.some((l) => l.text.includes('manual_override_required'))).toBe(false);
  });
});

// ============================================================================
// Conditions data check after full slice 6
// ============================================================================

describe('reducer hooks — full conditions data preserved', () => {
  it('attacker conditions list survives RollPower hook contributions', () => {
    const attacker = pc({
      conditions: [
        {
          type: 'Weakened',
          source: { kind: 'effect', id: 'spell_1' },
          duration: { kind: 'EoT' },
          appliedAtSeq: 1,
          removable: true,
        },
      ],
    });
    const target = monster();
    const s = inRoundWithActor([attacker, target], [attacker.id, target.id], attacker.id);
    const r = applyIntent(
      s,
      intent('RollPower', {
        abilityId: 'a',
        attackerId: attacker.id,
        targetIds: [target.id],
        characteristic: 'might',
        edges: 0,
        banes: 0,
        rolls: { d10: [6, 6] },
        ladder,
      }),
    );
    expect(getConditions(r.state, attacker.id).map((c) => c.type)).toEqual(['Weakened']);
  });
});

// =============================================================================
// Phase 1 — auto-apply conditions from RollPower ladder
// =============================================================================

describe('RollPower — auto-applies conditions from landing tier', () => {
  it('derives SetCondition for the landing tier per target', () => {
    const attacker = pc();
    const target = monster();
    const s = inRoundWithActor([attacker, target], [attacker.id, target.id], attacker.id);
    const r = applyIntent(
      s,
      intent('RollPower', {
        abilityId: 'a',
        attackerId: attacker.id,
        targetIds: [target.id],
        characteristic: 'might',
        edges: 0,
        banes: 0,
        rolls: { d10: [9, 9] }, // total → tier 3
        ladder: {
          t1: { damage: 1, damageType: 'untyped' as const, conditions: [] },
          t2: { damage: 5, damageType: 'untyped' as const, conditions: [] },
          t3: {
            damage: 9,
            damageType: 'untyped' as const,
            conditions: [{ condition: 'Slowed', duration: { kind: 'save_ends' } }],
          },
        },
      }),
    );
    expect(r.errors).toBeUndefined();
    const setCond = r.derived.filter((d) => d.type === 'SetCondition');
    expect(setCond).toHaveLength(1);
    const payload = setCond[0]?.payload as {
      targetId: string;
      condition: string;
      source: { kind: string; id: string };
    };
    expect(payload.targetId).toBe(target.id);
    expect(payload.condition).toBe('Slowed');
    expect(payload.source).toEqual({ kind: 'creature', id: attacker.id });
  });

  it('does not derive conditions from non-landing tiers', () => {
    const attacker = pc();
    const target = monster();
    const s = inRoundWithActor([attacker, target], [attacker.id, target.id], attacker.id);
    const r = applyIntent(
      s,
      intent('RollPower', {
        abilityId: 'a',
        attackerId: attacker.id,
        targetIds: [target.id],
        characteristic: 'might',
        edges: 0,
        banes: 0,
        rolls: { d10: [1, 1] }, // total 2 + 2 (might) → tier 1
        ladder: {
          t1: { damage: 1, damageType: 'untyped' as const, conditions: [] },
          t2: {
            damage: 5,
            damageType: 'untyped' as const,
            conditions: [{ condition: 'Slowed', duration: { kind: 'save_ends' } }],
          },
          t3: {
            damage: 9,
            damageType: 'untyped' as const,
            conditions: [{ condition: 'Restrained', duration: { kind: 'save_ends' } }],
          },
        },
      }),
    );
    const setCond = r.derived.filter((d) => d.type === 'SetCondition');
    expect(setCond).toHaveLength(0);
  });

  it('derives one SetCondition per condition per target', () => {
    const attacker = pc();
    const t1 = monster({ id: 'm_1' });
    const t2 = monster({ id: 'm_2' });
    const s = inRoundWithActor([attacker, t1, t2], [attacker.id, t1.id, t2.id], attacker.id);
    const r = applyIntent(
      s,
      intent('RollPower', {
        abilityId: 'a',
        attackerId: attacker.id,
        targetIds: [t1.id, t2.id],
        characteristic: 'might',
        edges: 0,
        banes: 0,
        rolls: { d10: [9, 9] }, // tier 3
        ladder: {
          t1: { damage: 1, damageType: 'untyped' as const, conditions: [] },
          t2: { damage: 5, damageType: 'untyped' as const, conditions: [] },
          t3: {
            damage: 9,
            damageType: 'untyped' as const,
            conditions: [
              { condition: 'Frightened', duration: { kind: 'EoT' } },
              { condition: 'Slowed', duration: { kind: 'save_ends' } },
            ],
          },
        },
      }),
    );
    const setCond = r.derived.filter((d) => d.type === 'SetCondition');
    // 2 targets × 2 conditions
    expect(setCond).toHaveLength(4);
  });
});
