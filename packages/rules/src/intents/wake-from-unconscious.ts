import { IntentTypes, type Participant, WakeFromUnconsciousPayloadSchema } from '@ironyard/shared';
import { applyTransitionSideEffects, recomputeStaminaState, recoveryValue } from '../stamina';
import type { CampaignState, DerivedIntent, IntentResult, StampedIntent } from '../types';
import { isParticipant } from '../types';

// Phase 2b 2b.15 — Combat.md:673-679. KO wake handler. Director-only.
// Heroes spend a Recovery and regain recoveryValue stamina; director creatures
// gain 1 stamina. Unconscious + Prone conditions are removed. State is
// re-derived and StaminaTransitioned is emitted on transition.
export function applyWakeFromUnconscious(
  state: CampaignState,
  intent: StampedIntent,
): IntentResult {
  const parsed = WakeFromUnconsciousPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `WakeFromUnconscious rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }

  if (intent.actor.userId !== state.activeDirectorId) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: 'WakeFromUnconscious rejected: director only',
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'not_authorized', message: 'director only' }],
    };
  }

  const { participantId } = parsed.data;
  const target = state.participants.filter(isParticipant).find((p) => p.id === participantId);
  if (!target) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `WakeFromUnconscious rejected: participant ${participantId} not found`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'target_missing', message: `participant ${participantId} not found` }],
    };
  }

  if (target.staminaState !== 'unconscious') {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `WakeFromUnconscious rejected: ${target.name} is not unconscious`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'not_unconscious', message: `${participantId} is not unconscious` }],
    };
  }

  // Hero path: spend a Recovery (canon §2.10) for recoveryValue stamina.
  // No Recoveries → can't wake until respite per canon.
  let updated: Participant;
  if (target.kind === 'pc') {
    if (target.recoveries.current <= 0) {
      return {
        state,
        derived: [],
        log: [
          {
            kind: 'error',
            text: `WakeFromUnconscious rejected: ${target.name} has no Recoveries; must respite to wake`,
            intentId: intent.id,
          },
        ],
        errors: [
          { code: 'no_recoveries', message: 'hero with no recoveries cannot wake until respite' },
        ],
      };
    }
    const heal = recoveryValue(target);
    const nextStamina = Math.min(target.currentStamina + heal, target.maxStamina);
    updated = {
      ...target,
      currentStamina: nextStamina,
      recoveries: { ...target.recoveries, current: target.recoveries.current - 1 },
      conditions: target.conditions.filter((c) => c.type !== 'Unconscious' && c.type !== 'Prone'),
    };
  } else {
    // Director-controlled creature: gain 1 Stamina.
    const nextStamina = Math.min(target.currentStamina + 1, target.maxStamina);
    updated = {
      ...target,
      currentStamina: nextStamina,
      conditions: target.conditions.filter((c) => c.type !== 'Unconscious' && c.type !== 'Prone'),
    };
  }

  const { newState, transitioned } = recomputeStaminaState(updated);
  const final = transitioned
    ? applyTransitionSideEffects(updated, target.staminaState, newState)
    : { ...updated, staminaState: newState };

  const derived: DerivedIntent[] = [];
  if (transitioned) {
    derived.push({
      actor: intent.actor,
      source: 'server' as const,
      type: IntentTypes.StaminaTransitioned,
      causedBy: intent.id,
      payload: {
        participantId,
        from: target.staminaState,
        to: newState,
        cause: 'heal',
      },
    });
  }

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      participants: state.participants.map((p) =>
        isParticipant(p) && p.id === participantId ? final : p,
      ),
    },
    derived,
    log: [{ kind: 'info', text: `${target.name} wakes from unconscious`, intentId: intent.id }],
  };
}
