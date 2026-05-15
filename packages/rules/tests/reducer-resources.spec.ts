import type { Intent, Participant } from '@ironyard/shared';
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
    id: 'pc_talent',
    name: 'Talent',
    kind: 'pc',
    level: 1,
    currentStamina: 30,
    maxStamina: 30,
    characteristics: { might: 0, agility: 0, reason: 2, intuition: 0, presence: 0 },
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
    activeAbilities: [],
    victories: 0,
    turnActionUsage: { main: false, maneuver: false, move: false },
    surprised: false,
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
    activeAbilities: [],
    victories: 0,
    turnActionUsage: { main: false, maneuver: false, move: false },
    surprised: false,
    ...over,
  };
}

function ready(extra?: Partial<Participant>): CampaignState {
  // Directly construct state with encounter phase — independent of StartEncounter
  // roster-replacement semantics (StartEncounter now atomically replaces the
  // roster from stampedPcs; seeded participants would be wiped out).
  const participants = [pc(extra), monster()];
  const s = emptyCampaignState(campaignId, 'user-owner');
  return {
    ...s,
    participants,
    encounter: {
      id: 'enc_test',
      currentRound: 1,
      activeParticipantId: null,
      turnState: {},
      malice: { current: 0, lastMaliciousStrikeRound: null },
      firstSide: null,
      currentPickingSide: null,
      actedThisRound: [],
    },
  };
}

function getParticipant(state: CampaignState, id: string): Participant | undefined {
  return state.participants.find((p): p is Participant => isParticipant(p) && p.id === id);
}

describe('applyIntent — StartEncounter (malice init, slice 7)', () => {
  it('initializes encounter.malice to { current: 0, lastMaliciousStrikeRound: null }', () => {
    const s = ready();
    expect(s.encounter?.malice).toEqual({
      current: 0,
      lastMaliciousStrikeRound: null,
    });
  });
});

describe('applyIntent — GainResource', () => {
  it('increments value on an existing heroic resource', () => {
    const s = ready({
      heroicResources: [{ name: 'clarity', value: 2, floor: -3 }],
    });
    const r = applyIntent(
      s,
      intent('GainResource', { participantId: 'pc_talent', name: 'clarity', amount: 3 }),
    );
    expect(r.errors).toBeUndefined();
    expect(getParticipant(r.state, 'pc_talent')?.heroicResources[0]?.value).toBe(5);
  });

  it('caps at `max` if defined', () => {
    const s = ready({
      heroicResources: [{ name: 'focus', value: 8, max: 10, floor: 0 }],
    });
    const r = applyIntent(
      s,
      intent('GainResource', { participantId: 'pc_talent', name: 'focus', amount: 5 }),
    );
    expect(r.errors).toBeUndefined();
    expect(getParticipant(r.state, 'pc_talent')?.heroicResources[0]?.value).toBe(10);
  });

  it('errors with resource_missing when the resource is not yet initialized', () => {
    const s = ready();
    const r = applyIntent(
      s,
      intent('GainResource', { participantId: 'pc_talent', name: 'clarity', amount: 3 }),
    );
    expect(r.errors?.[0]?.code).toBe('resource_missing');
  });

  it('rejects with floor_breach when a negative amount would breach the floor', () => {
    const s = ready({
      heroicResources: [{ name: 'essence', value: 1, floor: 0 }],
    });
    const r = applyIntent(
      s,
      intent('GainResource', { participantId: 'pc_talent', name: 'essence', amount: -5 }),
    );
    expect(r.errors?.[0]?.code).toBe('floor_breach');
  });

  it('works on a named extras pool (homebrew / epic secondary)', () => {
    const s = ready({
      extras: [{ name: 'virtue', value: 1, floor: 0 }],
    });
    const r = applyIntent(
      s,
      intent('GainResource', {
        participantId: 'pc_talent',
        name: { extra: 'virtue' },
        amount: 2,
      }),
    );
    expect(r.errors).toBeUndefined();
    expect(getParticipant(r.state, 'pc_talent')?.extras[0]?.value).toBe(3);
  });

  it('rejects with no_active_encounter when there is no active encounter', () => {
    const r = applyIntent(
      emptyCampaignState(campaignId, 'user-owner'),
      intent('GainResource', { participantId: 'pc_talent', name: 'clarity', amount: 1 }),
    );
    expect(r.errors?.[0]?.code).toBe('no_active_encounter');
  });

  it('rejects with target_missing when the participant is not in the encounter', () => {
    const r = applyIntent(
      ready(),
      intent('GainResource', { participantId: 'ghost', name: 'clarity', amount: 1 }),
    );
    expect(r.errors?.[0]?.code).toBe('target_missing');
  });

  it('rejects with invalid_payload when the resource name is not in the typed registry', () => {
    const r = applyIntent(
      ready(),
      intent('GainResource', { participantId: 'pc_talent', name: 'mana', amount: 1 }),
    );
    expect(r.errors?.[0]?.code).toBe('invalid_payload');
  });
});

