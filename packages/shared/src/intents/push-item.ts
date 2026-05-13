import { z } from 'zod';

// Slice 3 (Epic 2C): director pushes an item into a player's inventory.
// Ratification intent. Director-only — stamper sets `isDirectorPermitted`
// from the campaign membership row's `is_director` flag (owner is always
// director-permitted). Stamper also checks the target character row exists
// in D1 and the itemId resolves in the static items catalog. The reducer
// is the authority that rejects when any of these flags is false. The
// post-reducer side-effect appends (or stacks onto) an InventoryEntry on
// the target character blob.
//
// Stamped flags default to false so an unstamped (test-shaped) payload
// safe-parses successfully; the reducer rejects on the false branch.
export const PushItemPayloadSchema = z.object({
  targetCharacterId: z.string().min(1),
  itemId: z.string().min(1),
  quantity: z.number().int().min(1).max(99).default(1),
  // Stamped by the LobbyDO.
  isDirectorPermitted: z.boolean().default(false),
  itemExists: z.boolean().default(false),
  targetCharacterExists: z.boolean().default(false),
});
export type PushItemPayload = z.infer<typeof PushItemPayloadSchema>;
