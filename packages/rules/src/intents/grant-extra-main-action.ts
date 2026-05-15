import { GrantExtraMainActionPayloadSchema } from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';
import { isParticipant } from '../types';

export function applyGrantExtraMainAction(
  state: CampaignState,
  intent: StampedIntent,
): IntentResult {
  const parsed = GrantExtraMainActionPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }

  const { participantId } = parsed.data;
  const target = state.participants.filter(isParticipant).find((p) => p.id === participantId);
  if (!target) {
    return {
      state,
      derived: [],
      log: [],
      errors: [{ code: 'target_missing', message: `participant ${participantId} not found` }],
    };
  }

  // Reset main-action usage flag so the actor can use a second main action this
  // turn (canon §4.10 — nat 19/20 with a main-action ability grants an extra
  // main action; works even while Dazed).
  const updated = {
    ...target,
    turnActionUsage: { ...target.turnActionUsage, main: false },
  };

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      participants: state.participants.map((p) =>
        isParticipant(p) && p.id === participantId ? updated : p,
      ),
    },
    derived: [],
    log: [
      {
        kind: 'info',
        text: `${target.name} gains an extra main action (critical hit)`,
        intentId: intent.id,
      },
    ],
  };
}
