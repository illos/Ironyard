import { z } from 'zod';

// Active-ability instances live on a Participant when a maneuver / trait /
// signature ability with no auto-applied mechanics is toggled on. The engine
// tracks expiration for visibility; rules adjudication remains at the table
// (e.g. Human "Detect the Supernatural" — the engine doesn't know what counts
// as "supernatural", but the chip on the sheet tells the director the player
// can see them).
//
// Resolves rule-questions Q17 Bucket A.

export const ActiveAbilitySourceSchema = z.enum(['ancestry', 'class', 'item', 'kit']);
export type ActiveAbilitySource = z.infer<typeof ActiveAbilitySourceSchema>;

export const ActiveAbilityExpirySchema = z.discriminatedUnion('kind', [
  // Drains when the holder ends their turn (the natural shape for self-targeting
  // "until end of your next turn" maneuvers — activate on turn N, drains at the
  // end of turn N+1 when the holder explicitly ends it, or at end of N if
  // dispatched mid-turn after the next-turn semantics aren't worth modelling).
  z.object({ kind: z.literal('EoT') }),
  z.object({ kind: z.literal('end_of_encounter') }),
]);
export type ActiveAbilityExpiry = z.infer<typeof ActiveAbilityExpirySchema>;

export const ActiveAbilityInstanceSchema = z.object({
  abilityId: z.string().min(1),
  source: ActiveAbilitySourceSchema,
  expiresAt: ActiveAbilityExpirySchema,
  appliedAtSeq: z.number().int().nonnegative(),
});
export type ActiveAbilityInstance = z.infer<typeof ActiveAbilityInstanceSchema>;
