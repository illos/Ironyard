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
    level: 1,
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

function ready(): CampaignState {
  // Directly seed the roster so tests are independent of BringCharacterIntoEncounter
  // semantics. StartEncounter only materializes pc-placeholders; since we seed
  // full Participants here, it just sets up the encounter phase.
  let s = emptyCampaignState(campaignId, 'user-owner');
  s = { ...s, participants: [pc(), monster()] };
  s = applyIntent(s, intent('StartEncounter', {})).state;
  return s;
}

function getConditions(state: CampaignState, participantId: string): ConditionInstance[] {
  return (
    state.participants.find((p): p is Participant => isParticipant(p) && p.id === participantId)
      ?.conditions ?? []
  );
}

describe('applyIntent — SetCondition', () => {
  it('appends a new condition instance with appliedAtSeq = state.seq + 1', () => {
    const s = ready();
    const seqBefore = s.seq;
    const r = applyIntent(
      s,
      intent('SetCondition', {
        targetId: 'm_goblin',
        condition: 'Bleeding',
        source: { kind: 'effect', id: 'spell_1' },
        duration: { kind: 'save_ends' },
      }),
    );
    expect(r.errors).toBeUndefined();
    expect(r.state.seq).toBe(seqBefore + 1);
    const conds = getConditions(r.state, 'm_goblin');
    expect(conds).toHaveLength(1);
    expect(conds[0]?.type).toBe('Bleeding');
    expect(conds[0]?.appliedAtSeq).toBe(seqBefore + 1);
    expect(conds[0]?.removable).toBe(true);
    expect(conds[0]?.source).toEqual({ kind: 'effect', id: 'spell_1' });
    expect(conds[0]?.duration).toEqual({ kind: 'save_ends' });
  });

  it('is idempotent for the same {type, source.id} — does not double-add', () => {
    let s = ready();
    s = applyIntent(
      s,
      intent('SetCondition', {
        targetId: 'm_goblin',
        condition: 'Bleeding',
        source: { kind: 'effect', id: 'spell_1' },
        duration: { kind: 'save_ends' },
      }),
    ).state;
    const seqAfterFirst = s.seq;
    const r = applyIntent(
      s,
      intent('SetCondition', {
        targetId: 'm_goblin',
        condition: 'Bleeding',
        source: { kind: 'effect', id: 'spell_1' },
        duration: { kind: 'EoT' }, // even with a different duration, idempotent on {type, sourceId}
      }),
    );
    expect(r.errors).toBeUndefined();
    expect(r.state.seq).toBe(seqAfterFirst + 1); // still bumps seq
    const conds = getConditions(r.state, 'm_goblin');
    expect(conds).toHaveLength(1);
    expect(conds[0]?.duration).toEqual({ kind: 'save_ends' }); // unchanged
  });

  it('keeps both instances when the same type is imposed by different sources (binary effect, per-source duration)', () => {
    let s = ready();
    s = applyIntent(
      s,
      intent('SetCondition', {
        targetId: 'm_goblin',
        condition: 'Bleeding',
        source: { kind: 'effect', id: 'spell_a' },
        duration: { kind: 'save_ends' },
      }),
    ).state;
    s = applyIntent(
      s,
      intent('SetCondition', {
        targetId: 'm_goblin',
        condition: 'Bleeding',
        source: { kind: 'effect', id: 'spell_b' },
        duration: { kind: 'EoT' },
      }),
    ).state;
    const conds = getConditions(s, 'm_goblin');
    expect(conds).toHaveLength(2);
    const ids = conds.map((c) => c.source.id).sort();
    expect(ids).toEqual(['spell_a', 'spell_b']);
  });

  it('Frightened from a different source replaces the older Frightened instance', () => {
    let s = ready();
    s = applyIntent(
      s,
      intent('SetCondition', {
        targetId: 'pc_alice',
        condition: 'Frightened',
        source: { kind: 'creature', id: 'm_goblin' },
        duration: { kind: 'end_of_encounter' },
      }),
    ).state;
    s = applyIntent(
      s,
      intent('SetCondition', {
        targetId: 'pc_alice',
        condition: 'Frightened',
        source: { kind: 'creature', id: 'm_orc' },
        duration: { kind: 'end_of_encounter' },
      }),
    ).state;
    const conds = getConditions(s, 'pc_alice');
    expect(conds).toHaveLength(1);
    expect(conds[0]?.source.id).toBe('m_orc');
  });

  it('Frightened from the same source is idempotent (does not duplicate or bump appliedAtSeq)', () => {
    let s = ready();
    s = applyIntent(
      s,
      intent('SetCondition', {
        targetId: 'pc_alice',
        condition: 'Frightened',
        source: { kind: 'creature', id: 'm_goblin' },
        duration: { kind: 'end_of_encounter' },
      }),
    ).state;
    const seqAtFirst = getConditions(s, 'pc_alice')[0]?.appliedAtSeq;
    s = applyIntent(
      s,
      intent('SetCondition', {
        targetId: 'pc_alice',
        condition: 'Frightened',
        source: { kind: 'creature', id: 'm_goblin' },
        duration: { kind: 'end_of_encounter' },
      }),
    ).state;
    const conds = getConditions(s, 'pc_alice');
    expect(conds).toHaveLength(1);
    expect(conds[0]?.appliedAtSeq).toBe(seqAtFirst);
  });

  it('Taunted from a different source replaces the older Taunted instance', () => {
    let s = ready();
    s = applyIntent(
      s,
      intent('SetCondition', {
        targetId: 'm_goblin',
        condition: 'Taunted',
        source: { kind: 'creature', id: 'pc_alice' },
        duration: { kind: 'EoT' },
      }),
    ).state;
    s = applyIntent(
      s,
      intent('SetCondition', {
        targetId: 'm_goblin',
        condition: 'Taunted',
        source: { kind: 'creature', id: 'pc_bob' },
        duration: { kind: 'EoT' },
      }),
    ).state;
    const conds = getConditions(s, 'm_goblin');
    expect(conds).toHaveLength(1);
    expect(conds[0]?.source.id).toBe('pc_bob');
  });

  it('replace-on-different-source only applies to Frightened/Taunted, not other types', () => {
    // Slowed from two different sources should still produce two instances.
    let s = ready();
    s = applyIntent(
      s,
      intent('SetCondition', {
        targetId: 'pc_alice',
        condition: 'Slowed',
        source: { kind: 'creature', id: 'm_goblin' },
        duration: { kind: 'EoT' },
      }),
    ).state;
    s = applyIntent(
      s,
      intent('SetCondition', {
        targetId: 'pc_alice',
        condition: 'Slowed',
        source: { kind: 'creature', id: 'm_orc' },
        duration: { kind: 'EoT' },
      }),
    ).state;
    const conds = getConditions(s, 'pc_alice');
    expect(conds).toHaveLength(2);
  });

  it('rejects SetCondition with no active encounter', () => {
    const r = applyIntent(
      emptyCampaignState(campaignId, 'user-owner'),
      intent('SetCondition', {
        targetId: 'pc_alice',
        condition: 'Slowed',
        source: { kind: 'creature', id: 'm_goblin' },
        duration: { kind: 'EoT' },
      }),
    );
    expect(r.errors?.[0]?.code).toBe('no_active_encounter');
  });

  it('rejects SetCondition when the target is not in the encounter', () => {
    const r = applyIntent(
      ready(),
      intent('SetCondition', {
        targetId: 'ghost',
        condition: 'Slowed',
        source: { kind: 'creature', id: 'm_goblin' },
        duration: { kind: 'EoT' },
      }),
    );
    expect(r.errors?.[0]?.code).toBe('target_missing');
  });

  it('rejects SetCondition with an invalid payload (unknown condition type)', () => {
    const r = applyIntent(
      ready(),
      intent('SetCondition', {
        targetId: 'pc_alice',
        condition: 'Stunned', // not in the 9-value enum
        source: { kind: 'creature', id: 'm_goblin' },
        duration: { kind: 'EoT' },
      }),
    );
    expect(r.errors?.[0]?.code).toBe('invalid_payload');
  });
});

