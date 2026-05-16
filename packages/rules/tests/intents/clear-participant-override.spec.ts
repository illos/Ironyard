import { describe, expect, it } from 'vitest';
import { applyClearParticipantOverride } from '../../src/intents/clear-participant-override';
import {
  OWNER_ID,
  baseState,
  makeHeroParticipant,
  makeRunningEncounterPhase,
  stamped,
} from './test-utils';

const TARGET_ID = 'pc:hero-1';
const PLAYER_ID = 'player-2';

function stateWithHero(heroOverrides = {}) {
  const hero = makeHeroParticipant(TARGET_ID, { ownerId: OWNER_ID, ...heroOverrides });
  return baseState({
    currentSessionId: 'sess-1',
    participants: [hero],
    encounter: makeRunningEncounterPhase('enc-1'),
  });
}

function clearIntent(opts: { participantId?: string; userId?: string } = {}) {
  return stamped({
    type: 'ClearParticipantOverride',
    actor: { userId: opts.userId ?? OWNER_ID, role: 'director' },
    payload: { participantId: opts.participantId ?? TARGET_ID },
  });
}

describe('applyClearParticipantOverride — director clears override', () => {
  it('clears a doomed override and recomputes state to natural derivation', () => {
    const s = stateWithHero({
      currentStamina: 20,
      maxStamina: 30,
      staminaState: 'doomed',
      staminaOverride: {
        kind: 'doomed',
        source: 'manual',
        canRegainStamina: true,
        autoTier3OnPowerRolls: true,
        staminaDeathThreshold: 'none',
        dieAtEncounterEnd: true,
      },
    });
    const result = applyClearParticipantOverride(s, clearIntent());
    expect(result.errors ?? []).toEqual([]);
    const updated = result.state.participants.find((p) => p.id === TARGET_ID)!;
    expect(updated.staminaOverride).toBeNull();
    // 20/30 → winded threshold = 15; 20 > 15 → healthy
    expect(updated.staminaState).toBe('healthy');
  });

  it('emits StaminaTransitioned with cause=override-cleared when state changes', () => {
    const s = stateWithHero({
      currentStamina: 20,
      maxStamina: 30,
      staminaState: 'doomed',
      staminaOverride: {
        kind: 'doomed',
        source: 'manual',
        canRegainStamina: true,
        autoTier3OnPowerRolls: true,
        staminaDeathThreshold: 'none',
        dieAtEncounterEnd: true,
      },
    });
    const result = applyClearParticipantOverride(s, clearIntent());
    expect(result.derived).toHaveLength(1);
    const st = result.derived[0]!;
    expect(st.type).toBe('StaminaTransitioned');
    const p = st.payload as { from: string; to: string; cause: string };
    expect(p.from).toBe('doomed');
    expect(p.to).toBe('healthy');
    expect(p.cause).toBe('override-cleared');
  });

  it('clears an inert override and recomputes to dying (stamina still ≤ 0)', () => {
    const s = stateWithHero({
      currentStamina: -3,
      maxStamina: 30,
      staminaState: 'inert',
      staminaOverride: {
        kind: 'inert',
        source: 'revenant',
        instantDeathDamageTypes: ['fire'],
        regainHours: 12,
        regainAmount: 'recoveryValue',
        canRegainStamina: false,
      },
    });
    const result = applyClearParticipantOverride(s, clearIntent());
    expect(result.errors ?? []).toEqual([]);
    const updated = result.state.participants.find((p) => p.id === TARGET_ID)!;
    expect(updated.staminaOverride).toBeNull();
    // -3 stamina, PC → dying
    expect(updated.staminaState).toBe('dying');
  });

  it('emits no derived intents when state does not change after clear', () => {
    // Hero has CoP override but recoveries are not exhausted → staminaState would be healthy naturally
    // So override=null, staminaState='healthy' → no transition
    const s = stateWithHero({
      currentStamina: 20,
      maxStamina: 30,
      staminaState: 'healthy',
      staminaOverride: {
        kind: 'extra-dying-trigger',
        source: 'curse-of-punishment',
        predicate: 'recoveries-exhausted',
      },
      recoveries: { current: 3, max: 8 },
    });
    const result = applyClearParticipantOverride(s, clearIntent());
    expect(result.errors ?? []).toEqual([]);
    const updated = result.state.participants.find((p) => p.id === TARGET_ID)!;
    expect(updated.staminaOverride).toBeNull();
    // State should stay healthy — no transition emitted
    expect(result.derived).toHaveLength(0);
  });

  it('logs the clear event', () => {
    const s = stateWithHero({
      staminaState: 'doomed',
      staminaOverride: {
        kind: 'doomed',
        source: 'manual',
        canRegainStamina: true,
        autoTier3OnPowerRolls: true,
        staminaDeathThreshold: 'none',
        dieAtEncounterEnd: true,
      },
    });
    const result = applyClearParticipantOverride(s, clearIntent());
    expect(result.log[0]!.text).toContain('override cleared');
  });
});

describe('applyClearParticipantOverride — rejections', () => {
  it('rejects non-director player', () => {
    const s = stateWithHero({ staminaState: 'doomed' });
    const result = applyClearParticipantOverride(s, clearIntent({ userId: PLAYER_ID }));
    expect(result.errors?.[0]?.code).toBe('not_authorized');
  });

  it('rejects when target participant not found', () => {
    const s = stateWithHero();
    const result = applyClearParticipantOverride(s, clearIntent({ participantId: 'unknown' }));
    expect(result.errors?.[0]?.code).toBe('target_missing');
  });
});
