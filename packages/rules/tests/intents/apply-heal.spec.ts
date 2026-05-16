import { describe, expect, it } from 'vitest';
import { applyApplyHeal } from '../../src/intents/apply-heal';
import {
  baseState,
  makeHeroParticipant,
  makeRunningEncounterPhase,
  ownerActor,
  stamped,
} from './test-utils';

const TARGET_ID = 'pc:hero-1';

function stateWithHero(overrides = {}) {
  const hero = makeHeroParticipant(TARGET_ID, { maxStamina: 30, currentStamina: 30, ...overrides });
  return baseState({
    currentSessionId: 'sess-1',
    participants: [hero],
    encounter: makeRunningEncounterPhase('enc-1'),
  });
}

function applyHealIntent(
  opts: {
    targetId?: string;
    amount?: number;
  } = {},
) {
  return stamped({
    type: 'ApplyHeal',
    actor: ownerActor,
    payload: {
      targetId: opts.targetId ?? TARGET_ID,
      amount: opts.amount ?? 10,
    },
  });
}

describe('applyApplyHeal — base', () => {
  it('rejects when no active encounter', () => {
    const s = { ...stateWithHero(), encounter: null };
    const result = applyApplyHeal(s, applyHealIntent());
    expect(result.errors?.[0]?.code).toBe('no_active_encounter');
  });

  it('rejects when target not found', () => {
    const s = stateWithHero();
    const result = applyApplyHeal(s, applyHealIntent({ targetId: 'unknown' }));
    expect(result.errors?.[0]?.code).toBe('target_missing');
  });

  it('heals stamina normally — no state transition', () => {
    // 25/30 → healed 2 → 27/30 (still healthy)
    const s = stateWithHero({ currentStamina: 25 });
    const result = applyApplyHeal(s, applyHealIntent({ amount: 2 }));
    expect(result.errors ?? []).toEqual([]);
    const updated = result.state.participants.find((p) => p.id === TARGET_ID);
    expect(updated?.currentStamina).toBe(27);
    expect(updated?.staminaState).toBe('healthy');
    // No derived intents when state does not change
    expect(result.derived).toHaveLength(0);
  });

  it('caps heal at maxStamina', () => {
    // 25/30 → healed 10 → 30/30 (cap at max)
    const s = stateWithHero({ currentStamina: 25 });
    const result = applyApplyHeal(s, applyHealIntent({ amount: 10 }));
    expect(result.errors ?? []).toEqual([]);
    const updated = result.state.participants.find((p) => p.id === TARGET_ID);
    expect(updated?.currentStamina).toBe(30);
    expect(updated?.staminaState).toBe('healthy');
  });
});

describe('applyApplyHeal — dying hero → healthy/winded', () => {
  it('clears non-removable dying Bleeding when stamina rises above 0', () => {
    // dying at -3/30, heal 10 → 7/30 (winded, since 7 ≤ floor(30/2)=15)
    const s = stateWithHero({
      currentStamina: -3,
      staminaState: 'dying',
      conditions: [
        {
          type: 'Bleeding',
          duration: { kind: 'manual' },
          source: { kind: 'effect', id: 'dying-state' },
          removable: false,
          appliedAtSeq: 0,
        },
      ],
    });
    const result = applyApplyHeal(s, applyHealIntent({ amount: 10 }));
    expect(result.errors ?? []).toEqual([]);
    const updated = result.state.participants.find((p) => p.id === TARGET_ID)!;
    expect(updated.currentStamina).toBe(7);
    expect(updated.staminaState).toBe('winded');
    // Dying Bleeding should be cleared
    expect(
      updated.conditions.some((c) => c.type === 'Bleeding' && c.source.id === 'dying-state'),
    ).toBe(false);
    // StaminaTransitioned emitted with cause=heal
    const st = result.derived.find((d) => d.type === 'StaminaTransitioned');
    expect(st).toBeDefined();
    const p = st!.payload as { participantId: string; from: string; to: string; cause: string };
    expect(p.participantId).toBe(TARGET_ID);
    expect(p.from).toBe('dying');
    expect(p.to).toBe('winded');
    expect(p.cause).toBe('heal');
  });

  it('clears dying Bleeding when healed to healthy', () => {
    // dying at -3/30, heal 20 → 17/30 (healthy, since 17 > 15)
    const s = stateWithHero({
      currentStamina: -3,
      staminaState: 'dying',
      conditions: [
        {
          type: 'Bleeding',
          duration: { kind: 'manual' },
          source: { kind: 'effect', id: 'dying-state' },
          removable: false,
          appliedAtSeq: 0,
        },
      ],
    });
    const result = applyApplyHeal(s, applyHealIntent({ amount: 20 }));
    expect(result.errors ?? []).toEqual([]);
    const updated = result.state.participants.find((p) => p.id === TARGET_ID)!;
    expect(updated.currentStamina).toBe(17);
    expect(updated.staminaState).toBe('healthy');
    // Dying Bleeding should be cleared
    expect(
      updated.conditions.some((c) => c.type === 'Bleeding' && c.source.id === 'dying-state'),
    ).toBe(false);
    // StaminaTransitioned emitted
    const st = result.derived.find((d) => d.type === 'StaminaTransitioned');
    expect(st).toBeDefined();
    const p = st!.payload as { to: string; cause: string };
    expect(p.to).toBe('healthy');
    expect(p.cause).toBe('heal');
  });

  it('does not clear Bleeding from non-dying-state sources', () => {
    // dying at -3/30, has Bleeding from a different source (e.g. goblin-claw)
    // heal 10 → 7/30 (winded, transitions out of dying)
    // The goblin-claw Bleeding should remain
    const s = stateWithHero({
      currentStamina: -3,
      staminaState: 'dying',
      conditions: [
        {
          type: 'Bleeding',
          duration: { kind: 'manual' },
          source: { kind: 'effect', id: 'dying-state' },
          removable: false,
          appliedAtSeq: 0,
        },
        {
          type: 'Bleeding',
          duration: { kind: 'manual' },
          source: { kind: 'effect', id: 'goblin-claw' },
          removable: true,
          appliedAtSeq: 0,
        },
      ],
    });
    const result = applyApplyHeal(s, applyHealIntent({ amount: 10 }));
    expect(result.errors ?? []).toEqual([]);
    const updated = result.state.participants.find((p) => p.id === TARGET_ID)!;
    expect(updated.staminaState).toBe('winded');
    // Dying Bleeding should be cleared
    expect(
      updated.conditions.some((c) => c.type === 'Bleeding' && c.source.id === 'dying-state'),
    ).toBe(false);
    // But goblin-claw Bleeding should remain
    expect(
      updated.conditions.some((c) => c.type === 'Bleeding' && c.source.id === 'goblin-claw'),
    ).toBe(true);
  });

  it('emits no StaminaTransitioned when state does not change', () => {
    // Hero at 25/30 (healthy), heal 2 → 27/30 (still healthy)
    const s = stateWithHero({ currentStamina: 25, staminaState: 'healthy' });
    const result = applyApplyHeal(s, applyHealIntent({ amount: 2 }));
    expect(result.errors ?? []).toEqual([]);
    const updated = result.state.participants.find((p) => p.id === TARGET_ID);
    expect(updated?.currentStamina).toBe(27);
    expect(updated?.staminaState).toBe('healthy');
    // No derived intents
    expect(result.derived).toHaveLength(0);
  });
});

