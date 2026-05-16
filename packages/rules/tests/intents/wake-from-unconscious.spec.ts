import { describe, expect, it } from 'vitest';
import { applyWakeFromUnconscious } from '../../src/intents/wake-from-unconscious';
import {
  OWNER_ID,
  baseState,
  makeHeroParticipant,
  makeMonsterParticipant,
  makeRunningEncounterPhase,
  stamped,
} from './test-utils';

const HERO_ID = 'pc:hero-1';
const MONSTER_ID = 'm:monster-1';
const PLAYER_ID = 'player-2';

function stateWithUnconsciousHero(overrides = {}) {
  const hero = makeHeroParticipant(HERO_ID, {
    ownerId: OWNER_ID,
    maxStamina: 30,
    currentStamina: 0,
    recoveryValue: 10,
    recoveries: { current: 4, max: 8 },
    staminaState: 'unconscious',
    conditions: [
      {
        type: 'Unconscious',
        duration: { kind: 'manual' },
        source: { kind: 'effect', id: 'ko-interception' },
        removable: true,
        appliedAtSeq: 0,
      },
      {
        type: 'Prone',
        duration: { kind: 'manual' },
        source: { kind: 'effect', id: 'ko-interception' },
        removable: true,
        appliedAtSeq: 0,
      },
    ],
    ...overrides,
  });
  return baseState({
    currentSessionId: 'sess-1',
    participants: [hero],
    encounter: makeRunningEncounterPhase('enc-1'),
  });
}

function wakeIntent(opts: { participantId?: string; userId?: string } = {}) {
  return stamped({
    type: 'WakeFromUnconscious',
    actor: { userId: opts.userId ?? OWNER_ID, role: 'director' },
    payload: { participantId: opts.participantId ?? HERO_ID },
  });
}

describe('applyWakeFromUnconscious — hero path', () => {
  it('spends a Recovery and restores recoveryValue stamina', () => {
    const s = stateWithUnconsciousHero();
    const result = applyWakeFromUnconscious(s, wakeIntent());
    expect(result.errors ?? []).toEqual([]);
    const updated = result.state.participants.find((p) => p.id === HERO_ID)!;
    expect(updated.currentStamina).toBe(10); // 0 + recoveryValue 10
    expect(updated.recoveries.current).toBe(3); // 4 - 1
  });

  it('clears Unconscious and Prone conditions', () => {
    const s = stateWithUnconsciousHero();
    const result = applyWakeFromUnconscious(s, wakeIntent());
    const updated = result.state.participants.find((p) => p.id === HERO_ID)!;
    expect(updated.conditions.some((c) => c.type === 'Unconscious')).toBe(false);
    expect(updated.conditions.some((c) => c.type === 'Prone')).toBe(false);
  });

  it('transitions to a sensible non-unconscious state', () => {
    const s = stateWithUnconsciousHero();
    const result = applyWakeFromUnconscious(s, wakeIntent());
    const updated = result.state.participants.find((p) => p.id === HERO_ID)!;
    // 10 stamina, max 30 → windedValue=15 → 10 ≤ 15 → winded
    expect(updated.staminaState).toBe('winded');
    const st = result.derived.find((d) => d.type === 'StaminaTransitioned');
    expect(st).toBeDefined();
    const p = st!.payload as { from: string; to: string };
    expect(p.from).toBe('unconscious');
    expect(p.to).toBe('winded');
  });

  it('rejects when the hero has no Recoveries left (canon: must respite)', () => {
    const s = stateWithUnconsciousHero({ recoveries: { current: 0, max: 8 } });
    const result = applyWakeFromUnconscious(s, wakeIntent());
    expect(result.errors?.[0]?.code).toBe('no_recoveries');
  });

  it('rejects when the participant is not unconscious', () => {
    const s = stateWithUnconsciousHero({ staminaState: 'healthy', conditions: [] });
    const result = applyWakeFromUnconscious(s, wakeIntent());
    expect(result.errors?.[0]?.code).toBe('not_unconscious');
  });
});

describe('applyWakeFromUnconscious — director creature path', () => {
  it('gains 1 Stamina and clears Unconscious/Prone', () => {
    const monster = makeMonsterParticipant(MONSTER_ID, {
      ownerId: null,
      maxStamina: 30,
      currentStamina: 0,
      staminaState: 'unconscious',
      conditions: [
        {
          type: 'Unconscious',
          duration: { kind: 'manual' },
          source: { kind: 'effect', id: 'ko-interception' },
          removable: true,
          appliedAtSeq: 0,
        },
        {
          type: 'Prone',
          duration: { kind: 'manual' },
          source: { kind: 'effect', id: 'ko-interception' },
          removable: true,
          appliedAtSeq: 0,
        },
      ],
    });
    const s = baseState({
      currentSessionId: 'sess-1',
      participants: [monster],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const result = applyWakeFromUnconscious(s, wakeIntent({ participantId: MONSTER_ID }));
    expect(result.errors ?? []).toEqual([]);
    const updated = result.state.participants.find((p) => p.id === MONSTER_ID)!;
    expect(updated.currentStamina).toBe(1);
    expect(updated.conditions.some((c) => c.type === 'Unconscious')).toBe(false);
    expect(updated.conditions.some((c) => c.type === 'Prone')).toBe(false);
  });
});

describe('applyWakeFromUnconscious — rejections', () => {
  it('rejects non-director player', () => {
    const s = stateWithUnconsciousHero();
    const result = applyWakeFromUnconscious(s, wakeIntent({ userId: PLAYER_ID }));
    expect(result.errors?.[0]?.code).toBe('not_authorized');
  });

  it('rejects when target is missing', () => {
    const s = stateWithUnconsciousHero();
    const result = applyWakeFromUnconscious(s, wakeIntent({ participantId: 'unknown' }));
    expect(result.errors?.[0]?.code).toBe('target_missing');
  });
});
