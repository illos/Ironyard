import { z } from 'zod';

// Slice 1 (Epic 2C): opposite of EquipItem — toggles equipped → false.
// Ratification intent — the stamper reads D1 and stamps the auth/lookup
// flags below; the reducer validates them and logs; the side-effect
// does the D1 write (UPDATE characters SET data = ? WHERE id = ?).
// Mirrors EquipItemPayloadSchema exactly.
//
// Stamped flags default to false so an unstamped (test-shaped) payload
// safe-parses successfully; the reducer is the authority that rejects
// when a flag is false.
export const UnequipItemPayloadSchema = z.object({
  characterId: z.string().min(1),
  inventoryEntryId: z.string().min(1),
  // Stamped by the LobbyDO before the reducer runs.
  ownsCharacter: z.boolean().default(false),
  inventoryEntryExists: z.boolean().default(false),
});
export type UnequipItemPayload = z.infer<typeof UnequipItemPayloadSchema>;
