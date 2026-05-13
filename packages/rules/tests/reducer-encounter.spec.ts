import type { Intent, Participant } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import {
  type CampaignState,
  type ReducerContext,
  type StampedIntent,
  applyIntent,
  emptyCampaignState,
  isParticipant,
} from '../src/index';
import { buildBundleWithFury, buildFuryL1Fixture } from './fixtures/character-runtime';

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

function withEncounter(): CampaignState {
  let s = emptyCampaignState(campaignId, 'user-owner');
  s = applyIntent(s, intent('StartEncounter', {})).state;
  return s;
}

// Directly construct state with a seeded roster + active encounter.
// Tests that exercise RollPower/ApplyDamage don't need to go through
// StartEncounter — they just need participants and an encounter phase.
function withRosterAndEncounter(): CampaignState {
  let s = emptyCampaignState(campaignId, 'user-owner');
  const participants = [pc(), monster()];
  s = {
    ...s,
    participants,
    encounter: {
      id: 'enc_test',
      currentRound: 1,
      turnOrder: participants.map((p) => p.id),
      activeParticipantId: null,
      turnState: {},
      malice: { current: 0, lastMaliciousStrikeRound: null },
    },
  };
  return s;
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
    activeAbilities: [],
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
    ...over,
  };
}

describe('applyIntent — StartEncounter', () => {
  it('initialises encounter with a generated id and empty roster when no stampedPcs/stampedMonsters', () => {
    const s = emptyCampaignState(campaignId, 'user-owner');
    const r = applyIntent(s, intent('StartEncounter', {}));
    expect(r.errors).toBeUndefined();
    expect(r.state.encounter).not.toBeNull();
    expect(r.state.encounter?.id).toMatch(/.{20,}/); // ULID
    expect(r.state.encounter?.currentRound).toBe(1);
    expect(r.state.encounter?.turnOrder).toHaveLength(0);
    expect(r.state.encounter?.activeParticipantId).toBeNull();
    expect(r.state.encounter?.malice).toEqual({ current: 0, lastMaliciousStrikeRound: null });
  });

  it('engages empty roster (zero participants) without error', () => {
    const r = applyIntent(
      emptyCampaignState(campaignId, 'user-owner'),
      intent('StartEncounter', {}),
    );
    expect(r.errors).toBeUndefined();
    expect(r.state.encounter?.turnOrder).toHaveLength(0);
    expect(r.state.participants).toHaveLength(0);
  });

  it('rejects starting when an encounter is already active', () => {
    const s = applyIntent(
      emptyCampaignState(campaignId, 'user-owner'),
      intent('StartEncounter', {}),
    ).state;
    const r = applyIntent(s, intent('StartEncounter', {}));
    expect(r.errors?.[0]?.code).toBe('encounter_already_active');
    expect(r.state.encounter?.id).toBe(s.encounter?.id); // unchanged
  });

  it('StartEncounter with stampedPcs materializes PC and adds to turnOrder', () => {
    const ctx: ReducerContext = { staticData: buildBundleWithFury() };
    const character = buildFuryL1Fixture();
    const stampedPcs = [{ characterId: 'char-1', ownerId: 'user-player', name: 'Kaela', character }];
    const s = emptyCampaignState(campaignId, 'user-owner');
    const r = applyIntent(s, intent('StartEncounter', { stampedPcs }), ctx);
    expect(r.errors).toBeUndefined();
    const pc = r.state.participants.find(
      (p): p is Participant => isParticipant(p) && p.kind === 'pc',
    );
    expect(pc).toBeDefined();
    expect(r.state.encounter?.turnOrder).toContain(`pc:char-1`);
  });
});

