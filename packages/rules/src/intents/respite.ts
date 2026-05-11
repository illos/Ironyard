import { RespitePayloadSchema } from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';
import { isParticipant } from '../types';

export function applyRespite(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = RespitePayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `Respite rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }

  // Reject during an active encounter.
  if (state.encounter !== null) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: 'Respite rejected: cannot respite during an active encounter',
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'in_encounter', message: 'cannot respite during an active encounter' }],
    };
  }

  // Capture pre-respite victory count for the log message.
  const xpAwarded = state.partyVictories;

  // Refill recoveries.current to recoveries.max for every PC participant.
  // Monsters, pc-placeholders, and any other roster entries are untouched.
  const newParticipants = state.participants.map((entry) => {
    if (!isParticipant(entry) || entry.kind !== 'pc') return entry;
    return {
      ...entry,
      recoveries: { current: entry.recoveries.max, max: entry.recoveries.max },
    };
  });

  const heroCount = newParticipants.filter((e) => isParticipant(e) && e.kind === 'pc').length;

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      participants: newParticipants,
      partyVictories: 0,
    },
    derived: [],
    log: [
      {
        kind: 'info',
        text: `Respite: refilled recoveries for ${heroCount} hero${heroCount !== 1 ? 'es' : ''}; ${xpAwarded} XP each.`,
        intentId: intent.id,
      },
    ],
  };
}
