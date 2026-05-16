import { describe, expect, it } from 'vitest';
import { applyApplyDamage } from '../../src/intents/apply-damage';
import {
  baseState,
  makeHeroParticipant,
  makeMonsterParticipant,
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

function applyDamageIntent(
  opts: {
    targetId?: string;
    amount?: number;
    damageType?: string;
    intent?: 'kill' | 'knock-out';
  } = {},
) {
  return stamped({
    type: 'ApplyDamage',
    actor: ownerActor,
    payload: {
      targetId: opts.targetId ?? TARGET_ID,
      amount: opts.amount ?? 10,
      damageType: opts.damageType ?? 'fire',
      sourceIntentId: 'src-1',
      intent: opts.intent ?? 'kill',
    },
  });
}

describe('applyApplyDamage — base', () => {
  it('rejects when no active encounter', () => {
    const s = { ...stateWithHero(), encounter: null };
    const result = applyApplyDamage(s, applyDamageIntent());
    expect(result.errors?.[0]?.code).toBe('no_active_encounter');
  });

  it('rejects when target not found', () => {
    const s = stateWithHero();
    const result = applyApplyDamage(s, applyDamageIntent({ targetId: 'unknown' }));
    expect(result.errors?.[0]?.code).toBe('target_missing');
  });

  it('applies damage normally — no transition', () => {
    // 30 → 15; windedValue(30)=15 so state is winded, which IS a transition from healthy
    const s = stateWithHero();
    const result = applyApplyDamage(s, applyDamageIntent({ amount: 15 }));
    expect(result.errors ?? []).toEqual([]);
    const updated = result.state.participants.find((p) => p.id === TARGET_ID);
    expect(updated?.currentStamina).toBe(15);
    expect(updated?.staminaState).toBe('winded');
    // StaminaTransitioned emitted, plus the slice-2a tookDamage flag write.
    const st = result.derived.find((d) => d.type === 'StaminaTransitioned');
    expect(st).toBeDefined();
    const payload = st!.payload as { from: string; to: string };
    expect(payload.from).toBe('healthy');
    expect(payload.to).toBe('winded');
  });

  it('no transition still emits slice-2a tookDamage flag write on PC target', () => {
    // 30 → 20; winded threshold = 15; 20 > 15 → still healthy. No transition,
    // but slice 2a writes tookDamage perRound flag on any PC target that took
    // damage and didn't already have it set.
    const s = stateWithHero();
    const result = applyApplyDamage(s, applyDamageIntent({ amount: 10 }));
    expect(result.errors ?? []).toEqual([]);
    const updated = result.state.participants.find((p) => p.id === TARGET_ID);
    expect(updated?.staminaState).toBe('healthy');
    // No StaminaTransitioned (no state change), but the tookDamage flag write fires.
    expect(result.derived.find((d) => d.type === 'StaminaTransitioned')).toBeUndefined();
    const flag = result.derived.find((d) => d.type === 'SetParticipantPerRoundFlag');
    expect(flag).toBeDefined();
    const flagPayload = flag!.payload as { participantId: string; key: string; value: boolean };
    expect(flagPayload).toEqual({ participantId: TARGET_ID, key: 'tookDamage', value: true });
  });
});

describe('applyApplyDamage — PC hero → dying', () => {
  it('emits StaminaTransitioned with from=healthy, to=dying', () => {
    // 5/30 takes 10 → -5 → dying
    const s = stateWithHero({ currentStamina: 5 });
    const result = applyApplyDamage(s, applyDamageIntent({ amount: 10 }));
    expect(result.errors ?? []).toEqual([]);
    const updated = result.state.participants.find((p) => p.id === TARGET_ID)!;
    expect(updated.staminaState).toBe('dying');
    expect(updated.currentStamina).toBe(-5);
    // Non-removable Bleeding applied
    expect(
      updated.conditions.some(
        (c) => c.type === 'Bleeding' && c.source.id === 'dying-state' && !c.removable,
      ),
    ).toBe(true);
    // StaminaTransitioned derived intent
    const st = result.derived.find((d) => d.type === 'StaminaTransitioned');
    expect(st).toBeDefined();
    const p = st!.payload as { participantId: string; from: string; to: string; cause: string };
    expect(p.participantId).toBe(TARGET_ID);
    expect(p.from).toBe('healthy');
    expect(p.to).toBe('dying');
    expect(p.cause).toBe('damage');
  });
});

describe('applyApplyDamage — hero → dead (no override)', () => {
  it('emits StaminaTransitioned to=dead, no OA', () => {
    // dying at -5/30, takes 15 more → -20; windedValue=15; -20 ≤ -15 → dead
    const s = stateWithHero({
      currentStamina: -5,
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
    const result = applyApplyDamage(s, applyDamageIntent({ amount: 15 }));
    const updated = result.state.participants.find((p) => p.id === TARGET_ID)!;
    expect(updated.staminaState).toBe('dead');
    expect(updated.conditions).toHaveLength(0);
    const st = result.derived.find((d) => d.type === 'StaminaTransitioned');
    expect(st).toBeDefined();
    const p = st!.payload as { to: string };
    expect(p.to).toBe('dead');
    // No RaiseOpenAction since this is dead, not dying
    expect(result.derived.find((d) => d.type === 'RaiseOpenAction')).toBeUndefined();
  });
});

describe('applyApplyDamage — Revenant PC override', () => {
  it('intercepts → dead with inert override when ancestry includes revenant', () => {
    // Per Revenant.md:91, inert intercepts at the *dead* threshold
    // (currentStamina ≤ -windedValue). 5 stamina − 25 damage = -20 ≤ -15.
    const s = stateWithHero({
      currentStamina: 5,
      ancestry: ['revenant'],
      staminaOverride: null,
    });
    const result = applyApplyDamage(s, applyDamageIntent({ amount: 25 }));
    expect(result.errors ?? []).toEqual([]);
    const updated = result.state.participants.find((p) => p.id === TARGET_ID)!;
    // Override applied → inert instead of dead
    expect(updated.staminaState).toBe('inert');
    expect(updated.staminaOverride?.kind).toBe('inert');
    expect(updated.staminaOverride?.source).toBe('revenant');
    // StaminaTransitioned emitted with to=inert
    const st = result.derived.find((d) => d.type === 'StaminaTransitioned');
    expect(st).toBeDefined();
    const p = st!.payload as { to: string };
    expect(p.to).toBe('inert');
    // No OA since state is inert, not dying
    expect(result.derived.find((d) => d.type === 'RaiseOpenAction')).toBeUndefined();
  });

  it('does NOT intercept dying transition (only intercepts dead)', () => {
    // 5 − 10 = -5 → dying, but above -windedValue → no inert intercept.
    const s = stateWithHero({
      currentStamina: 5,
      ancestry: ['revenant'],
      staminaOverride: null,
    });
    const result = applyApplyDamage(s, applyDamageIntent({ amount: 10 }));
    const updated = result.state.participants.find((p) => p.id === TARGET_ID)!;
    expect(updated.staminaState).toBe('dying');
    expect(updated.staminaOverride).toBeNull();
  });

  it('does NOT intercept when override is already set', () => {
    // Already has an override — Revenant intercept only fires when staminaOverride is null
    const s = stateWithHero({
      currentStamina: -20, // already at -windedValue, inert holds
      ancestry: ['revenant'],
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
    // Cold damage (not fire, won't instant-kill) — stays inert
    const result = applyApplyDamage(
      s,
      stamped({
        type: 'ApplyDamage',
        actor: ownerActor,
        payload: {
          targetId: TARGET_ID,
          amount: 5,
          damageType: 'cold',
          sourceIntentId: 'src-1',
        },
      }),
    );
    expect(result.errors ?? []).toEqual([]);
    const updated = result.state.participants.find((p) => p.id === TARGET_ID)!;
    expect(updated.staminaState).toBe('inert');
    expect(updated.staminaOverride?.kind).toBe('inert');
  });

  it('does NOT intercept non-Revenant hero', () => {
    const s = stateWithHero({ currentStamina: 5, ancestry: [] });
    const result = applyApplyDamage(s, applyDamageIntent({ amount: 10 }));
    const updated = result.state.participants.find((p) => p.id === TARGET_ID)!;
    expect(updated.staminaState).toBe('dying'); // natural state
    expect(updated.staminaOverride).toBeNull();
  });
});

describe('applyApplyDamage — Hakaan-Doomsight PC override', () => {
  it('intercepts → dead with rubble when ancestry=hakaan and purchasedTraits has doomsight', () => {
    // dying at -5/30, takes 15 more → -20 ≤ -15 → would be dead
    const s = stateWithHero({
      currentStamina: -5,
      ancestry: ['hakaan'],
      purchasedTraits: ['doomsight'],
      staminaState: 'dying',
      staminaOverride: null,
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
    const result = applyApplyDamage(s, applyDamageIntent({ amount: 15 }));
    const updated = result.state.participants.find((p) => p.id === TARGET_ID)!;
    expect(updated.staminaState).toBe('rubble');
    expect(updated.staminaOverride?.kind).toBe('rubble');
    expect(updated.staminaOverride?.source).toBe('hakaan-doomsight');
    expect(updated.conditions).toHaveLength(0);
    const st = result.derived.find((d) => d.type === 'StaminaTransitioned');
    const p = st!.payload as { to: string };
    expect(p.to).toBe('rubble');
  });

  it('does NOT intercept when PC is already doomed', () => {
    // When staminaState is doomed, Hakaan rubble does not intercept
    const s = stateWithHero({
      currentStamina: -5,
      ancestry: ['hakaan'],
      purchasedTraits: ['doomsight'],
      staminaState: 'doomed',
      staminaOverride: {
        kind: 'doomed',
        source: 'hakaan-doomsight',
        canRegainStamina: true,
        autoTier3OnPowerRolls: true,
        staminaDeathThreshold: 'none',
        dieAtEncounterEnd: true,
      },
    });
    // 100 damage → stamina goes to -105; Hakaan doomed staminaDeathThreshold=none → stays doomed
    const result = applyApplyDamage(s, applyDamageIntent({ amount: 100 }));
    const updated = result.state.participants.find((p) => p.id === TARGET_ID)!;
    expect(updated.staminaState).toBe('doomed'); // no rubble intercept
  });

  it('does NOT intercept when hakaan lacks Doomsight trait', () => {
    const s = stateWithHero({
      currentStamina: -5,
      ancestry: ['hakaan'],
      purchasedTraits: ['all-is-a-feather'], // has hakaan ancestry but not doomsight
      staminaState: 'dying',
      staminaOverride: null,
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
    const result = applyApplyDamage(s, applyDamageIntent({ amount: 15 }));
    const updated = result.state.participants.find((p) => p.id === TARGET_ID)!;
    expect(updated.staminaState).toBe('dead'); // no rubble intercept
  });
});

describe('applyApplyDamage — Title Doomed OA auto-raise', () => {
  it('emits RaiseOpenAction when PC with Title Doomed reaches dying', () => {
    const s = stateWithHero({
      currentStamina: 5,
      equippedTitleIds: ['doomed'],
      ancestry: [], // not revenant — no inert intercept
      staminaOverride: null,
    });
    const result = applyApplyDamage(s, applyDamageIntent({ amount: 10 }));
    const updated = result.state.participants.find((p) => p.id === TARGET_ID)!;
    expect(updated.staminaState).toBe('dying');
    // Should have StaminaTransitioned + RaiseOpenAction
    const oa = result.derived.find((d) => d.type === 'RaiseOpenAction');
    expect(oa).toBeDefined();
    const payload = oa!.payload as { kind: string; participantId: string; expiresAtRound: null };
    expect(payload.kind).toBe('title-doomed-opt-in');
    expect(payload.participantId).toBe(TARGET_ID);
    expect(payload.expiresAtRound).toBeNull();
  });

  it('does NOT emit RaiseOpenAction when PC has no Title Doomed', () => {
    const s = stateWithHero({
      currentStamina: 5,
      equippedTitleIds: [],
      staminaOverride: null,
    });
    const result = applyApplyDamage(s, applyDamageIntent({ amount: 10 }));
    expect(result.derived.find((d) => d.type === 'RaiseOpenAction')).toBeUndefined();
  });

  it('does NOT emit RaiseOpenAction when Revenant override fires (state=inert, not dying)', () => {
    // Revenant inert intercepts → dead (not → dying). Use 25 damage to cross
    // the dead threshold (-20 ≤ -windedValue 15).
    const s = stateWithHero({
      currentStamina: 5,
      ancestry: ['revenant'],
      equippedTitleIds: ['doomed'],
      staminaOverride: null,
    });
    const result = applyApplyDamage(s, applyDamageIntent({ amount: 25 }));
    const updated = result.state.participants.find((p) => p.id === TARGET_ID)!;
    expect(updated.staminaState).toBe('inert');
    // OA should NOT be raised since state is inert (override trumps)
    expect(result.derived.find((d) => d.type === 'RaiseOpenAction')).toBeUndefined();
  });
});

describe('applyApplyDamage — intent=knock-out', () => {
  it('at would-kill stamina, applies KO (unconscious), no damage, no transition to dead', () => {
    // dying at -10/30, takes 20 → would be -30 ≤ -15 → would die → KO instead
    const s = stateWithHero({
      currentStamina: -10,
      staminaState: 'dying',
    });
    const result = applyApplyDamage(
      s,
      stamped({
        type: 'ApplyDamage',
        actor: ownerActor,
        payload: {
          targetId: TARGET_ID,
          amount: 20,
          damageType: 'fire',
          sourceIntentId: 'src-1',
          intent: 'knock-out',
        },
      }),
    );
    const updated = result.state.participants.find((p) => p.id === TARGET_ID)!;
    expect(updated.staminaState).toBe('unconscious');
    expect(updated.currentStamina).toBe(-10); // no damage applied
    expect(updated.conditions.some((c) => c.type === 'Unconscious')).toBe(true);
    expect(updated.conditions.some((c) => c.type === 'Prone')).toBe(true);
    // StaminaTransitioned emitted
    const st = result.derived.find((d) => d.type === 'StaminaTransitioned');
    expect(st).toBeDefined();
    const p = st!.payload as { to: string };
    expect(p.to).toBe('unconscious');
    // Log mentions "knocked unconscious"
    expect(result.log[0]!.text).toContain('knocked unconscious');
  });

  it('at non-killing blow, intent=knock-out still applies damage normally', () => {
    const s = stateWithHero({ currentStamina: 20 });
    const result = applyApplyDamage(
      s,
      stamped({
        type: 'ApplyDamage',
        actor: ownerActor,
        payload: {
          targetId: TARGET_ID,
          amount: 5,
          damageType: 'fire',
          sourceIntentId: 'src-1',
          intent: 'knock-out',
        },
      }),
    );
    const updated = result.state.participants.find((p) => p.id === TARGET_ID)!;
    expect(updated.currentStamina).toBe(15);
    expect(updated.staminaState).toBe('winded');
  });
});

describe('applyApplyDamage — inert fire instant-death', () => {
  it('inert + fire damage → instant dead, StaminaTransitioned emitted', () => {
    const s = stateWithHero({
      currentStamina: -5,
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
    const result = applyApplyDamage(s, applyDamageIntent({ amount: 1, damageType: 'fire' }));
    const updated = result.state.participants.find((p) => p.id === TARGET_ID)!;
    expect(updated.staminaState).toBe('dead');
    expect(updated.staminaOverride).toBeNull();
    const st = result.derived.find((d) => d.type === 'StaminaTransitioned');
    expect(st).toBeDefined();
    const p = st!.payload as { to: string };
    expect(p.to).toBe('dead');
  });
});

describe('applyApplyDamage — class-δ stamina-transition trigger wiring (Task 16)', () => {
  it('Fury healthy → winded emits stamina-transition GainResource(+ferocityD3) AND action-trigger GainResource(+1) + latch flip', () => {
    const fury = makeHeroParticipant(TARGET_ID, {
      maxStamina: 30,
      currentStamina: 30,
      className: 'Fury',
      heroicResources: [{ name: 'ferocity', value: 0, floor: 0 }],
    });
    const s = baseState({
      currentSessionId: 'sess-1',
      participants: [fury],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    // 30 → 15 = windedValue(30) → winded. Pre-roll ferocityD3=3 (used by
    // stamina-transition trigger only; action trigger is flat +1).
    const intent = stamped({
      type: 'ApplyDamage',
      actor: ownerActor,
      payload: {
        targetId: TARGET_ID,
        amount: 15,
        damageType: 'fire',
        sourceIntentId: 'src-1',
        ferocityD3: 3,
      },
    });
    const result = applyApplyDamage(s, intent);
    expect(result.errors ?? []).toEqual([]);
    // Two ferocity GainResource derived intents now:
    //   - stamina-transition winded trigger: +ferocityD3 (=3)
    //   - per-event action trigger:          +1 (canon flat)
    const ferocityGains = result.derived.filter(
      (d) => d.type === 'GainResource' && (d.payload as { name: string }).name === 'ferocity',
    );
    expect(ferocityGains).toHaveLength(2);
    const amounts = ferocityGains
      .map((g) => (g.payload as { amount: number }).amount)
      .sort((a, b) => a - b);
    expect(amounts).toEqual([1, 3]);
    for (const g of ferocityGains) {
      expect((g.payload as { participantId: string }).participantId).toBe(TARGET_ID);
      expect(g.causedBy).toBe(intent.id);
    }
    const latch = result.derived.find((d) => d.type === 'SetParticipantPerEncounterLatch');
    expect(latch).toBeDefined();
    const latchPayload = latch!.payload as { key: string; value: boolean };
    expect(latchPayload.key).toBe('firstTimeWindedTriggered');
    expect(latchPayload.value).toBe(true);
    // Trigger derived intents inherit causedBy = the original intent id
    expect(latch!.causedBy).toBe(intent.id);
  });

  it('non-Fury PC healthy → winded emits no class-trigger derived intents', () => {
    const censor = makeHeroParticipant(TARGET_ID, {
      maxStamina: 30,
      currentStamina: 30,
      className: 'Censor',
    });
    const s = baseState({
      currentSessionId: 'sess-1',
      participants: [censor],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const result = applyApplyDamage(s, applyDamageIntent({ amount: 15 }));
    expect(result.errors ?? []).toEqual([]);
    // Only StaminaTransitioned should be present — no GainResource, no latch
    expect(result.derived.find((d) => d.type === 'GainResource')).toBeUndefined();
    expect(
      result.derived.find((d) => d.type === 'SetParticipantPerEncounterLatch'),
    ).toBeUndefined();
    expect(result.derived.find((d) => d.type === 'StaminaTransitioned')).toBeDefined();
  });

  it('Fury healthy → winded WITHOUT ferocityD3 on payload throws (developer contract)', () => {
    const fury = makeHeroParticipant(TARGET_ID, {
      maxStamina: 30,
      currentStamina: 30,
      className: 'Fury',
    });
    const s = baseState({
      currentSessionId: 'sess-1',
      participants: [fury],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    // No ferocityD3 supplied — evaluator should throw.
    expect(() => applyApplyDamage(s, applyDamageIntent({ amount: 15 }))).toThrow(
      /ferocityD3 was not supplied/,
    );
  });

  it('does not invoke STAMINA-TRANSITION trigger evaluator when no state transition occurred', () => {
    // 30 → 25 stays healthy. Stamina-transition trigger evaluator must NOT run.
    // The *action* trigger evaluator DOES run on every ApplyDamage and grants
    // a flat +1 ferocity (canon, post-bugfix; ferocityD3 not required for this
    // path).
    const fury = makeHeroParticipant(TARGET_ID, {
      maxStamina: 30,
      currentStamina: 30,
      className: 'Fury',
      heroicResources: [{ name: 'ferocity', value: 0, floor: 0 }],
    });
    const s = baseState({
      currentSessionId: 'sess-1',
      participants: [fury],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const intent = stamped({
      type: 'ApplyDamage',
      actor: ownerActor,
      payload: {
        targetId: TARGET_ID,
        amount: 5,
        damageType: 'fire',
        sourceIntentId: 'src-1',
      },
    });
    const result = applyApplyDamage(s, intent);
    expect(result.errors ?? []).toEqual([]);
    // No StaminaTransitioned (state didn't change).
    expect(result.derived.find((d) => d.type === 'StaminaTransitioned')).toBeUndefined();
    // BUT: Fury per-event Ferocity action trigger fires once per round, +1 flat.
    const gain = result.derived.find((d) => d.type === 'GainResource');
    expect(gain).toBeDefined();
    expect(gain!.payload).toEqual({ participantId: TARGET_ID, name: 'ferocity', amount: 1 });
  });

  it('Troubadour any-hero-winded fires when a different hero is damaged into winded', () => {
    const trou = makeHeroParticipant('trou-1', {
      className: 'Troubadour',
      heroicResources: [{ name: 'drama', value: 0, floor: 0 }],
    });
    const victim = makeHeroParticipant(TARGET_ID, {
      maxStamina: 30,
      currentStamina: 30,
      className: 'Censor',
    });
    const s = baseState({
      currentSessionId: 'sess-1',
      participants: [trou, victim],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    // Damage the Censor (non-Fury) → winded → Troubadour any-hero-winded fires.
    // No ferocityD3 needed since the transitioning participant isn't a Fury.
    const result = applyApplyDamage(s, applyDamageIntent({ amount: 15 }));
    expect(result.errors ?? []).toEqual([]);
    const gain = result.derived.find((d) => d.type === 'GainResource');
    expect(gain).toBeDefined();
    const gainPayload = gain!.payload as { participantId: string; name: string; amount: number };
    expect(gainPayload).toEqual({ participantId: 'trou-1', name: 'drama', amount: 2 });
  });
});

describe('applyApplyDamage — monster', () => {
  it('monster takes damage, no PC-specific overrides apply', () => {
    const monster = makeMonsterParticipant('m1', { maxStamina: 20, currentStamina: 20 });
    const s = baseState({
      currentSessionId: 'sess-1',
      participants: [monster],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const intent = stamped({
      type: 'ApplyDamage',
      actor: ownerActor,
      payload: {
        targetId: 'm1',
        amount: 20,
        damageType: 'fire',
        sourceIntentId: 'src-1',
      },
    });
    const result = applyApplyDamage(s, intent);
    const updated = result.state.participants.find((p) => p.id === 'm1')!;
    expect(updated.staminaState).toBe('dead');
    expect(updated.staminaOverride).toBeNull(); // no override for monsters
    const st = result.derived.find((d) => d.type === 'StaminaTransitioned');
    expect(st).toBeDefined();
    // Monster target → no PC flag writes
    expect(result.derived.find((d) => d.type === 'SetParticipantPerRoundFlag')).toBeUndefined();
    expect(result.derived.find((d) => d.type === 'SetParticipantPerTurnEntry')).toBeUndefined();
  });
});

describe('applyApplyDamage — slice 2a bypassDamageReduction', () => {
  it('skips immunity when bypassDamageReduction: true', () => {
    const s = stateWithHero({
      immunities: [{ type: 'fire', value: 10 }],
    });
    const result = applyApplyDamage(
      s,
      stamped({
        type: 'ApplyDamage',
        actor: ownerActor,
        payload: {
          targetId: TARGET_ID,
          amount: 12,
          damageType: 'fire',
          sourceIntentId: 'src-1',
          bypassDamageReduction: true,
        },
      }),
    );
    const updated = result.state.participants.find((p) => p.id === TARGET_ID)!;
    // 30 - 12 (raw, no -10 immunity subtraction) = 18
    expect(updated.currentStamina).toBe(18);
  });

  it('honors immunity when bypassDamageReduction omitted (default false)', () => {
    const s = stateWithHero({
      immunities: [{ type: 'fire', value: 10 }],
    });
    const result = applyApplyDamage(s, applyDamageIntent({ amount: 12 }));
    const updated = result.state.participants.find((p) => p.id === TARGET_ID)!;
    // 30 - max(0, 12-10) = 30 - 2 = 28
    expect(updated.currentStamina).toBe(28);
  });
});

describe('applyApplyDamage — slice 2a flag writes', () => {
  it('writes damageDealtThisTurn on dealer + damageTakenThisTurn on target, scoped to active turn', () => {
    const dealer = makeHeroParticipant('pc:dealer-1');
    const target = makeHeroParticipant(TARGET_ID, { maxStamina: 30, currentStamina: 30 });
    const s = baseState({
      currentSessionId: 'sess-1',
      participants: [dealer, target],
      encounter: makeRunningEncounterPhase('enc-1', { activeParticipantId: 'pc:dealer-1' }),
    });
    const result = applyApplyDamage(s, applyDamageIntent({ amount: 10 }));
    const entries = result.derived.filter((d) => d.type === 'SetParticipantPerTurnEntry');
    expect(entries).toHaveLength(2);
    const dealt = entries.find((d) => (d.payload as { key: string }).key === 'damageDealtThisTurn');
    expect(dealt).toBeDefined();
    expect(dealt!.payload).toEqual({
      participantId: 'pc:dealer-1',
      scopedToTurnOf: 'pc:dealer-1',
      key: 'damageDealtThisTurn',
      value: true,
    });
    const taken = entries.find((d) => (d.payload as { key: string }).key === 'damageTakenThisTurn');
    expect(taken).toBeDefined();
    // Phase 2b 2b.16 B13 — damageTakenThisTurn accumulates delivered damage.
    expect(taken!.payload).toEqual({
      participantId: TARGET_ID,
      scopedToTurnOf: 'pc:dealer-1',
      key: 'damageTakenThisTurn',
      value: 10,
    });
  });

  // Phase 2b 2b.16 B13 — Elementalist Persistent Magic (Elementalist.md:147):
  // "If you take damage equal to or greater than 5 times your Reason score in
  // one turn, you stop maintaining any persistent abilities."
  it('emits StopMaintenance for every maintained ability when 5×Reason damage crossed', () => {
    const ele = makeHeroParticipant(TARGET_ID, {
      maxStamina: 50,
      currentStamina: 50,
      className: 'Elementalist',
      characteristics: { might: 0, agility: 0, reason: 3, intuition: 0, presence: 0 },
      maintainedAbilities: [
        {
          abilityId: 'instantaneous-excavation',
          costPerTurn: 1,
          startedAtRound: 1,
          targetId: null,
        },
        { abilityId: 'wall-of-fire', costPerTurn: 2, startedAtRound: 1, targetId: null },
      ],
    });
    const s = baseState({
      currentSessionId: 'sess-1',
      participants: [ele],
      encounter: makeRunningEncounterPhase('enc-1', { activeParticipantId: TARGET_ID }),
    });
    // 5 * reason(3) = 15. Apply 15 damage in one shot crosses the threshold.
    const result = applyApplyDamage(s, applyDamageIntent({ amount: 15 }));
    const stops = result.derived.filter((d) => d.type === 'StopMaintenance');
    expect(stops).toHaveLength(2);
    const abilityIds = stops.map((d) => (d.payload as { abilityId: string }).abilityId).sort();
    expect(abilityIds).toEqual(['instantaneous-excavation', 'wall-of-fire']);
  });

  it('does NOT emit StopMaintenance when 5×Reason not crossed', () => {
    const ele = makeHeroParticipant(TARGET_ID, {
      maxStamina: 50,
      currentStamina: 50,
      className: 'Elementalist',
      characteristics: { might: 0, agility: 0, reason: 3, intuition: 0, presence: 0 },
      maintainedAbilities: [
        {
          abilityId: 'instantaneous-excavation',
          costPerTurn: 1,
          startedAtRound: 1,
          targetId: null,
        },
      ],
    });
    const s = baseState({
      currentSessionId: 'sess-1',
      participants: [ele],
      encounter: makeRunningEncounterPhase('enc-1', { activeParticipantId: TARGET_ID }),
    });
    // 5 * reason(3) = 15. 14 damage stays below.
    const result = applyApplyDamage(s, applyDamageIntent({ amount: 14 }));
    expect(result.derived.filter((d) => d.type === 'StopMaintenance')).toHaveLength(0);
  });

  it('does NOT fire a second StopMaintenance when prior accumulator is already past 5×Reason', () => {
    // After the first hit crossed the threshold, the perTurn entry is at 10+.
    // A subsequent ApplyDamage in the same turn must NOT re-emit StopMaintenance.
    const ele = makeHeroParticipant(TARGET_ID, {
      maxStamina: 50,
      currentStamina: 40,
      className: 'Elementalist',
      characteristics: { might: 0, agility: 0, reason: 2, intuition: 0, presence: 0 },
      maintainedAbilities: [
        { abilityId: 'wall-of-fire', costPerTurn: 1, startedAtRound: 1, targetId: null },
      ],
      // Prior cumulative already at threshold (10).
      perEncounterFlags: {
        perTurn: {
          entries: [{ scopedToTurnOf: TARGET_ID, key: 'damageTakenThisTurn', value: 10 }],
        },
        perRound: {
          tookDamage: true,
          judgedTargetDamagedMe: false,
          damagedJudgedTarget: false,
          markedTargetDamagedByAnyone: false,
          dealtSurgeDamage: false,
          directorSpentMalice: false,
          creatureForceMoved: false,
          allyHeroicWithin10Triggered: false,
          nullFieldEnemyMainTriggered: false,
          elementalistDamageWithin10Triggered: false,
        },
        perEncounter: {
          firstTimeWindedTriggered: false,
          firstTimeDyingTriggered: false,
          troubadourThreeHeroesTriggered: false,
          troubadourAnyHeroWindedTriggered: false,
          troubadourReviveOARaised: false,
        },
      },
    });
    const s = baseState({
      currentSessionId: 'sess-1',
      participants: [ele],
      encounter: makeRunningEncounterPhase('enc-1', { activeParticipantId: TARGET_ID }),
    });
    const result = applyApplyDamage(s, applyDamageIntent({ amount: 5 }));
    expect(result.derived.filter((d) => d.type === 'StopMaintenance')).toHaveLength(0);
  });

  it('writes tookDamage perRound flag on target (PC) when not already set', () => {
    const s = stateWithHero();
    const result = applyApplyDamage(s, applyDamageIntent({ amount: 10 }));
    const flag = result.derived.find((d) => d.type === 'SetParticipantPerRoundFlag');
    expect(flag).toBeDefined();
    expect(flag!.payload).toEqual({
      participantId: TARGET_ID,
      key: 'tookDamage',
      value: true,
    });
  });

  it('does NOT write tookDamage perRound flag when already set on target', () => {
    const hero = makeHeroParticipant(TARGET_ID, {
      maxStamina: 30,
      currentStamina: 30,
      perEncounterFlags: {
        perTurn: { entries: [] },
        perRound: {
          tookDamage: true,
          judgedTargetDamagedMe: false,
          damagedJudgedTarget: false,
          markedTargetDamagedByAnyone: false,
          dealtSurgeDamage: false,
          directorSpentMalice: false,
          creatureForceMoved: false,
          allyHeroicWithin10Triggered: false,
          nullFieldEnemyMainTriggered: false,
          elementalistDamageWithin10Triggered: false,
        },
        perEncounter: {
          firstTimeWindedTriggered: false,
          firstTimeDyingTriggered: false,
          troubadourThreeHeroesTriggered: false,
          troubadourAnyHeroWindedTriggered: false,
          troubadourReviveOARaised: false,
        },
      },
    });
    const s = baseState({
      currentSessionId: 'sess-1',
      participants: [hero],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const result = applyApplyDamage(s, applyDamageIntent({ amount: 10 }));
    expect(result.derived.find((d) => d.type === 'SetParticipantPerRoundFlag')).toBeUndefined();
  });

  it('does NOT emit perTurn entries when no active turn', () => {
    const s = stateWithHero(); // encounter.activeParticipantId = null
    const result = applyApplyDamage(s, applyDamageIntent({ amount: 10 }));
    expect(result.derived.find((d) => d.type === 'SetParticipantPerTurnEntry')).toBeUndefined();
    // tookDamage perRound flag still fires (not turn-scoped).
    expect(result.derived.find((d) => d.type === 'SetParticipantPerRoundFlag')).toBeDefined();
  });

  it('does NOT write damageDealtThisTurn when active turn is a monster (non-PC)', () => {
    const monsterDealer = makeMonsterParticipant('mon:goblin-1');
    const target = makeHeroParticipant(TARGET_ID, { maxStamina: 30, currentStamina: 30 });
    const s = baseState({
      currentSessionId: 'sess-1',
      participants: [monsterDealer, target],
      encounter: makeRunningEncounterPhase('enc-1', { activeParticipantId: 'mon:goblin-1' }),
    });
    const result = applyApplyDamage(s, applyDamageIntent({ amount: 10 }));
    const entries = result.derived.filter((d) => d.type === 'SetParticipantPerTurnEntry');
    // Only damageTakenThisTurn on PC target — no damageDealtThisTurn (dealer is monster).
    expect(entries).toHaveLength(1);
    expect((entries[0]!.payload as { key: string }).key).toBe('damageTakenThisTurn');
  });

  it('does NOT write damageTakenThisTurn when target is a monster', () => {
    const dealer = makeHeroParticipant('pc:dealer-1');
    const monsterTarget = makeMonsterParticipant('mon:goblin-1', {
      maxStamina: 20,
      currentStamina: 20,
    });
    const s = baseState({
      currentSessionId: 'sess-1',
      participants: [dealer, monsterTarget],
      encounter: makeRunningEncounterPhase('enc-1', { activeParticipantId: 'pc:dealer-1' }),
    });
    const result = applyApplyDamage(s, applyDamageIntent({ targetId: 'mon:goblin-1', amount: 10 }));
    const entries = result.derived.filter((d) => d.type === 'SetParticipantPerTurnEntry');
    // Only damageDealtThisTurn on PC dealer.
    expect(entries).toHaveLength(1);
    expect((entries[0]!.payload as { key: string }).key).toBe('damageDealtThisTurn');
    // No tookDamage perRound write either (monster target).
    expect(result.derived.find((d) => d.type === 'SetParticipantPerRoundFlag')).toBeUndefined();
  });
});

describe('applyApplyDamage — slice 2a action-trigger evaluator wiring', () => {
  it('Fury per-event Ferocity action trigger fires on damage-applied (no transition)', () => {
    // Fury at full stamina takes 5 damage → stays healthy → no stamina-transition trigger.
    // But the action-trigger evaluator fires Fury's per-event Ferocity: +1 flat
    // (canon — the 1d3 belongs only to the per-encounter winded/dying triggers).
    const fury = makeHeroParticipant(TARGET_ID, {
      maxStamina: 30,
      currentStamina: 30,
      className: 'Fury',
      heroicResources: [{ name: 'ferocity', value: 0, floor: 0 }],
    });
    const s = baseState({
      currentSessionId: 'sess-1',
      participants: [fury],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const intent = stamped({
      type: 'ApplyDamage',
      actor: ownerActor,
      payload: {
        targetId: TARGET_ID,
        amount: 5,
        damageType: 'fire',
        sourceIntentId: 'src-1',
      },
    });
    const result = applyApplyDamage(s, intent);
    expect(result.errors ?? []).toEqual([]);
    const gain = result.derived.find((d) => d.type === 'GainResource');
    expect(gain).toBeDefined();
    expect(gain!.payload).toEqual({ participantId: TARGET_ID, name: 'ferocity', amount: 1 });
    // The action-trigger evaluator runs against the pre-write state, so its
    // emitted causedBy must point to the originating ApplyDamage intent.
    expect(gain!.causedBy).toBe(intent.id);
  });
});

// Phase 2b Group A+B (slice 6) — Wings echelon-1 fire weakness integration.
// Verifies that `getEffectiveWeaknesses` flows through `applyDamageStep`'s
// step-3 weakness add when a flying L1-3 Devil/DK takes fire damage.
describe('applyApplyDamage — Devil Wings echelon-1 fire weakness 5', () => {
  it('adds +5 fire damage to a flying L1 Devil with Wings (10 → 15 delivered)', () => {
    const s = baseState({
      currentSessionId: 'sess-1',
      participants: [
        makeHeroParticipant(TARGET_ID, {
          level: 1,
          ancestry: ['devil'],
          purchasedTraits: ['wings'],
          movementMode: { mode: 'flying', roundsRemaining: 2 },
          maxStamina: 30,
          currentStamina: 30,
        }),
      ],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const result = applyApplyDamage(s, applyDamageIntent({ amount: 10, damageType: 'fire' }));
    expect(result.errors ?? []).toEqual([]);
    const updated = result.state.participants.find((p) => p.id === TARGET_ID);
    // 10 base + 5 fire weakness = 15 delivered; 30 - 15 = 15 stamina (winded).
    expect(updated?.currentStamina).toBe(15);
  });

  it('does NOT add +5 fire damage to L4+ Devil (echelon-2)', () => {
    const s = baseState({
      currentSessionId: 'sess-1',
      participants: [
        makeHeroParticipant(TARGET_ID, {
          level: 4,
          ancestry: ['devil'],
          purchasedTraits: ['wings'],
          movementMode: { mode: 'flying', roundsRemaining: 2 },
          maxStamina: 30,
          currentStamina: 30,
        }),
      ],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const result = applyApplyDamage(s, applyDamageIntent({ amount: 10, damageType: 'fire' }));
    expect(result.errors ?? []).toEqual([]);
    const updated = result.state.participants.find((p) => p.id === TARGET_ID);
    expect(updated?.currentStamina).toBe(20);
  });

  it('does NOT add +5 fire damage when not flying (movementMode null)', () => {
    const s = baseState({
      currentSessionId: 'sess-1',
      participants: [
        makeHeroParticipant(TARGET_ID, {
          level: 1,
          ancestry: ['devil'],
          purchasedTraits: ['wings'],
          movementMode: null,
          maxStamina: 30,
          currentStamina: 30,
        }),
      ],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const result = applyApplyDamage(s, applyDamageIntent({ amount: 10, damageType: 'fire' }));
    expect(result.errors ?? []).toEqual([]);
    const updated = result.state.participants.find((p) => p.id === TARGET_ID);
    expect(updated?.currentStamina).toBe(20);
  });

  it('does NOT add +5 to non-fire damage even while flying', () => {
    const s = baseState({
      currentSessionId: 'sess-1',
      participants: [
        makeHeroParticipant(TARGET_ID, {
          level: 1,
          ancestry: ['devil'],
          purchasedTraits: ['wings'],
          movementMode: { mode: 'flying', roundsRemaining: 2 },
          maxStamina: 30,
          currentStamina: 30,
        }),
      ],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const result = applyApplyDamage(s, applyDamageIntent({ amount: 10, damageType: 'cold' }));
    expect(result.errors ?? []).toEqual([]);
    const updated = result.state.participants.find((p) => p.id === TARGET_ID);
    expect(updated?.currentStamina).toBe(20);
  });
});

// Phase 2b Group A+B (slice 6) — apply-damage condition-diff dispatch.
// Verifies that engine-side Prone additions (KO interception adds Prone, and
// the inert override transition adds Prone) route through the ancestry-trigger
// dispatcher so Wings can emit EndFlying { reason: 'fall' }.
describe('applyApplyDamage — ancestry-trigger Prone-add dispatch', () => {
  it('KO interception on a flying Devil with Wings emits derived EndFlying', () => {
    // 5 stamina; 20 damage with intent='knock-out' → would-hit-dead, KO fires.
    // KO adds Unconscious + Prone. Wings ancestry-trigger sees Prone-add and
    // emits a derived EndFlying { reason: 'fall' }.
    const s = baseState({
      currentSessionId: 'sess-1',
      participants: [
        makeHeroParticipant(TARGET_ID, {
          level: 1,
          ancestry: ['devil'],
          purchasedTraits: ['wings'],
          movementMode: { mode: 'flying', roundsRemaining: 2 },
          maxStamina: 30,
          currentStamina: 5,
        }),
      ],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const result = applyApplyDamage(
      s,
      applyDamageIntent({ amount: 20, damageType: 'untyped', intent: 'knock-out' }),
    );
    expect(result.errors ?? []).toEqual([]);
    const updated = result.state.participants.find((p) => p.id === TARGET_ID)!;
    expect(updated.staminaState).toBe('unconscious');
    expect(updated.conditions.some((c) => c.type === 'Prone')).toBe(true);
    const endFlying = result.derived.find((d) => d.type === 'EndFlying');
    expect(endFlying).toBeDefined();
    expect(endFlying!.payload).toEqual({ participantId: TARGET_ID, reason: 'fall' });
  });

  it('non-flying Devil with Wings KO does NOT emit EndFlying (no movementMode)', () => {
    const s = baseState({
      currentSessionId: 'sess-1',
      participants: [
        makeHeroParticipant(TARGET_ID, {
          level: 1,
          ancestry: ['devil'],
          purchasedTraits: ['wings'],
          movementMode: null,
          maxStamina: 30,
          currentStamina: 5,
        }),
      ],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const result = applyApplyDamage(
      s,
      applyDamageIntent({ amount: 20, damageType: 'untyped', intent: 'knock-out' }),
    );
    expect(result.errors ?? []).toEqual([]);
    expect(result.derived.find((d) => d.type === 'EndFlying')).toBeUndefined();
  });
});
