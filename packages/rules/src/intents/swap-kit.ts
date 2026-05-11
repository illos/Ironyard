import { SwapKitPayloadSchema } from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';

export function applySwapKit(state: CampaignState, intent: StampedIntent): IntentResult {
  let payload: ReturnType<typeof SwapKitPayloadSchema.parse>;
  try {
    payload = SwapKitPayloadSchema.parse(intent.payload);
  } catch {
    return {
      state,
      derived: [],
      log: [],
      errors: [{ code: 'invalid_payload', message: 'SwapKit payload is invalid' }],
    };
  }

  // Reject mid-encounter.
  if (state.encounter !== null) {
    return {
      state,
      derived: [],
      log: [],
      errors: [{ code: 'in_encounter', message: 'cannot swap kits during an active encounter' }],
    };
  }

  // Authority: character owner OR active director.
  // ownerId is stamped by the DO from D1 before the reducer runs.
  const isOwner = payload.ownerId === intent.actor.userId;
  const isActiveDirector = intent.actor.userId === state.activeDirectorId;
  if (!isOwner && !isActiveDirector) {
    return {
      state,
      derived: [],
      log: [],
      errors: [{ code: 'permission_denied', message: 'owner or active director only' }],
    };
  }

  // Side-effect: D1 mutation happens in the DO after the reducer returns.
  // Reducer leaves CampaignState unchanged.
  return {
    state: { ...state, seq: state.seq + 1 },
    derived: [],
    log: [
      {
        kind: 'info',
        text: `SwapKit: ${payload.characterId} → kit ${payload.newKitId}`,
        intentId: intent.id,
      },
    ],
  };
}