describe('applyIntent — RollPower', () => {
  function ready(): CampaignState {
    return withRosterAndEncounter();
  }

  const ladder = {
    t1: { damage: 2, damageType: 'fire' as const },
    t2: { damage: 5, damageType: 'fire' as const },
    t3: { damage: 9, damageType: 'fire' as const },
  };

  it('emits one derived ApplyDamage per target with the tier effect', () => {
    const r = applyIntent(
      ready(),
      intent('RollPower', {
        abilityId: 'fireball',
        attackerId: 'pc_alice',
        targetIds: ['m_goblin'],
        characteristic: 'might',
        edges: 0,
        banes: 0,
        rolls: { d10: [6, 6] }, // total 14 = t2
        ladder,
      }),
    );
    expect(r.errors).toBeUndefined();
    expect(r.derived).toHaveLength(1);
    expect(r.derived[0]?.type).toBe('ApplyDamage');
    const p = r.derived[0]?.payload as { amount: number; damageType: string; targetId: string };
    expect(p.amount).toBe(5);
    expect(p.damageType).toBe('fire');
    expect(p.targetId).toBe('m_goblin');
  });

  it('attacker characteristic affects the tier (positive)', () => {
    const r = applyIntent(
      ready(),
      intent('RollPower', {
        abilityId: 'fireball',
        attackerId: 'pc_alice',
        targetIds: ['m_goblin'],
        characteristic: 'might',
        edges: 0,
        banes: 0,
        rolls: { d10: [5, 5] }, // natural 10 + might 2 = 12 = t2
        ladder,
      }),
    );
    expect((r.derived[0]?.payload as { amount: number }).amount).toBe(5);
  });

  it('rejects when attacker not in encounter', () => {
    const r = applyIntent(
      ready(),
      intent('RollPower', {
        abilityId: 'a',
        attackerId: 'ghost',
        targetIds: ['m_goblin'],
        characteristic: 'might',
        edges: 0,
        banes: 0,
        rolls: { d10: [5, 5] },
        ladder,
      }),
    );
    expect(r.errors?.[0]?.code).toBe('attacker_missing');
  });

  it('rejects when any target not in encounter', () => {
    const r = applyIntent(
      ready(),
      intent('RollPower', {
        abilityId: 'a',
        attackerId: 'pc_alice',
        targetIds: ['ghost'],
        characteristic: 'might',
        edges: 0,
        banes: 0,
        rolls: { d10: [5, 5] },
        ladder,
      }),
    );
    expect(r.errors?.[0]?.code).toBe('target_missing');
  });

  it('rejects RollPower with no active encounter', () => {
    const r = applyIntent(
      emptyCampaignState(campaignId, 'user-owner'),
      intent('RollPower', {
        abilityId: 'a',
        attackerId: 'x',
        targetIds: ['y'],
        characteristic: 'might',
        edges: 0,
        banes: 0,
        rolls: { d10: [5, 5] },
        ladder,
      }),
    );
    expect(r.errors?.[0]?.code).toBe('no_active_encounter');
  });

  it('multi-target emits one derived ApplyDamage per target', () => {
    const participants = [pc(), monster(), monster({ id: 'm_goblin_2', name: 'Goblin 2' })];
    let s: CampaignState = {
      ...emptyCampaignState(campaignId, 'user-owner'),
      participants,
      encounter: {
        id: 'enc_multi',
        currentRound: 1,
        turnOrder: participants.map((p) => p.id),
        activeParticipantId: null,
        turnState: {},
        malice: { current: 0, lastMaliciousStrikeRound: null },
      },
    };
    const r = applyIntent(
      s,
      intent('RollPower', {
        abilityId: 'fireball',
        attackerId: 'pc_alice',
        targetIds: ['m_goblin', 'm_goblin_2'],
        characteristic: 'might',
        edges: 0,
        banes: 0,
        rolls: { d10: [6, 6] },
        ladder,
      }),
    );
    expect(r.derived).toHaveLength(2);
    expect(r.derived.every((d) => d.type === 'ApplyDamage')).toBe(true);
  });
});

describe('applyIntent — ApplyDamage', () => {
  function readyWithGoblin(): CampaignState {
    const participants = [monster()];
    return {
      ...emptyCampaignState(campaignId, 'user-owner'),
      participants,
      encounter: {
        id: 'enc_goblin',
        currentRound: 1,
        turnOrder: participants.map((p) => p.id),
        activeParticipantId: null,
        turnState: {},
        malice: { current: 0, lastMaliciousStrikeRound: null },
      },
    };
  }

  it('reduces the target participant stamina', () => {
    const r = applyIntent(
      readyWithGoblin(),
      intent('ApplyDamage', {
        targetId: 'm_goblin',
        amount: 5,
        damageType: 'untyped',
        sourceIntentId: 'parent_id',
      }),
    );
    expect(r.errors).toBeUndefined();
    const goblin = r.state.participants.find(
      (p): p is Participant => isParticipant(p) && p.id === 'm_goblin',
    );
    expect(goblin?.currentStamina).toBe(15);
  });

  it('rejects when target not in encounter', () => {
    const r = applyIntent(
      readyWithGoblin(),
      intent('ApplyDamage', {
        targetId: 'ghost',
        amount: 5,
        damageType: 'untyped',
        sourceIntentId: 'parent',
      }),
    );
    expect(r.errors?.[0]?.code).toBe('target_missing');
  });
});

describe('end-to-end: RollPower → derived ApplyDamage cascade', () => {
  it('applying both intents in order reduces the target stamina', () => {
    const participants = [pc(), monster({ weaknesses: [{ type: 'fire', value: 3 }] })];
    let s: CampaignState = {
      ...emptyCampaignState(campaignId, 'user-owner'),
      participants,
      encounter: {
        id: 'enc_cascade',
        currentRound: 1,
        turnOrder: participants.map((p) => p.id),
        activeParticipantId: null,
        turnState: {},
        malice: { current: 0, lastMaliciousStrikeRound: null },
      },
    };

    // Roll
    const ladder = {
      t1: { damage: 2, damageType: 'fire' as const },
      t2: { damage: 5, damageType: 'fire' as const },
      t3: { damage: 9, damageType: 'fire' as const },
    };
    const rollResult = applyIntent(
      s,
      intent('RollPower', {
        abilityId: 'fireball',
        attackerId: 'pc_alice',
        targetIds: ['m_goblin'],
        characteristic: 'might',
        edges: 0,
        banes: 0,
        rolls: { d10: [9, 9] }, // natural 18 + might 2 = 20 = t3
        ladder,
      }),
    );
    s = rollResult.state;
    expect(rollResult.derived).toHaveLength(1);

    // Apply the derived intent
    const derived = rollResult.derived[0];
    if (!derived) throw new Error('no derived');
    const damageResult = applyIntent(s, {
      ...derived,
      id: 'derived_1',
      campaignId,
      timestamp: T + 1,
    });
    const goblin = damageResult.state.participants.find(
      (p): p is Participant => isParticipant(p) && p.id === 'm_goblin',
    );
    // t3 damage 9 + weakness 3 = 12 dealt; 20 - 12 = 8
    expect(goblin?.currentStamina).toBe(8);
  });
});
