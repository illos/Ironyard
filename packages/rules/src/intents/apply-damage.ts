import { ApplyDamagePayloadSchema, IntentTypes, type Participant } from '@ironyard/shared';
import { evaluateActionTriggers, evaluateStaminaTransitionTriggers } from '../class-triggers';
import { applyDamageStep } from '../damage';
import { applyTransitionSideEffects, recomputeStaminaState } from '../stamina';
import type { CampaignState, DerivedIntent, IntentResult, StampedIntent } from '../types';
import { isParticipant } from '../types';

export function applyApplyDamage(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = ApplyDamagePayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `ApplyDamage rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }

  if (!state.encounter) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: 'no active encounter', intentId: intent.id }],
      errors: [{ code: 'no_active_encounter', message: 'no active encounter' }],
    };
  }

  const {
    targetId,
    amount,
    damageType,
    intent: damageIntent,
    ferocityD3,
    bypassDamageReduction,
  } = parsed.data;
  const participants = state.participants.filter(isParticipant);
  const target = participants.find((p) => p.id === targetId);
  if (!target) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: `target ${targetId} not found`, intentId: intent.id }],
      errors: [{ code: 'target_missing', message: `target ${targetId} not in encounter` }],
    };
  }

  const result = applyDamageStep(target, amount, damageType, {
    intent: damageIntent,
    bypassDamageReduction,
  });

  // Apply per-trait override-activation rules at the moment of transition.
  // These run AFTER applyDamageStep so the transition has already been computed.
  // Re-derive state after applying the override so staminaState is consistent.
  // Revenant inert and Hakaan rubble both intercept the → dead transition per
  // canon (Revenant.md:91 and Hakaan.md:135 — both at "negative of winded value").
  let updatedTarget = result.newParticipant;

  if (result.transitionedTo === 'dead') {
    if (shouldRevenantInterceptDead(target)) {
      updatedTarget = applyRevenantInert(updatedTarget);
    } else if (shouldHakaanInterceptDead(target)) {
      updatedTarget = applyHakaanRubble(updatedTarget);
    }
  }

  const updatedParticipants = state.participants.map((p) =>
    isParticipant(p) && p.id === targetId ? updatedTarget : p,
  );

  // Build derived intents.
  const derived: DerivedIntent[] = [];

  const logText = result.knockedOut
    ? `${target.name} is knocked unconscious`
    : `${target.name} takes ${result.delivered} ${damageType} damage (${result.before} → ${result.after})`;

  // Emit StaminaTransitioned whenever the state changed.
  // Capture the final "to" state from updatedTarget (which may differ from
  // result.transitionedTo if an override substituted the state).
  const finalState = updatedTarget.staminaState;
  const didTransition = finalState !== target.staminaState;

  if (didTransition) {
    derived.push({
      actor: intent.actor,
      source: 'server' as const,
      type: IntentTypes.StaminaTransitioned,
      causedBy: intent.id,
      payload: {
        participantId: targetId,
        from: target.staminaState,
        to: finalState,
        cause: 'damage',
      },
    });

    // Title-Doomed auto-raise: PC with Title Doomed equipped reached stamina ≤ 0
    // while remaining conscious (state derives to 'dying'). Revenant override
    // would have substituted 'inert' — check the final state not the intermediate.
    if (
      finalState === 'dying' &&
      updatedTarget.kind === 'pc' &&
      hasTitleDoomedEquipped(updatedTarget) &&
      updatedTarget.staminaOverride === null
    ) {
      derived.push({
        actor: intent.actor,
        source: 'server' as const,
        type: IntentTypes.RaiseOpenAction,
        causedBy: intent.id,
        payload: {
          kind: 'title-doomed-opt-in',
          participantId: targetId,
          expiresAtRound: null,
          payload: {},
        },
      });
    }

    // Pass 3 Slice 2a — class-δ stamina-transition triggers (Fury winded /
    // dying, Troubadour any-hero-winded / hero-dies / posthumous-eligibility).
    // The evaluator reads `state.participants` to find Furies/Troubadours and
    // their unflipped latches; pass the post-damage participants so the
    // transitioning participant's updated state is visible and latch checks
    // see the pre-flip values. The latch flip itself happens via the derived
    // SetParticipantPerEncounterLatch intents the evaluator emits, which the
    // reducer cascades on top of this state.
    const postDamageState: CampaignState = { ...state, participants: updatedParticipants };
    const triggerDerived = evaluateStaminaTransitionTriggers(
      {
        participantId: targetId,
        from: target.staminaState,
        to: finalState,
        cause: 'damage',
      },
      postDamageState,
      {
        actor: intent.actor,
        // Fury Ferocity entries require a pre-rolled 1d3. Client pre-rolls
        // and includes it on the payload (see ApplyDamagePayloadSchema
        // docstring). If undefined here and a Fury entry fires, the
        // evaluator throws — that's intentional surface-the-bug behavior.
        rolls: { ferocityD3 },
      },
    );
    // Class-trigger derived intents inherit the same causedBy chain.
    for (const d of triggerDerived) {
      derived.push({ ...d, causedBy: intent.id });
    }
  }

  // Pass 3 Slice 2a — action-event class-trigger evaluation. Distinct from the
  // stamina-transition path above: fires on every ApplyDamage (transition or
  // not). Driven by `evaluateActionTriggers(state, { kind: 'damage-applied' }, ctx)`.
  //
  // Ordering note: the evaluator reads the INPUT `state` — i.e. before the
  // slice-2a flag writes below are applied. This is intentional: Fury's
  // `tookDamage` gate must see the pre-write value so the gain fires the first
  // time per round. The flag writes the engine emits below + the flag writes
  // Fury's trigger itself emits both land in `derived[]`; the reducer applies
  // them sequentially and the writes are idempotent on the same (participant,
  // key) — so the end state is correct regardless of derived-array order.
  //
  // Ferocity requires a pre-rolled 1d3 — same ctx as the stamina-transition
  // path. ApplyDamagePayloadSchema documents this requirement; if a Fury
  // first-time-per-round gain fires without a value, the evaluator throws.
  const actionCtx = {
    actor: intent.actor,
    rolls: { ferocityD3 },
  };
  const dealerId = state.encounter.activeParticipantId;
  const actionTriggerDerived = evaluateActionTriggers(
    state,
    {
      kind: 'damage-applied',
      dealerId,
      targetId,
      amount: result.delivered,
      type: damageType,
    },
    actionCtx,
  );
  for (const d of actionTriggerDerived) {
    derived.push({ ...d, causedBy: intent.id });
  }

  // Pass 3 Slice 2a — flag writes that consumers (Tactician marks, Null
  // Reactive Slide, Bloodfire reader, etc.) read in later slices. All writes
  // are gated on the dealer/target being a PC; the active-turn-scoped writes
  // additionally require an active turn (so out-of-turn damage — e.g.
  // triggered actions firing between turns — doesn't pollute the next actor's
  // perTurn list).
  const activeTurnId = state.encounter.activeParticipantId;
  if (activeTurnId) {
    // damageDealtThisTurn on dealer (PC), scoped to active turn
    const dealer = participants.find((p) => p.id === activeTurnId);
    if (dealer?.kind === 'pc') {
      derived.push({
        actor: intent.actor,
        source: 'server' as const,
        type: IntentTypes.SetParticipantPerTurnEntry,
        causedBy: intent.id,
        payload: {
          participantId: dealer.id,
          scopedToTurnOf: activeTurnId,
          key: 'damageDealtThisTurn',
          value: true,
        },
      });
    }
    // damageTakenThisTurn on target (PC), scoped to active turn
    if (target.kind === 'pc') {
      derived.push({
        actor: intent.actor,
        source: 'server' as const,
        type: IntentTypes.SetParticipantPerTurnEntry,
        causedBy: intent.id,
        payload: {
          participantId: targetId,
          scopedToTurnOf: activeTurnId,
          key: 'damageTakenThisTurn',
          value: true,
        },
      });
    }
  }

  // tookDamage perRound flag on target (PC), only if not already set.
  // Fury's class-trigger also emits this write; the double-write is harmless
  // because the reducer is idempotent on (participantId, key).
  if (target.kind === 'pc' && !target.perEncounterFlags.perRound.tookDamage) {
    derived.push({
      actor: intent.actor,
      source: 'server' as const,
      type: IntentTypes.SetParticipantPerRoundFlag,
      causedBy: intent.id,
      payload: {
        participantId: targetId,
        key: 'tookDamage',
        value: true,
      },
    });
  }

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      participants: updatedParticipants,
    },
    derived,
    log: [{ kind: 'info', text: logText, intentId: intent.id }],
  };
}

// --- Override activation helpers ---

// Revenant: intercept → dead with inert. Per Revenant.md:91 the inert state
// fires "when your Stamina reaches the negative of your winded value" — that
// is the *dead* threshold, not the dying one. Fires only when:
//   - target is a PC
//   - ancestry array contains 'revenant' (stamped at StartEncounter)
//   - no prior override is already active
//   - transition target is 'dead' (checked by caller)
function shouldRevenantInterceptDead(p: Participant): boolean {
  return p.kind === 'pc' && p.ancestry.includes('revenant') && p.staminaOverride === null;
}

function applyRevenantInert(p: Participant): Participant {
  const withOverride: Participant = {
    ...p,
    staminaOverride: {
      kind: 'inert',
      source: 'revenant',
      instantDeathDamageTypes: ['fire'],
      regainHours: 12,
      regainAmount: 'recoveryValue',
      // Phase 2b 2b.15 B31 — Revenant.md:91 "can't regain Stamina ... in any way."
      canRegainStamina: false,
    },
  };
  // Re-derive state with the override now in place.
  const { newState } = recomputeStaminaState(withOverride);
  return applyTransitionSideEffects(withOverride, p.staminaState, newState);
}

// Hakaan-Doomsight: intercept dying → dead with rubble. Fires only when:
//   - target is a PC
//   - ancestry contains 'hakaan' (stamped at StartEncounter)
//   - purchasedTraits contains 'doomsight' (stamped at StartEncounter)
//   - no prior override is active AND current state is NOT already 'doomed'
//   - transition target is 'dead' (checked by caller)
function shouldHakaanInterceptDead(p: Participant): boolean {
  return (
    p.kind === 'pc' &&
    p.ancestry.includes('hakaan') &&
    p.purchasedTraits.includes('doomsight') &&
    p.staminaOverride === null &&
    p.staminaState !== 'doomed'
  );
}

function applyHakaanRubble(p: Participant): Participant {
  const withOverride: Participant = {
    ...p,
    staminaOverride: {
      kind: 'rubble',
      source: 'hakaan-doomsight',
      regainHours: 12,
      regainAmount: 'recoveryValue',
      // Phase 2b 2b.15 B31 — Hakaan.md:135 "can't regain Stamina ... in any way."
      canRegainStamina: false,
    },
  };
  // Re-derive state with the override now in place.
  const { newState } = recomputeStaminaState(withOverride);
  return applyTransitionSideEffects(withOverride, p.staminaState, newState);
}

// Title-Doomed: check whether the PC has the 'doomed' title equipped.
// equippedTitleIds is stamped at StartEncounter from character.titleId.
function hasTitleDoomedEquipped(p: Participant): boolean {
  return p.equippedTitleIds.includes('doomed');
}
