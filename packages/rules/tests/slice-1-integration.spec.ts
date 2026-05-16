/**
 * Pass 3 Slice 1 — Integration test
 *
 * Exercises all five state-override plugs and the Q10 cross-side trigger
 * resolution path end-to-end through the top-level `applyIntent` dispatcher.
 * Every mutation flows through the reducer rather than calling per-intent
 * functions directly — that's what makes this an integration test.
 */

import type { PendingTriggerSet } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import { applyIntent } from '../src/reducer';
import type { CampaignState, StampedIntent } from '../src/types';
import {
  OWNER_ID,
  baseState,
  makeHeroParticipant,
  makeRunningEncounterPhase,
  stamped,
} from './intents/test-utils';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const DIRECTOR_ACTOR: StampedIntent['actor'] = { userId: OWNER_ID, role: 'director' };
const PLAYER_ACTOR: StampedIntent['actor'] = { userId: OWNER_ID, role: 'player' };

/** Build a campaign state that has an active encounter and the given participants. */
function withEncounter(participants: ReturnType<typeof makeHeroParticipant>[]): CampaignState {
  return baseState({
    currentSessionId: 'sess-1',
    participants,
    encounter: makeRunningEncounterPhase('enc-test'),
    // activeDirectorId defaults to OWNER_ID via emptyCampaignState
  });
}

function applyDamage(
  state: CampaignState,
  opts: { targetId: string; amount: number; damageType?: string; intent?: 'kill' | 'knock-out' },
): CampaignState {
  const result = applyIntent(
    state,
    stamped({
      type: 'ApplyDamage',
      actor: DIRECTOR_ACTOR,
      payload: {
        targetId: opts.targetId,
        amount: opts.amount,
        damageType: opts.damageType ?? 'untyped',
        sourceIntentId: 'src-integration',
        intent: opts.intent ?? 'kill',
      },
    }),
  );
  expect(result.errors ?? []).toEqual([]);
  return result.state;
}

// ---------------------------------------------------------------------------
// Scenario 1: Revenant inert → fire instant death
// ---------------------------------------------------------------------------

