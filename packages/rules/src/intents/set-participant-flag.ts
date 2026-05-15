import {
  SetParticipantPerEncounterLatchPayloadSchema,
  SetParticipantPosthumousDramaEligiblePayloadSchema,
} from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';
import { isParticipant } from '../types';

// Pass 3 Slice 2a — small, targeted state writes raised by class-trigger
// subscribers (see `packages/rules/src/class-triggers/`). Both reducers are
// no-cascade, no-log-noise: they mutate one field on one participant.
// Player-trust: server-only (see SERVER_ONLY_INTENTS in shared/intents/index).

export function applySetParticipantPerEncounterLatch(
  state: CampaignState,
  intent: StampedIntent,
): IntentResult {
  const parsed = SetParticipantPerEncounterLatchPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `SetParticipantPerEncounterLatch rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }
  const { participantId, key, value } = parsed.data;
  const target = state.participants.filter(isParticipant).find((p) => p.id === participantId);
  if (!target || target.kind !== 'pc') {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `SetParticipantPerEncounterLatch: participant ${participantId} not a PC`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'target_missing', message: `PC participant ${participantId} not found` }],
    };
  }
  const participants = state.participants.map((p) => {
    if (!isParticipant(p) || p.id !== participantId || p.kind !== 'pc') return p;
    return {
      ...p,
      perEncounterFlags: {
        ...p.perEncounterFlags,
        perEncounter: { ...p.perEncounterFlags.perEncounter, [key]: value },
      },
    };
  });
  return {
    state: { ...state, seq: state.seq + 1, participants },
    derived: [],
    log: [],
  };
}

export function applySetParticipantPosthumousDramaEligible(
  state: CampaignState,
  intent: StampedIntent,
): IntentResult {
  const parsed = SetParticipantPosthumousDramaEligiblePayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `SetParticipantPosthumousDramaEligible rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }
  const { participantId, value } = parsed.data;
  const target = state.participants.filter(isParticipant).find((p) => p.id === participantId);
  if (!target || target.kind !== 'pc') {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `SetParticipantPosthumousDramaEligible: participant ${participantId} not a PC`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'target_missing', message: `PC participant ${participantId} not found` }],
    };
  }
  const participants = state.participants.map((p) => {
    if (!isParticipant(p) || p.id !== participantId || p.kind !== 'pc') return p;
    return { ...p, posthumousDramaEligible: value };
  });
  return {
    state: { ...state, seq: state.seq + 1, participants },
    derived: [],
    log: [],
  };
}
