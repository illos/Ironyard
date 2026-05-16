import {
  type ActiveAbilityInstance,
  IntentTypes,
  type Participant,
  UseAbilityPayloadSchema,
} from '@ironyard/shared';
import { ABILITY_TARGETING_EFFECTS } from '../class-triggers/ability-targeting-effects';
import { type AbilityCategory, evaluateActionTriggers } from '../class-triggers/action-triggers';
import { resolveParticipantClass } from '../class-triggers/helpers';
import { participantSide } from '../state-helpers';
import type {
  CampaignState,
  DerivedIntent,
  EncounterPhase,
  IntentResult,
  LogEntry,
  StampedIntent,
} from '../types';
import { isParticipant } from '../types';

// Toggles a narrative-only ability on as an active tag. Idempotent for the
// (participant, abilityId) pair — re-dispatching while already active is a
// no-op (still bumps seq so the intent is logged). Encounter-active for now;
// out-of-encounter narrative buffs aren't a thing yet.
//
// Pass 3 Slice 2a additions (additive, after the existing toggle-on step):
//   1. heroesActedThisTurn append — PC actor ids are added to the encounter-
//      scoped set (dedup'd) so Troubadour's three-heroes-this-turn drama
//      trigger reads a fresh set when the action-trigger evaluator runs below.
//   2. StartMaintenance derived — when `payload.startMaintenance === true`,
//      the actor is a PC Elementalist, and `payload.maintenanceCostPerTurn` is
//      provided, emit a `StartMaintenance` derived intent. The reducer
//      cascades it after this one; the StartMaintenance reducer enforces the
//      Elementalist gate too.
//      DECISION: maintenanceCost comes from the dispatcher payload (UI reads
//      the ability record). Slice 2c may add `Ability.maintenanceCost` as a
//      parser-extracted field — at which point the dispatcher can pass it
//      through, and the server-side gating can validate against the parsed
//      record. Today the payload-supplied number is the source of truth.
//   3. Psion EoT clarity-damage opt-out — sets `psionFlags.clarityDamageOptOutThisTurn`
//      on the actor when `payload.talentClarityDamageOptOutThisTurn === true`.
//      Consumed by EndTurn's clarity-damage hook (turn.ts) in Task 25.
//   4. Talent Strained:rider opt-in — currently a no-op log entry; the actual
//      rider firing happens in roll-power.ts (Task 23) where clarity is
//      spent. UseAbility doesn't itself spend resources or deal damage. The
//      flag is acknowledged here so the payload-only path doesn't reject; the
//      RollPower path will read it from the user's character settings or
//      mirror the same flag on a future RollPower payload extension.
//      TODO Task 23: confirm whether this flag should be plumbed through onto
//      a downstream RollPower intent or kept payload-local.
//   5. Class-trigger evaluation — call `evaluateActionTriggers` with an
//      `ability-used` event so Tactician (ally heroic within 10sq spatial OA)
//      and Troubadour (three-heroes-this-turn drama gain) get their per-class
//      derived intents. Category and kind default to 'signature' / 'action'
//      when the dispatcher hasn't supplied them — see schema doc on
//      `abilityCategory` and `abilityKind` for the derivation hint.
export function applyUseAbility(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = UseAbilityPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `UseAbility rejected: ${parsed.error.message}`,
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

  const { participantId, abilityId, source, duration } = parsed.data;
  const target = state.participants.filter(isParticipant).find((p) => p.id === participantId);
  if (!target) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: `participant ${participantId} not found`, intentId: intent.id }],
      errors: [{ code: 'participant_missing', message: `${participantId} not in encounter` }],
    };
  }

  // The existing toggle-on step: append the active-ability instance to the
  // target. Idempotent — re-activating an already-active ability is a no-op
  // (still bumps seq so the intent is logged). The slice 2a additions below
  // run regardless of whether the toggle was a no-op, because the Psion /
  // Maintenance / class-trigger paths are independent of whether this is the
  // first or subsequent activation. (In practice the UI gates re-activation,
  // so the no-op branch is rare; the additions are still safe to run.)
  const alreadyActive = target.activeAbilities.some((a) => a.abilityId === abilityId);
  const seq = state.seq + 1;

  // Apply the toggle-on if not already active.
  let updatedTarget: Participant = alreadyActive
    ? target
    : {
        ...target,
        activeAbilities: [
          ...target.activeAbilities,
          {
            abilityId,
            source,
            expiresAt: duration,
            appliedAtSeq: seq,
          } satisfies ActiveAbilityInstance,
        ],
      };

  const log: LogEntry[] = [];
  if (alreadyActive) {
    log.push({
      kind: 'info',
      text: `${target.name} already has ${abilityId} active (idempotent)`,
      intentId: intent.id,
    });
  } else {
    log.push({
      kind: 'info',
      text: `${target.name} activates ${abilityId} (until ${duration.kind})`,
      intentId: intent.id,
    });
  }

  // Phase 2b 2b.16 B26 — Psion-only toggles. Per canon Talent.md:1453-1457 the
  // `talentClarityDamageOptOutThisTurn` (skip negative-clarity damage) and
  // `talentStrainedOptInRider` (volunteer for the Strained rider) require the
  // 10th-level Psion Talent feature. Reject the toggles when the actor doesn't
  // meet that gate — the rest of the UseAbility intent still applies.
  const isPsionTalent =
    target.kind === 'pc' &&
    resolveParticipantClass(state, target) === 'talent' &&
    target.level >= 10;
  if (
    (parsed.data.talentClarityDamageOptOutThisTurn || parsed.data.talentStrainedOptInRider) &&
    !isPsionTalent
  ) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `UseAbility rejected: Psion-only toggle on non-Psion-Talent ${target.name}`,
          intentId: intent.id,
        },
      ],
      errors: [
        {
          code: 'not_psion_talent',
          message:
            'talentClarityDamageOptOutThisTurn / talentStrainedOptInRider require a 10th-level Psion Talent',
        },
      ],
    };
  }

  // ── Slice 2a addition #3: Psion clarity-damage opt-out ──────────────────
  if (parsed.data.talentClarityDamageOptOutThisTurn && target.kind === 'pc') {
    updatedTarget = {
      ...updatedTarget,
      psionFlags: {
        ...updatedTarget.psionFlags,
        clarityDamageOptOutThisTurn: true,
      },
    };
    log.push({
      kind: 'info',
      text: `${target.name} opts out of EoT clarity damage this turn`,
      intentId: intent.id,
    });
  }

  // ── Slice 2a addition #4: Talent Strained:rider opt-in (no-op log) ──────
  // The actual rider resolution lives with RollPower (Task 23) where clarity
  // is spent. UseAbility never spends resources, so there's nothing here to
  // wire; we log the opt-in for traceability and leave the flag on the
  // payload for any downstream consumer that wants to read it.
  if (parsed.data.talentStrainedOptInRider && target.kind === 'pc') {
    log.push({
      kind: 'info',
      text: `${target.name} opts INTO Strained: rider on ${abilityId}`,
      intentId: intent.id,
    });
  }

  // ── Slice 2a addition #1: encounter heroesActedThisTurn append ──────────
  // Critical ordering: this write must land BEFORE evaluateActionTriggers
  // runs below, so the Troubadour three-heroes-this-turn evaluator reads the
  // post-write set size. See `troubadour.ts` header note.
  let updatedEncounter: EncounterPhase = state.encounter;
  if (target.kind === 'pc') {
    const acted = state.encounter.perEncounterFlags.perTurn.heroesActedThisTurn;
    if (!acted.includes(target.id)) {
      updatedEncounter = {
        ...state.encounter,
        perEncounterFlags: {
          ...state.encounter.perEncounterFlags,
          perTurn: {
            ...state.encounter.perEncounterFlags.perTurn,
            heroesActedThisTurn: [...acted, target.id],
          },
        },
      };
    }
  }

  // Roster after the participant-scoped updates land (toggle-on + psionFlags).
  const updatedParticipants = state.participants.map((p) =>
    isParticipant(p) && p.id === participantId ? updatedTarget : p,
  );

  // Build derived intents.
  const derived: DerivedIntent[] = [];

  // ── Slice 2a addition #2: StartMaintenance derived (Elementalist only) ──
  if (parsed.data.startMaintenance && target.kind === 'pc') {
    const cls = resolveParticipantClass(state, updatedTarget);
    const cost = parsed.data.maintenanceCostPerTurn;
    if (cls === 'elementalist' && cost && cost > 0) {
      derived.push({
        actor: intent.actor,
        source: 'server' as const,
        type: IntentTypes.StartMaintenance,
        payload: {
          participantId: target.id,
          abilityId,
          costPerTurn: cost,
        },
      });
    } else if (cls !== 'elementalist') {
      log.push({
        kind: 'warning',
        text: `startMaintenance ignored: ${target.name} is not an Elementalist`,
        intentId: intent.id,
      });
    } else if (!cost || cost <= 0) {
      log.push({
        kind: 'warning',
        text: `startMaintenance ignored: missing maintenanceCostPerTurn on payload`,
        intentId: intent.id,
      });
    }
  }

  // ── Phase 2b slice 7: Polder Shadowmeld → StartFlying { mode: 'shadow' } ──
  // Shadowmeld is a narrative-tagged maneuver that ALSO needs to set the
  // participant's movementMode so the rest of the engine (e.g. wings.ts
  // onEndRound which only ticks mode === 'flying') sees it. The derived
  // intent runs with source: 'server' to bypass the StartFlying state-gate;
  // the action-economy gate on UseAbility itself already governs whether
  // the Polder can take this maneuver. roundsRemaining: 0 is a sentinel
  // meaning "no duration countdown" — Shadowmeld lasts until the Polder
  // exits it (a separate maneuver) or the surface is destroyed; neither
  // path is wired yet (carry-over).
  if (abilityId === 'polder.shadowmeld' && !alreadyActive) {
    derived.push({
      actor: intent.actor,
      source: 'server' as const,
      type: IntentTypes.StartFlying,
      payload: {
        participantId: target.id,
        mode: 'shadow' as const,
      },
    });
  }

  // ── Slice 2a addition #5: action-event class-trigger evaluation ─────────
  // Pass the post-heroesActedThisTurn-write state so Troubadour sees the
  // fresh set. ferocityD3 is not needed for ability-used events — UseAbility
  // doesn't deal damage; the trigger evaluator's per-class evaluators that
  // require ferocityD3 are gated on event.kind === 'damage-applied'.
  const postWriteState: CampaignState = {
    ...state,
    participants: updatedParticipants,
    encounter: updatedEncounter,
  };
  const abilityCategory: AbilityCategory = parsed.data.abilityCategory ?? 'signature';
  const abilityKind = parsed.data.abilityKind ?? 'action';
  const triggerDerived = evaluateActionTriggers(
    postWriteState,
    {
      kind: 'ability-used',
      actorId: target.id,
      abilityId,
      abilityCategory,
      abilityKind,
      sideOfActor: participantSide(target),
    },
    { actor: intent.actor, rolls: {} },
  );
  for (const d of triggerDerived) {
    derived.push({ ...d, causedBy: intent.id });
  }

  // ── Slice 2b: ABILITY_TARGETING_EFFECTS derived emission ────────────────
  // Auto-set targeting relations for the two registered PHB abilities
  // (Judgment, Mark). Both ship with mode: 'replace' — clear existing
  // entries before adding the new target. Skipped when targetIds is empty.
  //
  // Phase 2b cleanup 2b.14 — cross-PC sweep. For mode: 'replace', also clear
  // the new target from every OTHER participant's same-kind relation array.
  // Canon Censor.md: Judgment ends "until another censor judges the target."
  // Canon Tactician.md: "if another tactician marks a creature, your mark on
  // that creature ends." Without this sweep, two heroes can simultaneously
  // hold the same Judgment/Mark — both fire their gain triggers off it.
  const targetingEffect = ABILITY_TARGETING_EFFECTS[abilityId];
  if (
    targetingEffect &&
    parsed.data.targetIds &&
    parsed.data.targetIds.length > 0 &&
    target.kind === 'pc'
  ) {
    const { relationKind, mode } = targetingEffect;
    const existing = target.targetingRelations[relationKind];
    if (mode === 'replace') {
      // (a) Clear the actor's own existing entries (slice 2b).
      for (const exId of existing) {
        derived.push({
          actor: intent.actor,
          source: 'server' as const,
          type: IntentTypes.SetTargetingRelation,
          payload: {
            sourceId: target.id,
            relationKind,
            targetId: exId,
            present: false,
          },
          causedBy: intent.id,
        });
      }
      // (b) Phase 2b 2b.14 — cross-PC sweep: for each new target, scan every
      // OTHER participant's same-kind list and clear the target there too.
      for (const newId of parsed.data.targetIds) {
        for (const other of state.participants) {
          if (!('id' in other) || other.id === target.id) continue;
          // Only Participant entries carry targetingRelations; skip other roster kinds.
          if (!('targetingRelations' in other)) continue;
          const arr = (other as { targetingRelations: Record<string, string[]> })
            .targetingRelations[relationKind];
          if (!arr || !arr.includes(newId)) continue;
          derived.push({
            actor: intent.actor,
            source: 'server' as const,
            type: IntentTypes.SetTargetingRelation,
            payload: {
              sourceId: other.id,
              relationKind,
              targetId: newId,
              present: false,
            },
            causedBy: intent.id,
          });
        }
      }
    }
    for (const newId of parsed.data.targetIds) {
      derived.push({
        actor: intent.actor,
        source: 'server' as const,
        type: IntentTypes.SetTargetingRelation,
        payload: {
          sourceId: target.id,
          relationKind,
          targetId: newId,
          present: true,
        },
        causedBy: intent.id,
      });
    }
  }

  return {
    state: {
      ...state,
      seq,
      participants: updatedParticipants,
      encounter: updatedEncounter,
    },
    derived,
    log,
  };
}