describe('slice-1 integration — Revenant inert → fire instant death', () => {
  const PC_ID = 'pc:revenant-1';

  function buildState() {
    return withEncounter([
      makeHeroParticipant(PC_ID, {
        maxStamina: 30,
        currentStamina: 5,
        ancestry: ['revenant'],
        staminaOverride: null,
      }),
    ]);
  }

  it('10 fire damage on 5-stamina Revenant → state inert, override populated', () => {
    let state = buildState();
    state = applyDamage(state, { targetId: PC_ID, amount: 10, damageType: 'fire' });

    const pc = state.participants.find((p) => p.id === PC_ID)!;
    expect(pc.staminaState).toBe('inert');
    expect(pc.staminaOverride?.kind).toBe('inert');
    expect(pc.staminaOverride?.source).toBe('revenant');
    // stamina is clamped; inert override means we're below 0
    expect(pc.currentStamina).toBeLessThan(0);
  });

  it('1 fire damage on inert Revenant → state dead, override cleared', () => {
    let state = buildState();
    // First blow: put into inert
    state = applyDamage(state, { targetId: PC_ID, amount: 10, damageType: 'fire' });
    const inert = state.participants.find((p) => p.id === PC_ID)!;
    expect(inert.staminaState).toBe('inert');

    // Second blow: fire → instant death
    state = applyDamage(state, { targetId: PC_ID, amount: 1, damageType: 'fire' });
    const dead = state.participants.find((p) => p.id === PC_ID)!;
    expect(dead.staminaState).toBe('dead');
    expect(dead.staminaOverride).toBeNull();
  });

  it('non-fire damage on inert Revenant does NOT instant-kill', () => {
    let state = buildState();
    state = applyDamage(state, { targetId: PC_ID, amount: 10, damageType: 'fire' });
    state = applyDamage(state, { targetId: PC_ID, amount: 5, damageType: 'cold' });

    const pc = state.participants.find((p) => p.id === PC_ID)!;
    expect(pc.staminaState).toBe('inert'); // still inert
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: Hakaan rubble at -windedValue, then director clears override
// ---------------------------------------------------------------------------

describe('slice-1 integration — Hakaan rubble, then director clears override', () => {
  const PC_ID = 'pc:hakaan-1';

  function buildState() {
    return withEncounter([
      makeHeroParticipant(PC_ID, {
        maxStamina: 30,
        currentStamina: -5,
        staminaState: 'dying',
        ancestry: ['hakaan'],
        purchasedTraits: ['doomsight'],
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
      }),
    ]);
  }

  it('20 damage on dying Hakaan-Doomsight → state rubble (override fires at would-kill)', () => {
    // -5 − 20 = -25; windedValue(30) = 15; -25 ≤ -15 → would be dead → rubble intercept
    let state = buildState();
    state = applyDamage(state, { targetId: PC_ID, amount: 20, damageType: 'untyped' });

    const pc = state.participants.find((p) => p.id === PC_ID)!;
    expect(pc.staminaState).toBe('rubble');
    expect(pc.staminaOverride?.kind).toBe('rubble');
    expect(pc.staminaOverride?.source).toBe('hakaan-doomsight');
    expect(pc.currentStamina).toBe(-25);
  });

  it('director ClearParticipantOverride when stamina still below -windedValue → state dead', () => {
    let state = buildState();
    state = applyDamage(state, { targetId: PC_ID, amount: 20, damageType: 'untyped' });
    const rubble = state.participants.find((p) => p.id === PC_ID)!;
    expect(rubble.staminaState).toBe('rubble');

    // Director clears the override. Stamina is still -25 (past -windedValue 15) → dead.
    const clearResult = applyIntent(
      state,
      stamped({
        type: 'ClearParticipantOverride',
        actor: DIRECTOR_ACTOR,
        payload: { participantId: PC_ID },
      }),
    );
    expect(clearResult.errors ?? []).toEqual([]);

    const cleared = clearResult.state.participants.find((p) => p.id === PC_ID)!;
    expect(cleared.staminaOverride).toBeNull();
    expect(cleared.staminaState).toBe('dead');
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: Hakaan doomed via player intent, dies at encounter end
// ---------------------------------------------------------------------------

describe('slice-1 integration — Hakaan doomed via BecomeDoomed, dies at EndEncounter', () => {
  const PC_ID = 'pc:hakaan-doomed';

  function buildState() {
    return withEncounter([
      makeHeroParticipant(PC_ID, {
        ownerId: OWNER_ID,
        maxStamina: 30,
        currentStamina: 30,
        ancestry: ['hakaan'],
        purchasedTraits: ['doomsight'],
        staminaState: 'healthy',
        staminaOverride: null,
      }),
    ]);
  }

  it('BecomeDoomed sets staminaState to doomed', () => {
    let state = buildState();

    const result = applyIntent(
      state,
      stamped({
        type: 'BecomeDoomed',
        actor: PLAYER_ACTOR,
        payload: { participantId: PC_ID, source: 'hakaan-doomsight' },
      }),
    );
    expect(result.errors ?? []).toEqual([]);
    state = result.state;

    const pc = state.participants.find((p) => p.id === PC_ID)!;
    expect(pc.staminaState).toBe('doomed');
    expect(pc.staminaOverride?.kind).toBe('doomed');
    expect((pc.staminaOverride as { source: string }).source).toBe('hakaan-doomsight');
  });

  it('100 damage on doomed Hakaan-Doomsight → state remains doomed (staminaDeathThreshold=none)', () => {
    let state = buildState();
    const becomeDoomedResult = applyIntent(
      state,
      stamped({
        type: 'BecomeDoomed',
        actor: PLAYER_ACTOR,
        payload: { participantId: PC_ID, source: 'hakaan-doomsight' },
      }),
    );
    expect(becomeDoomedResult.errors ?? []).toEqual([]);
    state = becomeDoomedResult.state;

    state = applyDamage(state, { targetId: PC_ID, amount: 100, damageType: 'untyped' });

    const pc = state.participants.find((p) => p.id === PC_ID)!;
    expect(pc.staminaState).toBe('doomed');
  });

  it('EndEncounter with a dieAtEncounterEnd=true doomed PC → state transitions to dead', () => {
    let state = buildState();
    const becomeDoomedResult = applyIntent(
      state,
      stamped({
        type: 'BecomeDoomed',
        actor: PLAYER_ACTOR,
        payload: { participantId: PC_ID, source: 'hakaan-doomsight' },
      }),
    );
    expect(becomeDoomedResult.errors ?? []).toEqual([]);
    state = becomeDoomedResult.state;

    // Verify override has dieAtEncounterEnd=true (Hakaan-Doomsight path)
    const doomedPc = state.participants.find((p) => p.id === PC_ID)!;
    expect((doomedPc.staminaOverride as { dieAtEncounterEnd: boolean }).dieAtEncounterEnd).toBe(
      true,
    );

    // End the encounter
    const encounterId = state.encounter?.id ?? '';
    const endResult = applyIntent(
      state,
      stamped({
        type: 'EndEncounter',
        actor: DIRECTOR_ACTOR,
        payload: { encounterId },
      }),
    );
    expect(endResult.errors ?? []).toEqual([]);

    const dead = endResult.state.participants.find((p) => p.id === PC_ID)!;
    expect(dead.staminaState).toBe('dead');
    expect(dead.staminaOverride).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: Title Doomed via OA claim, then dies at -staminaMax
// ---------------------------------------------------------------------------

describe('slice-1 integration — Title Doomed via OA, dies at -staminaMax', () => {
  const PC_ID = 'pc:title-doomed';
  // maxStamina=30 → windedValue=15 → dying threshold ≤ 0
  // staminaMax death threshold for Title Doomed: stamina ≤ -30

  function buildState() {
    return withEncounter([
      makeHeroParticipant(PC_ID, {
        ownerId: OWNER_ID,
        maxStamina: 30,
        currentStamina: 5,
        equippedTitleIds: ['doomed'],
        ancestry: [],
        staminaOverride: null,
      }),
    ]);
  }

  it('damage to ≤0 stamina on Title Doomed PC → state dying + RaiseOpenAction emitted', () => {
    const state = buildState();
    const result = applyIntent(
      state,
      stamped({
        type: 'ApplyDamage',
        actor: DIRECTOR_ACTOR,
        payload: {
          targetId: PC_ID,
          amount: 10,
          damageType: 'untyped',
          sourceIntentId: 'src-1',
          intent: 'kill',
        },
      }),
    );
    expect(result.errors ?? []).toEqual([]);

    const pc = result.state.participants.find((p) => p.id === PC_ID)!;
    expect(pc.staminaState).toBe('dying');

    // RaiseOpenAction should be in derived
    const oa = result.derived.find((d) => d.type === 'RaiseOpenAction');
    expect(oa).toBeDefined();
    const oaPayload = oa!.payload as { kind: string; participantId: string };
    expect(oaPayload.kind).toBe('title-doomed-opt-in');
    expect(oaPayload.participantId).toBe(PC_ID);
  });

  it('after ClaimOpenAction + ApplyParticipantOverride (title-doomed), further damage past -staminaMax → dead', () => {
    let state = buildState();

    // Step 1: push to dying
    const dmgResult = applyIntent(
      state,
      stamped({
        type: 'ApplyDamage',
        actor: DIRECTOR_ACTOR,
        payload: {
          targetId: PC_ID,
          amount: 10,
          damageType: 'untyped',
          sourceIntentId: 'src-1',
          intent: 'kill',
        },
      }),
    );
    expect(dmgResult.errors ?? []).toEqual([]);
    state = dmgResult.state;

    // Simulate RaiseOpenAction landing in openActions (the DO would apply the derived intent;
    // here we inject it directly since we're an integration test at reducer level).
    const oaDerived = dmgResult.derived.find((d) => d.type === 'RaiseOpenAction');
    expect(oaDerived).toBeDefined();
    const oaPayload = oaDerived!.payload as {
      kind: string;
      participantId: string;
      expiresAtRound: number | null;
    };
    const oaId = 'oa-title-doomed-1';
    state = {
      ...state,
      openActions: [
        ...state.openActions,
        {
          id: oaId,
          kind: 'title-doomed-opt-in' as const,
          participantId: oaPayload.participantId,
          raisedAtRound: 1,
          raisedByIntentId: 'src-1',
          expiresAtRound: oaPayload.expiresAtRound,
          payload: {},
        },
      ],
    };

    // Step 2: player claims the OA
    const claimResult = applyIntent(
      state,
      stamped({
        type: 'ClaimOpenAction',
        actor: PLAYER_ACTOR,
        payload: { openActionId: oaId },
      }),
    );
    expect(claimResult.errors ?? []).toEqual([]);
    state = claimResult.state;
    // OA removed from queue
    expect(state.openActions.find((o) => o.id === oaId)).toBeUndefined();

    // Step 3: ClaimOpenAction doesn't set the override yet (slice 1 design: claim just removes OA).
    // Director applies the Title Doomed override explicitly.
    const overrideResult = applyIntent(
      state,
      stamped({
        type: 'ApplyParticipantOverride',
        actor: DIRECTOR_ACTOR,
        payload: {
          participantId: PC_ID,
          override: {
            kind: 'doomed',
            source: 'title-doomed',
            canRegainStamina: false,
            autoTier3OnPowerRolls: true,
            staminaDeathThreshold: 'staminaMax',
            dieAtEncounterEnd: true,
          },
        },
      }),
    );
    expect(overrideResult.errors ?? []).toEqual([]);
    state = overrideResult.state;

    const doomedPc = state.participants.find((p) => p.id === PC_ID)!;
    expect(doomedPc.staminaState).toBe('doomed');
    expect(doomedPc.staminaOverride?.kind).toBe('doomed');

    // Step 4: apply 30+ damage past -maxStamina (maxStamina=30 → threshold ≤ -30).
    // PC is currently at -5 stamina (doomed). Need to reach -30 → apply 25+ more.
    state = applyDamage(state, { targetId: PC_ID, amount: 30, damageType: 'untyped' });

    const dead = state.participants.find((p) => p.id === PC_ID)!;
    expect(dead.staminaState).toBe('dead');
    // Note: the override is NOT auto-cleared when staminaDeathThreshold fires — the
    // state machine computes 'dead' via deriveOverrideState, but does not null the
    // override. This is by design in slice 1: the instant-death path (inert + fire)
    // does clear the override explicitly; the threshold path does not.
    // The critical assertion is that staminaState === 'dead'.
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: Curse of Punishment forces dying when recoveries exhausted,
//             clears on Respite
// ---------------------------------------------------------------------------

describe('slice-1 integration — Curse of Punishment, clears on Respite', () => {
  const PC_ID = 'pc:cop-hero';

  function buildState() {
    return baseState({
      currentSessionId: 'sess-1',
      participants: [
        makeHeroParticipant(PC_ID, {
          maxStamina: 30,
          currentStamina: 20,
          recoveries: { current: 3, max: 3 },
          staminaState: 'healthy',
          staminaOverride: null,
        }),
      ],
      encounter: null, // No encounter required for Respite
    });
  }

  it('ApplyParticipantOverride(CoP) with recoveries=0 → state becomes dying', () => {
    let state = buildState();
    // Drain recoveries to 0 directly in state
    state = {
      ...state,
      participants: state.participants.map((p) => {
        if (p.id === PC_ID) return { ...p, recoveries: { current: 0, max: 3 } };
        return p;
      }),
    };

    // We need an encounter to apply overrides in this test — the reducer guard is encounter-required.
    // Use baseState with encounter so ApplyParticipantOverride passes.
    state = {
      ...state,
      encounter: makeRunningEncounterPhase('enc-cop'),
    };

    const overrideResult = applyIntent(
      state,
      stamped({
        type: 'ApplyParticipantOverride',
        actor: DIRECTOR_ACTOR,
        payload: {
          participantId: PC_ID,
          override: {
            kind: 'extra-dying-trigger',
            source: 'curse-of-punishment',
            predicate: 'recoveries-exhausted',
          },
        },
      }),
    );
    expect(overrideResult.errors ?? []).toEqual([]);
    const pc = overrideResult.state.participants.find((p) => p.id === PC_ID)!;
    expect(pc.staminaOverride?.kind).toBe('extra-dying-trigger');
    // Predicate fires: recoveries exhausted → dying
    expect(pc.staminaState).toBe('dying');
  });

  it('Respite refills recoveries → CoP override cleared, state healthy', () => {
    // Build state: PC has CoP override, recoveries 0, already dying (no encounter needed for Respite)
    const state = baseState({
      currentSessionId: 'sess-1',
      participants: [
        makeHeroParticipant(PC_ID, {
          maxStamina: 30,
          currentStamina: 20,
          recoveries: { current: 0, max: 3 },
          staminaState: 'dying',
          staminaOverride: {
            kind: 'extra-dying-trigger',
            source: 'curse-of-punishment',
            predicate: 'recoveries-exhausted',
          },
        }),
      ],
      encounter: null,
    });

    const respiteResult = applyIntent(
      state,
      stamped({
        type: 'Respite',
        actor: DIRECTOR_ACTOR,
        payload: {},
      }),
    );
    expect(respiteResult.errors ?? []).toEqual([]);

    const pc = respiteResult.state.participants.find((p) => p.id === PC_ID)!;
    // CoP override cleared — predicate no longer fires since recoveries refilled
    expect(pc.staminaOverride).toBeNull();
    expect(pc.staminaState).toBe('healthy');
    // Recoveries refilled
    expect(pc.recoveries.current).toBe(3);
  });

  it('Respite emits StaminaTransitioned(dying→healthy, cause=recoveries-refilled) for CoP PC', () => {
    const state = baseState({
      currentSessionId: 'sess-1',
      participants: [
        makeHeroParticipant(PC_ID, {
          maxStamina: 30,
          currentStamina: 20,
          recoveries: { current: 0, max: 3 },
          staminaState: 'dying',
          staminaOverride: {
            kind: 'extra-dying-trigger',
            source: 'curse-of-punishment',
            predicate: 'recoveries-exhausted',
          },
        }),
      ],
      encounter: null,
    });

    const respiteResult = applyIntent(
      state,
      stamped({
        type: 'Respite',
        actor: DIRECTOR_ACTOR,
        payload: {},
      }),
    );
    expect(respiteResult.errors ?? []).toEqual([]);

    const transitions = respiteResult.derived.filter((d) => d.type === 'StaminaTransitioned');
    expect(transitions).toHaveLength(1);
    const payload = transitions[0]!.payload as {
      participantId: string;
      from: string;
      to: string;
      cause: string;
    };
    expect(payload.participantId).toBe(PC_ID);
    expect(payload.from).toBe('dying');
    expect(payload.to).toBe('healthy');
    expect(payload.cause).toBe('recoveries-refilled');
  });
});

// ---------------------------------------------------------------------------
// Scenario 6: Q10 cross-side trigger resolution cascade
// ---------------------------------------------------------------------------

describe('slice-1 integration — Q10 cross-side trigger resolution cascade', () => {
  const HERO_ID = 'pc:hero-q10';
  const MONSTER_ID = 'm:monster-q10';
  const SET_ID = '01HWINTEGRATIONQ10000000001';

  const pendingTriggers: PendingTriggerSet = {
    id: SET_ID,
    triggerEvent: {
      kind: 'damage-applied',
      targetId: HERO_ID,
      attackerId: MONSTER_ID,
      amount: 8,
      type: 'fire',
    },
    candidates: [
      { participantId: HERO_ID, triggeredActionId: 'hero-reaction-a', side: 'heroes' },
      { participantId: MONSTER_ID, triggeredActionId: 'monster-reaction-b', side: 'foes' },
    ],
    order: null,
  };

  function buildStateWithPendingTriggers() {
    const base = withEncounter([
      makeHeroParticipant(HERO_ID, { ownerId: OWNER_ID }),
      makeHeroParticipant(MONSTER_ID, { ownerId: null }), // reuse hero factory for simplicity
    ]);
    return {
      ...base,
      encounter: base.encounter ? { ...base.encounter, pendingTriggers } : null,
    } as CampaignState;
  }

  it('ResolveTriggerOrder emits ExecuteTrigger derived intents in the chosen order', () => {
    const state = buildStateWithPendingTriggers();
    expect(state.encounter?.pendingTriggers).not.toBeNull();

    // Director picks order: monster fires first, then hero
    const result = applyIntent(
      state,
      stamped({
        type: 'ResolveTriggerOrder',
        actor: DIRECTOR_ACTOR,
        payload: {
          pendingTriggerSetId: SET_ID,
          order: [MONSTER_ID, HERO_ID],
        },
      }),
    );
    expect(result.errors ?? []).toEqual([]);

    // Two ExecuteTrigger derived intents, in the chosen order
    const execTriggers = result.derived.filter((d) => d.type === 'ExecuteTrigger');
    expect(execTriggers).toHaveLength(2);

    const first = execTriggers[0]!.payload as {
      participantId: string;
      triggeredActionId: string;
    };
    const second = execTriggers[1]!.payload as {
      participantId: string;
      triggeredActionId: string;
    };

    expect(first.participantId).toBe(MONSTER_ID);
    expect(first.triggeredActionId).toBe('monster-reaction-b');
    expect(second.participantId).toBe(HERO_ID);
    expect(second.triggeredActionId).toBe('hero-reaction-a');
  });

  it('pendingTriggers cleared after ResolveTriggerOrder', () => {
    const state = buildStateWithPendingTriggers();

    const result = applyIntent(
      state,
      stamped({
        type: 'ResolveTriggerOrder',
        actor: DIRECTOR_ACTOR,
        payload: {
          pendingTriggerSetId: SET_ID,
          order: [HERO_ID, MONSTER_ID],
        },
      }),
    );
    expect(result.errors ?? []).toEqual([]);
    expect(result.state.encounter?.pendingTriggers).toBeNull();
  });

  it('pendingTriggers cleared at EndEncounter even if ResolveTriggerOrder was never called', () => {
    const state = buildStateWithPendingTriggers();
    expect(state.encounter?.pendingTriggers).not.toBeNull();

    const encounterId = state.encounter?.id ?? '';
    const endResult = applyIntent(
      state,
      stamped({
        type: 'EndEncounter',
        actor: DIRECTOR_ACTOR,
        payload: { encounterId },
      }),
    );
    expect(endResult.errors ?? []).toEqual([]);
    // encounter is null after EndEncounter — pendingTriggers is gone with it.
    expect(endResult.state.encounter).toBeNull();
  });

  it('non-director actor is rejected for ResolveTriggerOrder', () => {
    const state = buildStateWithPendingTriggers();

    const result = applyIntent(
      state,
      stamped({
        type: 'ResolveTriggerOrder',
        actor: { userId: 'some-player', role: 'player' },
        payload: {
          pendingTriggerSetId: SET_ID,
          order: [HERO_ID, MONSTER_ID],
        },
      }),
    );
    expect(result.errors?.[0]?.code).toBe('not_authorized');
    // pendingTriggers unchanged
    expect(result.state.encounter?.pendingTriggers).not.toBeNull();
  });
});
