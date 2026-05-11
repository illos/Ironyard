import type { Intent, Participant } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import {
  type SessionState,
  type StampedIntent,
  applyIntent,
  emptySessionState,
} from '../src/index';

const T = 1_700_000_000_000;
const sessionId = 'sess_test';

function intent(type: string, payload: unknown, overrides: Partial<Intent> = {}): StampedIntent {
  return {
    id: overrides.id ?? `i_${Math.random().toString(36).slice(2)}`,
    sessionId: overrides.sessionId ?? sessionId,
    actor: overrides.actor ?? { userId: 'alice', role: 'director' },
    timestamp: overrides.timestamp ?? T,
    source: overrides.source ?? 'manual',
    type,
    payload,
    causedBy: overrides.causedBy,
  };
}

function withEncounter(): SessionState {
  let s = emptySessionState(sessionId);
  s = applyIntent(s, intent('StartEncounter', { encounterId: 'enc_1' })).state;
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
    ...over,
  };
}

describe('applyIntent — StartEncounter', () => {
  it('initialises activeEncounter', () => {
    const r = applyIntent(
      emptySessionState(sessionId),
      intent('StartEncounter', { encounterId: 'e1' }),
    );
    expect(r.errors).toBeUndefined();
    expect(r.state.activeEncounter).toEqual({
      id: 'e1',
      participants: [],
      currentRound: null,
      turnOrder: [],
      activeParticipantId: null,
      turnState: {},
      // Slice 7: Director's Malice initialized to 0 with no Malicious Strike
      // history (canon §5.5).
      malice: { current: 0, lastMaliciousStrikeRound: null },
    });
  });

  it('is idempotent for the same encounter id', () => {
    const s = applyIntent(
      emptySessionState(sessionId),
      intent('StartEncounter', { encounterId: 'e1' }),
    ).state;
    const r = applyIntent(s, intent('StartEncounter', { encounterId: 'e1' }));
    expect(r.errors).toBeUndefined();
    expect(r.state.activeEncounter?.id).toBe('e1');
  });

  it('rejects a different encounter while one is active', () => {
    const s = applyIntent(
      emptySessionState(sessionId),
      intent('StartEncounter', { encounterId: 'e1' }),
    ).state;
    const r = applyIntent(s, intent('StartEncounter', { encounterId: 'e2' }));
    expect(r.errors?.[0]?.code).toBe('encounter_active');
    expect(r.state.activeEncounter?.id).toBe('e1'); // unchanged
  });
});

describe('applyIntent — BringCharacterIntoEncounter', () => {
  it('appends the participant to the active encounter', () => {
    const r = applyIntent(
      withEncounter(),
      intent('BringCharacterIntoEncounter', { participant: pc() }),
    );
    expect(r.errors).toBeUndefined();
    expect(r.state.activeEncounter?.participants).toHaveLength(1);
    expect(r.state.activeEncounter?.participants[0]?.name).toBe('Alice');
  });

  it('rejects with no_active_encounter when none is running', () => {
    const r = applyIntent(
      emptySessionState(sessionId),
      intent('BringCharacterIntoEncounter', { participant: pc() }),
    );
    expect(r.errors?.[0]?.code).toBe('no_active_encounter');
  });

  it('rejects duplicate participant ids', () => {
    const s = applyIntent(
      withEncounter(),
      intent('BringCharacterIntoEncounter', { participant: pc() }),
    ).state;
    const r = applyIntent(s, intent('BringCharacterIntoEncounter', { participant: pc() }));
    expect(r.errors?.[0]?.code).toBe('duplicate_participant');
  });

  it('rejects an invalid Participant payload', () => {
    const r = applyIntent(
      withEncounter(),
      intent('BringCharacterIntoEncounter', { participant: { id: '', name: 'X' } }),
    );
    expect(r.errors?.[0]?.code).toBe('invalid_payload');
  });
});

describe('applyIntent — RollPower', () => {
  function ready(): SessionState {
    let s = withEncounter();
    s = applyIntent(s, intent('BringCharacterIntoEncounter', { participant: pc() })).state;
    s = applyIntent(s, intent('BringCharacterIntoEncounter', { participant: monster() })).state;
    return s;
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
      emptySessionState(sessionId),
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
    let s = withEncounter();
    s = applyIntent(s, intent('BringCharacterIntoEncounter', { participant: pc() })).state;
    s = applyIntent(s, intent('BringCharacterIntoEncounter', { participant: monster() })).state;
    s = applyIntent(
      s,
      intent('BringCharacterIntoEncounter', {
        participant: monster({ id: 'm_goblin_2', name: 'Goblin 2' }),
      }),
    ).state;
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
  function readyWithGoblin(): SessionState {
    let s = withEncounter();
    s = applyIntent(s, intent('BringCharacterIntoEncounter', { participant: monster() })).state;
    return s;
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
    const goblin = r.state.activeEncounter?.participants.find((p) => p.id === 'm_goblin');
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
    let s = withEncounter();
    s = applyIntent(s, intent('BringCharacterIntoEncounter', { participant: pc() })).state;
    s = applyIntent(
      s,
      intent('BringCharacterIntoEncounter', {
        participant: monster({ weaknesses: [{ type: 'fire', value: 3 }] }),
      }),
    ).state;

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
      sessionId,
      timestamp: T + 1,
    });
    const goblin = damageResult.state.activeEncounter?.participants.find(
      (p) => p.id === 'm_goblin',
    );
    // t3 damage 9 + weakness 3 = 12 dealt; 20 - 12 = 8
    expect(goblin?.currentStamina).toBe(8);
  });
});
