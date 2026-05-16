import { RaiseOpenActionPayloadSchema, ulid } from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';

export function applyRaiseOpenAction(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = RaiseOpenActionPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `RaiseOpenAction rejected: ${parsed.error.message}`,
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
      log: [
        {
          kind: 'error',
          text: 'RaiseOpenAction rejected: no active encounter',
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'no_active_encounter', message: 'no active encounter' }],
    };
  }

  const id = `oa_${ulid()}`;
  const nextOpenActions = [
    ...state.openActions,
    {
      id,
      kind: parsed.data.kind,
      participantId: parsed.data.participantId,
      raisedAtRound: state.encounter.currentRound ?? 0,
      raisedByIntentId: intent.id,
      expiresAtRound: parsed.data.expiresAtRound,
      payload: parsed.data.payload,
    },
  ];

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      openActions: nextOpenActions,
    },
    derived: [],
    log: [
      {
        kind: 'info',
        text: `OpenAction raised (${parsed.data.kind}) for ${parsed.data.participantId}`,
        intentId: intent.id,
      },
    ],
  };
}
