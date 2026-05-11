import { JumpBehindScreenPayloadSchema } from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';

export function applyJumpBehindScreen(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = JumpBehindScreenPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `JumpBehindScreen rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }

  const { permitted } = parsed.data;
  const isOwner = intent.actor.userId === state.ownerId;

  // Owner can always jump behind the screen. Anyone else requires the DO to
  // have stamped `permitted: true` (i.e. is_director=1 in D1).
  if (!isOwner && !permitted) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `JumpBehindScreen rejected: ${intent.actor.userId} is not director-permitted`,
          intentId: intent.id,
        },
      ],
      errors: [
        { code: 'not_director_permitted', message: 'user does not have director permission' },
      ],
    };
  }

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      activeDirectorId: intent.actor.userId,
    },
    derived: [],
    log: [
      {
        kind: 'info',
        text: `${intent.actor.userId} is now the active director`,
        intentId: intent.id,
      },
    ],
  };
}
