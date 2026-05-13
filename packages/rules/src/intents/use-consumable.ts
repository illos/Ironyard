import { IntentTypes, UseConsumablePayloadSchema } from '@ironyard/shared';
import type { CampaignState, DerivedIntent, IntentResult, StampedIntent } from '../types';
import { isParticipant } from '../types';

// Ratification intent (Epic 2C Slice 2). The stamper reads D1 and stamps
// `ownsCharacter`, `inventoryEntryExists`, `itemIsConsumable`, the item's
// `effectKind`, and (for instant heals) `healAmount`. The reducer validates
// the flags and — for `effectKind === 'instant'` with `healAmount > 0` —
// emits a derived `ApplyHeal` intent targeting the consumer's own participant
// (or `targetParticipantId` if supplied). The side-effect handler does the
// D1 write (decrement quantity / remove entry at 0) AFTER the reducer commits.
//
// effectKind branches:
//   - 'instant'            : derive ApplyHeal { targetId, amount: healAmount }
//                            when healAmount > 0. targetId defaults to the
//                            consumer's own participant when targetParticipantId
//                            is omitted. When healAmount === 0 we still accept
//                            the intent and decrement quantity — Slice 5 will
//                            populate the heal-amount table; until then instant
//                            consumables fall through to the manual log path.
//   - 'attack' / 'area'    : NOT auto-derived. RollPower payloads need pre-rolled
//                            dice from the dispatcher-pre-rolls model; auto-
//                            dispatch from a derived intent path isn't a clean
//                            fit. Log the raw effect for manual director
//                            application. (Revisit when the dice-roll surface
//                            evolves.)
//   - 'duration' / 'two-phase' / 'unknown' : log raw, no derive.
//
// Like applyEquipItem this reducer does NOT mutate `state.participants` — the
// HP change (when it fires) lands via the derived ApplyHeal pass.
export function applyUseConsumable(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = UseConsumablePayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `UseConsumable rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }

  const {
    characterId,
    inventoryEntryId,
    targetParticipantId,
    ownsCharacter,
    inventoryEntryExists,
    itemIsConsumable,
    effectKind,
    healAmount,
  } = parsed.data;

  if (!ownsCharacter) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `UseConsumable rejected: actor does not own character ${characterId}`,
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
          text: `UseConsumable rejected: inventory entry ${inventoryEntryId} not found`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'inventory_entry_missing', message: 'inventory entry not found' }],
    };
  }

  if (!itemIsConsumable) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: 'UseConsumable rejected: item is not a consumable',
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'not_a_consumable', message: 'item is not a consumable' }],
    };
  }

  // Branch on effectKind to choose the derived-intent path.
  const derived: DerivedIntent[] = [];
  let logText = `used consumable ${inventoryEntryId}`;

  if (effectKind === 'instant' && healAmount > 0) {
    // Default target = the consumer's own PC participant (matched by
    // characterId). Falls back to whatever targetParticipantId was supplied.
    const ownParticipant = state.participants
      .filter(isParticipant)
      .find((p) => p.kind === 'pc' && p.characterId === characterId);
    const targetId = targetParticipantId ?? ownParticipant?.id;
    if (targetId) {
      derived.push({
        actor: intent.actor,
        source: 'auto' as const,
        type: IntentTypes.ApplyHeal,
        payload: { targetId, amount: healAmount },
        causedBy: intent.id,
      });
      logText += ` — heals ${healAmount}`;
    } else {
      logText += ' — instant (no target resolved)';
    }
  } else if (effectKind === 'instant') {
    // healAmount === 0 — Slice 5 will populate the table.
    logText += ' — instant (manual: heal amount not yet configured)';
  } else if (effectKind === 'attack' || effectKind === 'area') {
    logText += ` — ${effectKind} (manual: RollPower pre-roll required)`;
  } else {
    logText += ` — ${effectKind} (manual)`;
  }

  return {
    state: { ...state, seq: state.seq + 1 },
    derived,
    log: [{ kind: 'info', text: logText, intentId: intent.id }],
  };
}
