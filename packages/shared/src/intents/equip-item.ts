import { z } from 'zod';

// Slice 1: equip an inventory entry. The reducer toggles
// `character.inventory[N].equipped = true` and triggers re-derivation
// of the character runtime via deriveCharacterRuntime.
export const EquipItemPayloadSchema = z.object({
  characterId: z.string().min(1),
  inventoryEntryId: z.string().min(1),
});
export type EquipItemPayload = z.infer<typeof EquipItemPayloadSchema>;
