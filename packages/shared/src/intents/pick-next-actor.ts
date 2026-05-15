import { z } from 'zod';

/**
 * Phase 5 Pass 2b1 — Pick the next acting creature in the zipper.
 *
 * Trust:
 *  - Hero pick: participant's owner (own PC) OR active director (override).
 *  - Foe pick: active director only.
 *
 * The reducer validates that `participantId` is on `currentPickingSide` and
 * not in `actedThisRound`, then emits a derived `StartTurn` (threading the
 * optional `rolls.d3` through for d3-gain heroic-resource classes).
 */
export const PickNextActorPayloadSchema = z
  .object({
    participantId: z.string().min(1),
    rolls: z.object({ d3: z.number().int().min(1).max(3) }).optional(),
  })
  .strict();
export type PickNextActorPayload = z.infer<typeof PickNextActorPayloadSchema>;
