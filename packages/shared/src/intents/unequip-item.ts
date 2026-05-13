import { z } from 'zod';

// Slice 1: opposite of EquipItem. Toggles equipped → false.
export const UnequipItemPayloadSchema = z.object({
  characterId: z.string().min(1),
  inventoryEntryId: z.string().min(1),
});
export type UnequipItemPayload = z.infer<typeof UnequipItemPayloadSchema>;
