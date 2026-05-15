import { ExecuteTriggerPayloadSchema } from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';

export function applyExecuteTrigger(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = ExecuteTriggerPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }
  // Slice 1 just logs; slice 2 wires the underlying ability's dispatch when
  // the class-δ trigger raisers ship.
  return {
    state,
    derived: [],
    log: [
      {
        kind: 'info',
        text: `Execute trigger: ${parsed.data.participantId} → ${parsed.data.triggeredActionId}`,
        intentId: intent.id,
      },
    ],
  };
}
