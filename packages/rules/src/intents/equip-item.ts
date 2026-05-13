import { EquipItemPayloadSchema } from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';

// Ratification intent (Epic 2C Slice 1). The stamper reads D1 and
// fills in `ownsCharacter` + `inventoryEntryExists`. The reducer
// validates those + the payload shape and logs the action. The
// side-effect handler does the D1 write (UPDATE characters SET data
// = ? WHERE id = ?) AFTER the reducer commits in-memory state.
// Pattern mirrors applySubmitCharacter — campaign state's `participants`
// roster is NOT touched (heroes are not necessarily on the roster when
// they edit their inventory, and inventory does not live on the
// participant snapshot — it lives in characters.data).
export function applyEquipItem(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = EquipItemPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `EquipItem rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }

  const { characterId, inventoryEntryId, ownsCharacter, inventoryEntryExists } = parsed.data;

  if (!ownsCharacter) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `EquipItem rejected: actor does not own character ${characterId}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'not_character_owner', message: 'actor does not own the character' }],
    };
  }

  if (!inventoryEntryExists) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `EquipItem rejected: inventory entry ${inventoryEntryId} not found`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'inventory_entry_missing', message: 'inventory entry not found' }],
    };
  }

  return {
    state: { ...state, seq: state.seq + 1 },
    derived: [],
    log: [
      {
        kind: 'info',
        text: `equipped inventory entry ${inventoryEntryId} on character ${characterId}`,
        intentId: intent.id,
      },
    ],
  };
}