describe('applyIntent — RemoveCondition', () => {
  function readyWithMultipleSources(): CampaignState {
    let s = ready();
    s = applyIntent(
      s,
      intent('SetCondition', {
        targetId: 'm_goblin',
        condition: 'Bleeding',
        source: { kind: 'effect', id: 'spell_a' },
        duration: { kind: 'save_ends' },
      }),
    ).state;
    s = applyIntent(
      s,
      intent('SetCondition', {
        targetId: 'm_goblin',
        condition: 'Bleeding',
        source: { kind: 'effect', id: 'spell_b' },
        duration: { kind: 'EoT' },
      }),
    ).state;
    s = applyIntent(
      s,
      intent('SetCondition', {
        targetId: 'm_goblin',
        condition: 'Slowed',
        source: { kind: 'creature', id: 'pc_alice' },
        duration: { kind: 'EoT' },
      }),
    ).state;
    return s;
  }

  it('without sourceId, clears every instance of the named type', () => {
    const s = readyWithMultipleSources();
    const r = applyIntent(
      s,
      intent('RemoveCondition', { targetId: 'm_goblin', condition: 'Bleeding' }),
    );
    expect(r.errors).toBeUndefined();
    const conds = getConditions(r.state, 'm_goblin');
    expect(conds).toHaveLength(1); // only the Slowed remains
    expect(conds[0]?.type).toBe('Slowed');
  });

  it('with sourceId, removes only the matching instance of that type+source', () => {
    const s = readyWithMultipleSources();
    const r = applyIntent(
      s,
      intent('RemoveCondition', {
        targetId: 'm_goblin',
        condition: 'Bleeding',
        sourceId: 'spell_a',
      }),
    );
    expect(r.errors).toBeUndefined();
    const conds = getConditions(r.state, 'm_goblin');
    // spell_b Bleeding + Slowed remain
    expect(conds).toHaveLength(2);
    const bleedings = conds.filter((c) => c.type === 'Bleeding');
    expect(bleedings).toHaveLength(1);
    expect(bleedings[0]?.source.id).toBe('spell_b');
  });

  it('is a no-op when the condition is not present (no error, no state change beyond seq)', () => {
    const s = ready();
    const r = applyIntent(
      s,
      intent('RemoveCondition', { targetId: 'm_goblin', condition: 'Bleeding' }),
    );
    expect(r.errors).toBeUndefined();
    expect(r.state.seq).toBe(s.seq + 1);
    expect(getConditions(r.state, 'm_goblin')).toHaveLength(0);
  });

  it('does not remove instances flagged removable: false (defensive — for slice-6 dying Bleeding)', () => {
    // Construct a participant by hand with removable: false. Slice 5 handlers
    // never produce this, but the defensive guard should still hold.
    let s = emptyCampaignState(campaignId, 'user-owner');
    s = {
      ...s,
      participants: [
        pc({
          conditions: [
            {
              type: 'Bleeding',
              source: { kind: 'effect', id: 'dying' },
              duration: { kind: 'end_of_encounter' },
              appliedAtSeq: 0,
              removable: false,
            },
          ],
        }),
      ],
    };
    s = applyIntent(s, intent('StartEncounter', {})).state;
    const r = applyIntent(
      s,
      intent('RemoveCondition', { targetId: 'pc_alice', condition: 'Bleeding' }),
    );
    expect(r.errors).toBeUndefined();
    expect(getConditions(r.state, 'pc_alice')).toHaveLength(1);
  });

  it('rejects RemoveCondition with no active encounter', () => {
    const r = applyIntent(
      emptyCampaignState(campaignId, 'user-owner'),
      intent('RemoveCondition', { targetId: 'pc_alice', condition: 'Bleeding' }),
    );
    expect(r.errors?.[0]?.code).toBe('no_active_encounter');
  });

  it('rejects RemoveCondition when the target is not in the encounter', () => {
    const r = applyIntent(
      ready(),
      intent('RemoveCondition', { targetId: 'ghost', condition: 'Bleeding' }),
    );
    expect(r.errors?.[0]?.code).toBe('target_missing');
  });

  it('rejects RemoveCondition with an invalid payload', () => {
    const r = applyIntent(
      ready(),
      intent('RemoveCondition', { targetId: 'pc_alice', condition: 'Nope' }),
    );
    expect(r.errors?.[0]?.code).toBe('invalid_payload');
  });
});