describe('applyIntent — SpendResource', () => {
  it('decrements value on an existing resource', () => {
    const s = ready({
      heroicResources: [{ name: 'focus', value: 5, floor: 0 }],
    });
    const r = applyIntent(
      s,
      intent('SpendResource', { participantId: 'pc_talent', name: 'focus', amount: 2 }),
    );
    expect(r.errors).toBeUndefined();
    expect(getParticipant(r.state, 'pc_talent')?.heroicResources[0]?.value).toBe(3);
  });

  it('rejects with floor_breach when value - amount < floor (non-Talent, floor 0)', () => {
    const s = ready({
      heroicResources: [{ name: 'focus', value: 1, floor: 0 }],
    });
    const r = applyIntent(
      s,
      intent('SpendResource', { participantId: 'pc_talent', name: 'focus', amount: 5 }),
    );
    expect(r.errors?.[0]?.code).toBe('floor_breach');
  });

  it('Talent Clarity may go negative within floor = -(1 + Reason)', () => {
    const s = ready({
      heroicResources: [{ name: 'clarity', value: 2, floor: -3 }],
    });
    // Reason 2 → floor -3. Spending 5 takes clarity to -3 (legal).
    const r = applyIntent(
      s,
      intent('SpendResource', {
        participantId: 'pc_talent',
        name: 'clarity',
        amount: 5,
        reason: 'Clarity Shard ability',
      }),
    );
    expect(r.errors).toBeUndefined();
    expect(getParticipant(r.state, 'pc_talent')?.heroicResources[0]?.value).toBe(-3);
  });

  it('Talent Clarity rejects with floor_breach when spending would go below -(1 + Reason)', () => {
    const s = ready({
      heroicResources: [{ name: 'clarity', value: 2, floor: -3 }],
    });
    // Spending 6 would take clarity to -4 — breaches floor of -3.
    const r = applyIntent(
      s,
      intent('SpendResource', { participantId: 'pc_talent', name: 'clarity', amount: 6 }),
    );
    expect(r.errors?.[0]?.code).toBe('floor_breach');
    // State unchanged.
    expect(getParticipant(s, 'pc_talent')?.heroicResources[0]?.value).toBe(2);
  });

  it('rejects with resource_missing when the resource is not allocated', () => {
    const s = ready();
    const r = applyIntent(
      s,
      intent('SpendResource', { participantId: 'pc_talent', name: 'clarity', amount: 1 }),
    );
    expect(r.errors?.[0]?.code).toBe('resource_missing');
  });

  it('rejects non-positive amount with invalid_payload', () => {
    const r = applyIntent(
      ready(),
      intent('SpendResource', { participantId: 'pc_talent', name: 'clarity', amount: 0 }),
    );
    expect(r.errors?.[0]?.code).toBe('invalid_payload');
  });
});

describe('applyIntent — SetResource (manual override)', () => {
  it('creates the resource when initialize is provided and resource is absent', () => {
    const s = ready();
    const r = applyIntent(
      s,
      intent('SetResource', {
        participantId: 'pc_talent',
        name: 'clarity',
        value: 0,
        initialize: { floor: -3 },
      }),
    );
    expect(r.errors).toBeUndefined();
    const res = getParticipant(r.state, 'pc_talent')?.heroicResources;
    expect(res).toHaveLength(1);
    expect(res?.[0]).toMatchObject({ name: 'clarity', value: 0, floor: -3 });
  });

  it('rejects with resource_missing when neither resource nor initialize is provided', () => {
    const s = ready();
    const r = applyIntent(
      s,
      intent('SetResource', { participantId: 'pc_talent', name: 'clarity', value: 5 }),
    );
    expect(r.errors?.[0]?.code).toBe('resource_missing');
  });

  it('replaces the value on an existing resource, ignoring floor (override path)', () => {
    const s = ready({
      heroicResources: [{ name: 'clarity', value: 2, floor: -3 }],
    });
    // Director sets clarity to -10 — would normally breach floor, but SetResource
    // is the manual override path and ignores floor.
    const r = applyIntent(
      s,
      intent('SetResource', { participantId: 'pc_talent', name: 'clarity', value: -10 }),
    );
    expect(r.errors).toBeUndefined();
    expect(getParticipant(r.state, 'pc_talent')?.heroicResources[0]?.value).toBe(-10);
  });

  it('initializes an extras pool', () => {
    const s = ready();
    const r = applyIntent(
      s,
      intent('SetResource', {
        participantId: 'pc_talent',
        name: { extra: 'virtue' },
        value: 5,
        initialize: { max: 10 },
      }),
    );
    expect(r.errors).toBeUndefined();
    const extras = getParticipant(r.state, 'pc_talent')?.extras;
    expect(extras).toHaveLength(1);
    expect(extras?.[0]).toMatchObject({ name: 'virtue', value: 5, max: 10, floor: 0 });
  });
});

