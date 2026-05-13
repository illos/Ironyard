import { PushItemPayloadSchema } from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';

// Ratification intent (Epic 2C Slice 3). Director pushes an item into a
// target player's inventory. The stamper reads D1 and stamps:
//   - `isDirectorPermitted` from campaign_memberships.is_director (owner is
//     always permitted in the membership-row sense via stamping)
//   - `targetCharacterExists` from characters.id presence
//   - `itemExists` from the static items catalog
// The reducer is the authority that rejects when any flag is false. The
// post-reducer side-effect appends or stacks an InventoryEntry on the
// target character blob. Like applyEquipItem this reducer does NOT mutate
// `state.participants` — inventory lives on characters.data, not on the
// participant snapshot.
export function applyPushItem(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = PushItemPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `PushItem rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }

  const {
    targetCharacterId,
    itemId,
    quantity,
    isDirectorPermitted,
    itemExists,
    targetCharacterExists,
  } = parsed.data;

  if (!isDirectorPermitted) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: 'PushItem rejected: actor lacks director permission',
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'not_authorized', message: 'PushItem requires director permission' }],
    };
  }

  if (!targetCharacterExists) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `PushItem rejected: target character ${targetCharacterId} not found`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'character_missing', message: 'target character not found' }],
    };
  }

  if (!itemExists) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `PushItem rejected: item ${itemId} not in catalog`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'item_missing', message: 'item not in catalog' }],
    };
  }

  return {
    state: { ...state, seq: state.seq + 1 },
    derived: [],
    log: [
      {
        kind: 'info',
        text: `director pushed ${quantity}× ${itemId} to character ${targetCharacterId}`,
        intentId: intent.id,
      },
    ],
  };
}