describe('applyIntent — RollResistance', () => {
  function readyWithSaveEnds(): CampaignState {
    let s = ready();
    s = applyIntent(
      s,
      intent('SetCondition', {
        targetId: 'pc_alice',
        condition: 'Bleeding',
        source: { kind: 'effect', id: 'spell_1' },
        duration: { kind: 'save_ends' },
      }),
    ).state;
    return s;
  }

  it('d10 >= 6 removes the matching save_ends condition', () => {
    const s = readyWithSaveEnds();
    const r = applyIntent(
      s,
      intent('RollResistance', {
        characterId: 'pc_alice',
        effectId: 'spell_1',
        rolls: { d10: 6 },
      }),
    );
    expect(r.errors).toBeUndefined();
    expect(getConditions(r.state, 'pc_alice')).toHaveLength(0);
  });

  it('d10 >= 6 (boundary 10) removes the matching condition', () => {
    const s = readyWithSaveEnds();
    const r = applyIntent(
      s,
      intent('RollResistance', {
        characterId: 'pc_alice',
        effectId: 'spell_1',
        rolls: { d10: 10 },
      }),
    );
    expect(getConditions(r.state, 'pc_alice')).toHaveLength(0);
  });

  it('d10 < 6 leaves the condition in place', () => {
    const s = readyWithSaveEnds();
    const r = applyIntent(
      s,
      intent('RollResistance', {
        characterId: 'pc_alice',
        effectId: 'spell_1',
        rolls: { d10: 5 },
      }),
    );
    expect(r.errors).toBeUndefined();
    expect(getConditions(r.state, 'pc_alice')).toHaveLength(1);
  });

  it('logs no_matching_condition warning when no save_ends condition matches the effectId', () => {
    const s = readyWithSaveEnds();
    const r = applyIntent(
      s,
      intent('RollResistance', {
        characterId: 'pc_alice',
        effectId: 'unknown_spell',
        rolls: { d10: 9 },
      }),
    );
    expect(r.errors?.[0]?.code).toBe('no_matching_condition');
    expect(getConditions(r.state, 'pc_alice')).toHaveLength(1);
  });

  it('does not remove non-save_ends conditions even when source.id matches', () => {
    // EoT Bleeding from the same source.id — should not be removed by a save.
    let s = ready();
    s = applyIntent(
      s,
      intent('SetCondition', {
        targetId: 'pc_alice',
        condition: 'Bleeding',
        source: { kind: 'effect', id: 'spell_1' },
        duration: { kind: 'EoT' },
      }),
    ).state;
    const r = applyIntent(
      s,
      intent('RollResistance', {
        characterId: 'pc_alice',
        effectId: 'spell_1',
        rolls: { d10: 10 },
      }),
    );
    expect(r.errors?.[0]?.code).toBe('no_matching_condition');
    expect(getConditions(r.state, 'pc_alice')).toHaveLength(1);
  });

  it('rejects RollResistance with no active encounter', () => {
    const r = applyIntent(
      emptyCampaignState(campaignId, 'user-owner'),
      intent('RollResistance', {
        characterId: 'pc_alice',
        effectId: 'spell_1',
        rolls: { d10: 6 },
      }),
    );
    expect(r.errors?.[0]?.code).toBe('no_active_encounter');
  });

  it('rejects RollResistance when the character is not in the encounter', () => {
    const r = applyIntent(
      ready(),
      intent('RollResistance', {
        characterId: 'ghost',
        effectId: 'spell_1',
        rolls: { d10: 6 },
      }),
    );
    expect(r.errors?.[0]?.code).toBe('target_missing');
  });

  it('rejects RollResistance with an out-of-range d10 (0 or 11)', () => {
    const r1 = applyIntent(
      ready(),
      intent('RollResistance', {
        characterId: 'pc_alice',
        effectId: 'spell_1',
        rolls: { d10: 0 },
      }),
    );
    expect(r1.errors?.[0]?.code).toBe('invalid_payload');
    const r2 = applyIntent(
      ready(),
      intent('RollResistance', {
        characterId: 'pc_alice',
        effectId: 'spell_1',
        rolls: { d10: 11 },
      }),
    );
    expect(r2.errors?.[0]?.code).toBe('invalid_payload');
  });
});