describe('applyIntent — SpendSurge', () => {
  it('decrements the universal surges pool', () => {
    const s = ready({ surges: 3 });
    const r = applyIntent(s, intent('SpendSurge', { participantId: 'pc_talent', count: 2 }));
    expect(r.errors).toBeUndefined();
    expect(getParticipant(r.state, 'pc_talent')?.surges).toBe(1);
  });

  it('rejects with insufficient_surges when count > surges', () => {
    const s = ready({ surges: 1 });
    const r = applyIntent(s, intent('SpendSurge', { participantId: 'pc_talent', count: 3 }));
    expect(r.errors?.[0]?.code).toBe('insufficient_surges');
    expect(getParticipant(s, 'pc_talent')?.surges).toBe(1);
  });

  it('rejects non-positive count with invalid_payload', () => {
    const r = applyIntent(
      ready({ surges: 2 }),
      intent('SpendSurge', { participantId: 'pc_talent', count: 0 }),
    );
    expect(r.errors?.[0]?.code).toBe('invalid_payload');
  });
});

describe('applyIntent — SpendRecovery + ApplyHeal', () => {
  it('SpendRecovery decrements recoveries.current and emits derived ApplyHeal', () => {
    const s = ready({
      currentStamina: 10,
      maxStamina: 30,
      recoveries: { current: 4, max: 4 },
      recoveryValue: 10,
    });
    const r = applyIntent(s, intent('SpendRecovery', { participantId: 'pc_talent' }));
    expect(r.errors).toBeUndefined();
    expect(getParticipant(r.state, 'pc_talent')?.recoveries.current).toBe(3);
    expect(r.derived).toHaveLength(1);
    expect(r.derived[0]?.type).toBe('ApplyHeal');
    expect(r.derived[0]?.payload).toMatchObject({ targetId: 'pc_talent', amount: 10 });
  });

  it('rejects with no_recoveries when recoveries.current is 0', () => {
    const s = ready({ recoveries: { current: 0, max: 4 }, recoveryValue: 10 });
    const r = applyIntent(s, intent('SpendRecovery', { participantId: 'pc_talent' }));
    expect(r.errors?.[0]?.code).toBe('no_recoveries');
  });

  it('ApplyHeal restores HP up to maxStamina (cap)', () => {
    const s = ready({ currentStamina: 25, maxStamina: 30 });
    const r = applyIntent(s, intent('ApplyHeal', { targetId: 'pc_talent', amount: 100 }));
    expect(r.errors).toBeUndefined();
    expect(getParticipant(r.state, 'pc_talent')?.currentStamina).toBe(30);
  });

  it('ApplyHeal climbs from a low value correctly', () => {
    // Slice 7 doesn't model dying (canon §2.8 — that's a damage-pipeline
    // concern). currentStamina min is 0 per the schema; ApplyHeal of N from
    // 0 climbs to N (capped at max).
    const s = ready({ currentStamina: 0, maxStamina: 30 });
    const r = applyIntent(s, intent('ApplyHeal', { targetId: 'pc_talent', amount: 12 }));
    expect(r.errors).toBeUndefined();
    expect(getParticipant(r.state, 'pc_talent')?.currentStamina).toBe(12);
  });

  it('ApplyHeal rejects with target_missing for an unknown target', () => {
    const r = applyIntent(ready(), intent('ApplyHeal', { targetId: 'ghost', amount: 5 }));
    expect(r.errors?.[0]?.code).toBe('target_missing');
  });
});

