import { IntentTypes, type Participant, PickNextActorPayloadSchema } from '@ironyard/shared';
import { participantSide } from '../state-helpers';
import type { CampaignState, DerivedIntent, IntentResult, StampedIntent } from '../types';
import { isParticipant } from '../types';

export function applyPickNextActor(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = PickNextActorPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `PickNextActor rejected: ${parsed.error.message}`,
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
      log: [{ kind: 'error', text: 'PickNextActor: no active encounter', intentId: intent.id }],
      errors: [{ code: 'no_active_encounter', message: 'no active encounter' }],
    };
  }
  const enc = state.encounter;
  if (enc.currentRound === null || enc.firstSide === null) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: 'PickNextActor: initiative not rolled', intentId: intent.id }],
      errors: [{ code: 'initiative_not_rolled', message: 'RollInitiative must fire first' }],
    };
  }
  if (enc.activeParticipantId !== null) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: 'PickNextActor: a turn is already in progress',
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'turn_in_progress', message: 'end the current turn before picking' }],
    };
  }

  const { participantId, rolls } = parsed.data;
  const target = state.participants.find(
    (p): p is Participant => isParticipant(p) && p.id === participantId,
  );
  if (!target) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `PickNextActor: unknown participant ${participantId}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'unknown_participant', message: `unknown participant ${participantId}` }],
    };
  }
  if (enc.actedThisRound.includes(participantId)) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `PickNextActor: ${participantId} already acted this round`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'already_acted', message: `${participantId} already acted this round` }],
    };
  }
  const side = participantSide(target);
  if (side !== enc.currentPickingSide) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `PickNextActor: ${participantId} is on the wrong side`,
          intentId: intent.id,
        },
      ],
      errors: [
        {
          code: 'wrong_side',
          message: `currentPickingSide is ${enc.currentPickingSide}; ${participantId} is on ${side}`,
        },
      ],
    };
  }

  // Trust check.
  const isDirector = intent.actor.userId === state.activeDirectorId;
  if (side === 'heroes') {
    const isOwner = target.ownerId !== null && intent.actor.userId === target.ownerId;
    if (!isDirector && !isOwner) {
      return {
        state,
        derived: [],
        log: [{ kind: 'error', text: 'PickNextActor: not permitted', intentId: intent.id }],
        errors: [
          {
            code: 'not_permitted',
            message: 'only the PC owner or active director may pick this hero',
          },
        ],
      };
    }
  } else {
    if (!isDirector) {
      return {
        state,
        derived: [],
        log: [
          {
            kind: 'error',
            text: 'PickNextActor: foe picks are director-only',
            intentId: intent.id,
          },
        ],
        errors: [{ code: 'not_permitted', message: 'only the active director may pick a foe' }],
      };
    }
  }

  const derived: DerivedIntent[] = [
    {
      actor: intent.actor,
      source: 'auto' as const,
      type: IntentTypes.StartTurn,
      payload: rolls ? { participantId, rolls } : { participantId },
      causedBy: intent.id,
    },
  ];

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      encounter: {
        ...enc,
        actedThisRound: [...enc.actedThisRound, participantId],
        activeParticipantId: participantId,
      },
    },
    derived,
    log: [{ kind: 'info', text: `${participantId} picked next (${side})`, intentId: intent.id }],
  };
}
