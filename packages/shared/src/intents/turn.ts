import { z } from 'zod';

export const StartRoundPayloadSchema = z.object({}).strict();
export type StartRoundPayload = z.infer<typeof StartRoundPayloadSchema>;

export const EndRoundPayloadSchema = z.object({}).strict();
export type EndRoundPayload = z.infer<typeof EndRoundPayloadSchema>;

export const StartTurnPayloadSchema = z.object({
  participantId: z.string().min(1),
  rolls: z.object({
    d3: z.number().int().min(1).max(3),
    // Slice 2a: Conduit Pray-to-the-Gods OA claim. When `prayToTheGods` is
    // true, the reducer uses `prayD3` (instead of the standard `d3`) for
    // piety gain (1→+1, 2→+1, 3→+2), and on a `prayD3 === 1` outcome
    // applies `prayDamage.d6` + level psychic damage with damage-reduction
    // bypassed.
    prayD3: z.number().int().min(1).max(3).optional(),
    prayDamage: z.object({ d6: z.number().int().min(1).max(6) }).optional(),
  }).optional(),
  // Slice 2a: top-level toggle indicating this StartTurn is the Conduit
  // Pray-to-the-Gods OA-claim StartTurn rather than the standard piety gain.
  prayToTheGods: z.boolean().optional(),
});
export type StartTurnPayload = z.infer<typeof StartTurnPayloadSchema>;

// Slice 6: optional `saveRolls` carries one d10 per `save_ends` condition on the
// ending creature, ordered by the condition's `appliedAtSeq`. The engine emits
// one derived `RollResistance` per save when this is present. Missing or
// wrong-length ⇒ the engine logs `manual_override_required` per save and skips
// the auto-fire so the table can roll manually (canon-gate idiom).
export const EndTurnPayloadSchema = z
  .object({
    saveRolls: z.array(z.number().int().min(1).max(10)).optional(),
  })
  .strict();
export type EndTurnPayload = z.infer<typeof EndTurnPayloadSchema>;