describe('applyIntent — Director Malice intents', () => {
  it('GainMalice adds to encounter.malice.current', () => {
    const s = ready();
    const r = applyIntent(s, intent('GainMalice', { amount: 9 }));
    expect(r.errors).toBeUndefined();
    expect(r.state.encounter?.malice.current).toBe(9);
  });

  it('GainMalice with negative amount is permitted (canon §5.5)', () => {
    let s = ready();
    s = applyIntent(s, intent('GainMalice', { amount: 9 })).state;
    const r = applyIntent(s, intent('GainMalice', { amount: -2 }));
    expect(r.errors).toBeUndefined();
    expect(r.state.encounter?.malice.current).toBe(7);
  });

  it('SpendMalice subtracts and can drive current negative (canon §5.5 — no floor)', () => {
    let s = ready();
    s = applyIntent(s, intent('GainMalice', { amount: 2 })).state;
    const r = applyIntent(s, intent('SpendMalice', { amount: 5, reason: 'Sap Strength' }));
    expect(r.errors).toBeUndefined();
    expect(r.state.encounter?.malice.current).toBe(-3);
  });

  it('GainMalice rejects with no_active_encounter when no encounter', () => {
    const r = applyIntent(
      emptyCampaignState(campaignId, 'user-owner'),
      intent('GainMalice', { amount: 3 }),
    );
    expect(r.errors?.[0]?.code).toBe('no_active_encounter');
  });

  it('SpendMalice rejects with no_active_encounter when no encounter', () => {
    const r = applyIntent(
      emptyCampaignState(campaignId, 'user-owner'),
      intent('SpendMalice', { amount: 3 }),
    );
    expect(r.errors?.[0]?.code).toBe('no_active_encounter');
  });

  it('SpendMalice rejects non-positive amount', () => {
    const r = applyIntent(ready(), intent('SpendMalice', { amount: 0 }));
    expect(r.errors?.[0]?.code).toBe('invalid_payload');
  });
});

describe('applyIntent — EndTurn Talent Clarity EoT damage hook', () => {
  function readyForTalent(over?: Partial<Participant>): CampaignState {
    // Directly construct state with encounter phase — independent of StartEncounter
    // roster-replacement semantics (StartEncounter now atomically replaces the
    // roster from stampedPcs; seeded participants would be wiped out).
    const participants = [pc(over), monster()];
    let s: CampaignState = {
      ...emptyCampaignState(campaignId, 'user-owner'),
      participants,
      encounter: {
        id: 'enc_test',
        currentRound: 1,
        activeParticipantId: null,
        turnState: {},
        malice: { current: 0, lastMaliciousStrikeRound: null },
        firstSide: null,
        currentPickingSide: null,
        actedThisRound: [],
      },
    };
    s = applyIntent(s, intent('StartRound', {})).state;
    // StartRound no longer pre-activates; directly set activeParticipantId to
    // simulate a mid-turn state (avoids the d3-roll requirement in StartTurn).
    s = { ...s, encounter: { ...s.encounter!, activeParticipantId: 'pc_talent' } };
    return s;
  }

  it('emits derived ApplyDamage when ending Talent turn with clarity < 0', () => {
    const s = readyForTalent({
      heroicResources: [{ name: 'clarity', value: -2, floor: -3 }],
    });
    const r = applyIntent(s, intent('EndTurn', {}));
    expect(r.errors).toBeUndefined();
    const heal = r.derived.find((d) => d.type === 'ApplyDamage');
    expect(heal).toBeDefined();
    expect(heal?.payload).toMatchObject({
      targetId: 'pc_talent',
      amount: 2,
      damageType: 'untyped',
    });
  });

  it('does NOT emit clarity damage when clarity >= 0', () => {
    const s = readyForTalent({
      heroicResources: [{ name: 'clarity', value: 0, floor: -3 }],
    });
    const r = applyIntent(s, intent('EndTurn', {}));
    expect(r.errors).toBeUndefined();
    const dmg = r.derived.find((d) => d.type === 'ApplyDamage');
    expect(dmg).toBeUndefined();
  });

  it('does NOT emit clarity damage for a participant without a clarity instance', () => {
    const s = readyForTalent({
      heroicResources: [{ name: 'focus', value: 5, floor: 0 }],
    });
    const r = applyIntent(s, intent('EndTurn', {}));
    expect(r.errors).toBeUndefined();
    const dmg = r.derived.find((d) => d.type === 'ApplyDamage');
    expect(dmg).toBeUndefined();
  });

  it('emits clarity damage alongside slice-6 save_ends RollResistance cascade', () => {
    const s = applyIntent(
      readyForTalent({
        heroicResources: [{ name: 'clarity', value: -1, floor: -3 }],
      }),
      intent('SetCondition', {
        targetId: 'pc_talent',
        condition: 'Bleeding',
        source: { kind: 'effect', id: 'spell_x' },
        duration: { kind: 'save_ends' },
      }),
    ).state;

    const r = applyIntent(s, intent('EndTurn', { saveRolls: [3] }));
    expect(r.errors).toBeUndefined();
    expect(r.derived.find((d) => d.type === 'RollResistance')).toBeDefined();
    expect(r.derived.find((d) => d.type === 'ApplyDamage')).toBeDefined();
  });
});
