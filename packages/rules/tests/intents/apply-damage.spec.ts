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
    // StaminaTransitioned emitted
    expect(result.derived).toHaveLength(1);
    expect(result.derived[0]!.type).toBe('StaminaTransitioned');
    const payload = result.derived[0]!.payload as { from: string; to: string };
    expect(payload.from).toBe('healthy');
    expect(payload.to).toBe('winded');
  });

  it('no derived intents when no state transition', () => {
    // 30 → 20; winded threshold = 15; 20 > 15 → still healthy
    const s = stateWithHero();
    const result = applyApplyDamage(s, applyDamageIntent({ amount: 10 }));
    expect(result.errors ?? []).toEqual([]);
    const updated = result.state.participants.find((p) => p.id === TARGET_ID);
    expect(updated?.staminaState).toBe('healthy');
    expect(result.derived).toHaveLength(0);
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
      updated.conditions.some((c) => c.type === 'Bleeding' && c.source.id === 'dying-state' && !c.removable),
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
  it('intercepts → dying with inert override when ancestry includes revenant', () => {
    const s = stateWithHero({
      currentStamina: 5,
      ancestry: ['revenant'],
      staminaOverride: null,
    });
    const result = applyApplyDamage(s, applyDamageIntent({ amount: 10 }));
    expect(result.errors ?? []).toEqual([]);
    const updated = result.state.participants.find((p) => p.id === TARGET_ID)!;
    // Override applied → inert instead of dying
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

  it('does NOT intercept when override is already set', () => {
    // Already has an override — Revenant intercept only fires when staminaOverride is null
    const s = stateWithHero({
      currentStamina: -4,
      ancestry: ['revenant'],
      staminaState: 'inert',
      staminaOverride: {
        kind: 'inert',
        source: 'revenant',
        instantDeathDamageTypes: ['fire'],
        regainHours: 12,
        regainAmount: 'recoveryValue',
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
    const s = stateWithHero({
      currentStamina: 5,
      ancestry: ['revenant'],
      equippedTitleIds: ['doomed'],
      staminaOverride: null,
    });
    const result = applyApplyDamage(s, applyDamageIntent({ amount: 10 }));
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
  it('Fury healthy → winded emits GainResource(ferocity, ferocityD3) + latch flip', () => {
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
    // 30 → 15 = windedValue(30) → winded. Pre-roll ferocityD3=3.
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
    // StaminaTransitioned + GainResource + SetParticipantPerEncounterLatch
    const gain = result.derived.find((d) => d.type === 'GainResource');
    expect(gain).toBeDefined();
    const gainPayload = gain!.payload as { participantId: string; name: string; amount: number };
    expect(gainPayload).toEqual({ participantId: TARGET_ID, name: 'ferocity', amount: 3 });
    const latch = result.derived.find((d) => d.type === 'SetParticipantPerEncounterLatch');
    expect(latch).toBeDefined();
    const latchPayload = latch!.payload as { key: string; value: boolean };
    expect(latchPayload.key).toBe('firstTimeWindedTriggered');
    expect(latchPayload.value).toBe(true);
    // Trigger derived intents inherit causedBy = the original intent id
    expect(gain!.causedBy).toBe(intent.id);
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
    expect(result.derived.find((d) => d.type === 'SetParticipantPerEncounterLatch')).toBeUndefined();
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

  it('does not invoke trigger evaluator when no state transition occurred', () => {
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
    // 30 → 25 stays healthy. No ferocityD3 → would throw if evaluator ran.
    const result = applyApplyDamage(s, applyDamageIntent({ amount: 5 }));
    expect(result.errors ?? []).toEqual([]);
    expect(result.derived).toHaveLength(0);
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
  });
});
