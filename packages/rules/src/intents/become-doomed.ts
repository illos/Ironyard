import {
  BecomeDoomedPayloadSchema,
  IntentTypes,
  type ParticipantStateOverride,
} from '@ironyard/shared';
import type { CampaignState, DerivedIntent, IntentResult, StampedIntent } from '../types';
import { isParticipant } from '../types';

export function applyBecomeDoomed(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = BecomeDoomedPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return reject(state, intent, 'invalid_payload', parsed.error.message);
  }

  const { participantId, source } = parsed.data;
  const target = state.participants.filter(isParticipant).find((p) => p.id === participantId);
  if (!target) {
    return reject(state, intent, 'target_missing', `participant ${participantId} not found`);
  }
  if (target.kind !== 'pc') {
    return reject(state, intent, 'not_eligible', 'only PC participants can become doomed');
  }
  if (target.staminaState === 'dead') {
    return reject(state, intent, 'not_eligible', 'dead participant cannot become doomed');
  }

  // Trust + eligibility checks per source.
  if (source === 'hakaan-doomsight') {
    const isOwner = intent.actor.userId === target.ownerId;
    const isDirector = intent.actor.userId === state.activeDirectorId;
    if (!isOwner && !isDirector) {
      return reject(
        state,
        intent,
        'not_authorized',
        'only the PC owner or active director can dispatch hakaan-doomsight',
      );
    }
    if (!(target.ancestry ?? []).includes('hakaan')) {
      return reject(state, intent, 'not_eligible', 'hakaan-doomsight requires Hakaan ancestry');
    }
    if (!(target.purchasedTraits ?? []).includes('doomsight')) {
      return reject(state, intent, 'not_eligible', 'Doomsight purchased trait not found');
    }
  } else if (source === 'manual') {
    if (intent.actor.userId !== state.activeDirectorId) {
      return reject(state, intent, 'not_authorized', 'manual source requires active director');
    }
  }

  // Build the override config. Both hakaan-doomsight and manual share the same
  // mechanical shape — canRegainStamina:true, staminaDeathThreshold:'none',
  // dieAtEncounterEnd:true per canon §2.9 / plan spec.
  const override: ParticipantStateOverride = {
    kind: 'doomed',
    source,
    canRegainStamina: true,
    autoTier3OnPowerRolls: true,
    staminaDeathThreshold: 'none',
    dieAtEncounterEnd: true,
  };

  const prevState = target.staminaState;
  const updated = {
    ...target,
    staminaOverride: override,
    staminaState: 'doomed' as const,
  };

  const derived: DerivedIntent[] = [
    {
      actor: intent.actor,
      source: 'server' as const,
      type: IntentTypes.StaminaTransitioned,
      causedBy: intent.id,
      payload: {
        participantId,
        from: prevState,
        to: 'doomed',
        cause: 'override-applied',
      },
    },
  ];

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      participants: state.participants.map((p) =>
        isParticipant(p) && p.id === participantId ? updated : p,
      ),
    },
    derived,
    log: [{ kind: 'info', text: `${target.name} becomes doomed (${source})`, intentId: intent.id }],
  };
}

function reject(
  state: CampaignState,
  intent: StampedIntent,
  code: string,
  message: string,
): IntentResult {
  return {
    state,
    derived: [],
    log: [{ kind: 'error', text: `BecomeDoomed rejected: ${message}`, intentId: intent.id }],
    errors: [{ code, message }],
  };
}