describe('applyApplyHeal — class-δ stamina-transition trigger wiring (Task 16)', () => {
  it('Troubadour any-hero-winded does NOT fire when a hero heals from dying back into winded', () => {
    // dying at -3/30 (heals 10 → winded at 7/30) emits StaminaTransitioned with
    // `cause: 'heal'`. The Troubadour any-hero-winded entry filters on
    // `cause === 'damage'`, so heal-into-winded must not credit drama. Same
    // filter prevents the Fury Ferocity entries from firing (and throwing on
    // missing ferocityD3) — see follow-up fix in stamina-transition.ts.
    const victim = makeHeroParticipant(TARGET_ID, {
      maxStamina: 30,
      currentStamina: -3,
      staminaState: 'dying',
      className: 'Censor',
      conditions: [
        {
          type: 'Bleeding',
          duration: { kind: 'manual' },
          source: { kind: 'effect', id: 'dying-state' },
          removable: false,
          appliedAtSeq: 0,
        },
      ],
    });
    const trou = makeHeroParticipant('trou-1', {
      className: 'Troubadour',
      heroicResources: [{ name: 'drama', value: 0, floor: 0 }],
    });
    const s = baseState({
      currentSessionId: 'sess-1',
      participants: [victim, trou],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const result = applyApplyHeal(s, applyHealIntent({ amount: 10 }));
    expect(result.errors ?? []).toEqual([]);
    // Slice 1 behavior intact — dying bleed cleared, state = winded.
    const updated = result.state.participants.find((p) => p.id === TARGET_ID)!;
    expect(updated.staminaState).toBe('winded');
    // Class trigger did NOT fire — only the StaminaTransitioned event itself.
    expect(result.derived.filter((d) => d.type === 'GainResource')).toEqual([]);
    expect(result.derived.filter((d) => d.type === 'StaminaTransitioned')).toHaveLength(1);
  });

  it('does not throw when a downed Fury is healed back to winded (no ferocityD3 supplied)', () => {
    // Regression guard for the production-reachable crash: ApplyHeal does not
    // supply ferocityD3, so before the cause filter the Fury winded entry
    // would match and `requireFerocityD3` would throw, cascading the reducer.
    // With the damage-only filter the entry skips cleanly.
    const fury = makeHeroParticipant(TARGET_ID, {
      maxStamina: 30,
      currentStamina: -3,
      staminaState: 'dying',
      className: 'Fury',
      heroicResources: [{ name: 'ferocity', value: 0, floor: 0 }],
      conditions: [
        {
          type: 'Bleeding',
          duration: { kind: 'manual' },
          source: { kind: 'effect', id: 'dying-state' },
          removable: false,
          appliedAtSeq: 0,
        },
      ],
    });
    const s = baseState({
      currentSessionId: 'sess-1',
      participants: [fury],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    expect(() => applyApplyHeal(s, applyHealIntent({ amount: 10 }))).not.toThrow();
    const result = applyApplyHeal(s, applyHealIntent({ amount: 10 }));
    expect(result.errors ?? []).toEqual([]);
    const updated = result.state.participants.find((p) => p.id === TARGET_ID)!;
    expect(updated.staminaState).toBe('winded');
    // No Fury Ferocity grant on heal.
    expect(result.derived.filter((d) => d.type === 'GainResource')).toEqual([]);
  });
});
