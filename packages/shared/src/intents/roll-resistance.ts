import { z } from 'zod';

// Slice 5: the saving throw that ends a `save_ends` condition (rules-canon.md
// §3.3, Q9). NOT a power roll — a single d10, no characteristic, no edges/banes.
// On a result >= 6 the matching condition is removed. The client pre-rolls the
// d10 and ships it in the payload, per the dispatcher-pre-rolls trust model.
export const RollResistancePayloadSchema = z.object({
  characterId: z.string().min(1),
  effectId: z.string().min(1),
  rolls: z.object({
    d10: z.number().int().min(1).max(10),
  }),
});
export type RollResistancePayload = z.infer<typeof RollResistancePayloadSchema>;
