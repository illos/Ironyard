import type { ParticipantStateOverride } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import { applyApplyParticipantOverride } from '../../src/intents/apply-participant-override';
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

function overrideIntent(override: ParticipantStateOverride, opts: { userId?: string } = {}) {
  return stamped({
    type: 'ApplyParticipantOverride',
    actor: { userId: opts.userId ?? OWNER_ID, role: 'director' },
    payload: { participantId: TARGET_ID, override },
  });
}

const doomedOverride: ParticipantStateOverride = {
  kind: 'doomed',
  source: 'manual',
  canRegainStamina: false,
  autoTier3OnPowerRolls: true,
  staminaDeathThreshold: 'staminaMax',
  dieAtEncounterEnd: true,
};

const inertOverride: ParticipantStateOverride = {
  kind: 'inert',
  source: 'revenant',
  instantDeathDamageTypes: ['fire'],
  regainHours: 12,
  regainAmount: 'recoveryValue',
};

const rubbleOverride: ParticipantStateOverride = {
  kind: 'rubble',
  source: 'hakaan-doomsight',
  regainHours: 12,
  regainAmount: 'recoveryValue',
};

const copOverride: ParticipantStateOverride = {
  kind: 'extra-dying-trigger',
  source: 'curse-of-punishment',
  predicate: 'recoveries-exhausted',
};

describe('applyApplyParticipantOverride — director applies overrides', () => {
  it('applies a doomed override and recomputes state', () => {
    const s = stateWithHero({ staminaState: 'healthy', currentStamina: 30, maxStamina: 30 });
    const result = applyApplyParticipantOverride(s, overrideIntent(doomedOverride));
    expect(result.errors ?? []).toEqual([]);
    const updated = result.state.participants.find((p) => p.id === TARGET_ID)!;
    expect(updated.staminaOverride?.kind).toBe('doomed');
    expect(updated.staminaState).toBe('doomed');
  });

  it('applies an inert override and recomputes state (dying hero → inert)', () => {
    const s = stateWithHero({ currentStamina: -3, maxStamina: 30, staminaState: 'dying' });
    const result = applyApplyParticipantOverride(s, overrideIntent(inertOverride));
    expect(result.errors ?? []).toEqual([]);
    const updated = result.state.participants.find((p) => p.id === TARGET_ID)!;
    expect(updated.staminaOverride?.kind).toBe('inert');
    expect(updated.staminaState).toBe('inert');
  });

  it('applies a rubble override and recomputes state (dead hero → rubble)', () => {
    const s = stateWithHero({ currentStamina: -20, maxStamina: 30, staminaState: 'dead' });
    const result = applyApplyParticipantOverride(s, overrideIntent(rubbleOverride));
    expect(result.errors ?? []).toEqual([]);
    const updated = result.state.participants.find((p) => p.id === TARGET_ID)!;
    expect(updated.staminaOverride?.kind).toBe('rubble');
    expect(updated.staminaState).toBe('rubble');
  });

  it('applies a CoP extra-dying-trigger override — state becomes dying when recoveries are 0', () => {
    const s = stateWithHero({
      currentStamina: 20,
      maxStamina: 30,
      staminaState: 'healthy',
      recoveries: { current: 0, max: 8 },
    });
    const result = applyApplyParticipantOverride(s, overrideIntent(copOverride));
    expect(result.errors ?? []).toEqual([]);
    const updated = result.state.participants.find((p) => p.id === TARGET_ID)!;
    expect(updated.staminaOverride?.kind).toBe('extra-dying-trigger');
    // Predicate fires: recoveries exhausted → dying
    expect(updated.staminaState).toBe('dying');
  });

  it('emits StaminaTransitioned when state changes', () => {
    const s = stateWithHero({ staminaState: 'healthy', currentStamina: 30, maxStamina: 30 });
    const result = applyApplyParticipantOverride(s, overrideIntent(doomedOverride));
    expect(result.derived).toHaveLength(1);
    const st = result.derived[0]!;
    expect(st.type).toBe('StaminaTransitioned');
    const p = st.payload as { from: string; to: string; cause: string };
    expect(p.from).toBe('healthy');
    expect(p.to).toBe('doomed');
    expect(p.cause).toBe('override-applied');
  });

  it('emits no derived intents when state does not change', () => {
    // Already doomed; applying doomed override again should leave state as-is
    const s = stateWithHero({
      staminaState: 'doomed',
      currentStamina: 10,
      maxStamina: 30,
      staminaOverride: {
        kind: 'doomed',
        source: 'manual',
        canRegainStamina: true,
        autoTier3OnPowerRolls: true,
        staminaDeathThreshold: 'none',
        dieAtEncounterEnd: true,
      },
    });
    const result = applyApplyParticipantOverride(s, overrideIntent(doomedOverride));
    expect(result.derived).toHaveLength(0);
  });

  it('logs the override kind and source', () => {
    const s = stateWithHero({ staminaState: 'healthy' });
    const result = applyApplyParticipantOverride(s, overrideIntent(doomedOverride));
    expect(result.log[0]!.text).toContain('doomed');
    expect(result.log[0]!.text).toContain('manual');
  });
});

describe('applyApplyParticipantOverride — rejections', () => {
  it('rejects non-director player', () => {
    const s = stateWithHero({ staminaState: 'healthy' });
    const result = applyApplyParticipantOverride(
      s,
      overrideIntent(doomedOverride, { userId: PLAYER_ID }),
    );
    expect(result.errors?.[0]?.code).toBe('not_authorized');
  });

  it('rejects when target participant not found', () => {
    const s = stateWithHero({ staminaState: 'healthy' });
    const result = applyApplyParticipantOverride(
      s,
      stamped({
        type: 'ApplyParticipantOverride',
        actor: { userId: OWNER_ID, role: 'director' },
        payload: { participantId: 'unknown', override: doomedOverride },
      }),
    );
    expect(result.errors?.[0]?.code).toBe('target_missing');
  });
});
