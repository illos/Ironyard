import { describe, expect, it } from 'vitest';
import { applyKnockUnconscious } from '../../src/intents/knock-unconscious';
import {
  OWNER_ID,
  baseState,
  makeHeroParticipant,
  makeMonsterParticipant,
  makeRunningEncounterPhase,
  ownerActor,
  stamped,
} from './test-utils';

const TARGET_ID = 'pc:hero-1';
const ATTACKER_ID = 'm:monster-1';
const PLAYER_ID = 'player-2';

function stateWithHeroAndMonster(heroOverrides = {}, monsterOverrides = {}) {
  const hero = makeHeroParticipant(TARGET_ID, {
    ownerId: OWNER_ID,
    currentStamina: 10,
    maxStamina: 30,
    staminaState: 'dying',
    ...heroOverrides,
  });
  const monster = makeMonsterParticipant(ATTACKER_ID, { ownerId: null, ...monsterOverrides });
  return baseState({
    currentSessionId: 'sess-1',
    participants: [hero, monster],
    encounter: makeRunningEncounterPhase('enc-1'),
  });
}

function knockIntent(
  opts: {
    targetId?: string;
    attackerId?: string | null;
    userId?: string;
  } = {},
) {
  return stamped({
    type: 'KnockUnconscious',
    actor: { userId: opts.userId ?? OWNER_ID, role: 'director' },
    payload: {
      targetId: opts.targetId ?? TARGET_ID,
      attackerId: opts.attackerId !== undefined ? opts.attackerId : null,
    },
  });
}

describe('applyKnockUnconscious — director path', () => {
  it('director can knock a target unconscious', () => {
    const s = stateWithHeroAndMonster();
    const result = applyKnockUnconscious(s, knockIntent());
    expect(result.errors ?? []).toEqual([]);
    const updated = result.state.participants.find((p) => p.id === TARGET_ID)!;
    expect(updated.staminaState).toBe('unconscious');
  });

  it('adds Unconscious and Prone conditions', () => {
    const s = stateWithHeroAndMonster();
    const result = applyKnockUnconscious(s, knockIntent());
    const updated = result.state.participants.find((p) => p.id === TARGET_ID)!;
    expect(updated.conditions.some((c) => c.type === 'Unconscious')).toBe(true);
    expect(updated.conditions.some((c) => c.type === 'Prone')).toBe(true);
  });

  it('emits StaminaTransitioned with cause=damage', () => {
    const s = stateWithHeroAndMonster();
    const result = applyKnockUnconscious(s, knockIntent());
    expect(result.derived).toHaveLength(1);
    const st = result.derived[0]!;
    expect(st.type).toBe('StaminaTransitioned');
    const p = st.payload as { from: string; to: string; cause: string };
    expect(p.to).toBe('unconscious');
    expect(p.cause).toBe('damage');
  });

  it('logs the knock unconscious event', () => {
    const s = stateWithHeroAndMonster();
    const result = applyKnockUnconscious(s, knockIntent());
    expect(result.log[0]!.text).toContain('knocked unconscious');
  });
});

describe('applyKnockUnconscious — attacker-owner path', () => {
  it('attacker owner can knock a target unconscious', () => {
    // Hero (OWNER_ID) attacks a monster; we flip roles: hero is attacker, monster is target
    const attacker = makeHeroParticipant('pc:attacker', { ownerId: OWNER_ID });
    const target = makeMonsterParticipant('m:target', {
      currentStamina: 10,
      staminaState: 'winded',
    });
    const s = baseState({
      currentSessionId: 'sess-1',
      participants: [attacker, target],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const result = applyKnockUnconscious(
      s,
      stamped({
        type: 'KnockUnconscious',
        actor: { userId: OWNER_ID, role: 'player' },
        payload: { targetId: 'm:target', attackerId: 'pc:attacker' },
      }),
    );
    expect(result.errors ?? []).toEqual([]);
    const updated = result.state.participants.find((p) => p.id === 'm:target')!;
    expect(updated.staminaState).toBe('unconscious');
  });
});

describe('applyKnockUnconscious — rejections', () => {
  it('rejects non-director without attacker relationship', () => {
    const s = stateWithHeroAndMonster();
    const result = applyKnockUnconscious(
      s,
      stamped({
        type: 'KnockUnconscious',
        actor: { userId: PLAYER_ID, role: 'player' },
        payload: { targetId: TARGET_ID, attackerId: null },
      }),
    );
    expect(result.errors?.[0]?.code).toBe('not_authorized');
  });

  it('rejects when target not found', () => {
    const s = stateWithHeroAndMonster();
    const result = applyKnockUnconscious(s, knockIntent({ targetId: 'unknown' }));
    expect(result.errors?.[0]?.code).toBe('target_missing');
  });

  it('accepts null attackerId for environmental KO by director', () => {
    const s = stateWithHeroAndMonster();
    const result = applyKnockUnconscious(s, knockIntent({ attackerId: null }));
    expect(result.errors ?? []).toEqual([]);
  });
});
