import {
  type ActiveAbilityInstance,
  type Participant,
  UseAbilityPayloadSchema,
} from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';
import { isParticipant } from '../types';

// Toggles a narrative-only ability on as an active tag. Idempotent for the
// (participant, abilityId) pair — re-dispatching while already active is a
// no-op (still bumps seq so the intent is logged). Encounter-active for now;
// out-of-encounter narrative buffs aren't a thing yet.
export function applyUseAbility(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = UseAbilityPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        { kind: 'error', text: `UseAbility rejected: ${parsed.error.message}`, intentId: intent.id },
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
  const target = state.participants
    .filter(isParticipant)
    .find((p) => p.id === participantId);
  if (!target) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: `participant ${participantId} not found`, intentId: intent.id }],
      errors: [{ code: 'participant_missing', message: `${participantId} not in encounter` }],
    };
  }

  if (target.activeAbilities.some((a) => a.abilityId === abilityId)) {
    return {
      state: { ...state, seq: state.seq + 1 },
      derived: [],
      log: [
        {
          kind: 'info',
          text: `${target.name} already has ${abilityId} active (idempotent)`,
          intentId: intent.id,
        },
      ],
    };
  }

  const seq = state.seq + 1;
  const newInstance: ActiveAbilityInstance = {
    abilityId,
    source,
    expiresAt: duration,
    appliedAtSeq: seq,
  };

  const updatedTarget: Participant = {
    ...target,
    activeAbilities: [...target.activeAbilities, newInstance],
  };
  const updatedParticipants = state.participants.map((p) =>
    isParticipant(p) && p.id === participantId ? updatedTarget : p,
  );

  return {
    state: {
      ...state,
      seq,
      participants: updatedParticipants,
    },
    derived: [],
    log: [
      {
        kind: 'info',
        text: `${target.name} activates ${abilityId} (until ${duration.kind})`,
        intentId: intent.id,
      },
    ],
  };
}
