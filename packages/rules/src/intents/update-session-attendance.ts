import { UpdateSessionAttendancePayloadSchema } from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';

export function applyUpdateSessionAttendance(
  state: CampaignState,
  intent: StampedIntent,
): IntentResult {
  const parsed = UpdateSessionAttendancePayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `UpdateSessionAttendance rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }
  if (state.currentSessionId === null) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: 'no active session', intentId: intent.id }],
      errors: [{ code: 'no_active_session', message: 'no session is active' }],
    };
  }

  const { add = [], remove = [] } = parsed.data;
  const removeSet = new Set(remove);
  const next = state.attendingCharacterIds.filter((id) => !removeSet.has(id));
  for (const id of add) {
    if (!next.includes(id)) next.push(id);
  }

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      attendingCharacterIds: next,
    },
    derived: [],
    log: [
      {
        kind: 'info',
        text: `attendance updated: +${add.length} / -${remove.length} (${next.length} attending)`,
        intentId: intent.id,
      },
    ],
  };
}
