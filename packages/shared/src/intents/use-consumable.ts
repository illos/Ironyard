import { z } from 'zod';

// Slice 2 (Epic 2C): use a consumable from inventory. Ratification intent —
// the stamper reads D1 to fill in auth/lookup flags + the consumable's
// effectKind + heal amount, the reducer validates and may emit a derived
// ApplyHeal or RollPower intent based on effectKind, the side-effect
// decrements quantity (or removes the entry at 0) in D1.
//
// Stamped flags default to false / 'unknown' / 0 so an unstamped (test-shaped)
// payload safe-parses successfully; the reducer is the authority that rejects
// when a flag is false.
export const UseConsumablePayloadSchema = z.object({
  characterId: z.string().min(1),
  inventoryEntryId: z.string().min(1),
  // Optional — defaults to the character's own participant when omitted.
  targetParticipantId: z.string().min(1).optional(),
  // Stamped by the LobbyDO.
  ownsCharacter: z.boolean().default(false),
  inventoryEntryExists: z.boolean().default(false),
  itemIsConsumable: z.boolean().default(false),
  // Stamped from the item's parsed effectKind. The reducer branches on this
  // to choose the derived intent path.
  effectKind: z
    .enum(['instant', 'duration', 'two-phase', 'attack', 'area', 'unknown'])
    .default('unknown'),
  // For 'instant' branch — stamped from the item-overrides table (Slice 5).
  // Defaults to 0; reducer treats 0 as "manual / unknown heal amount" and falls
  // through to the no-derive log path.
  healAmount: z.number().int().nonnegative().default(0),
});
export type UseConsumablePayload = z.infer<typeof UseConsumablePayloadSchema>;
