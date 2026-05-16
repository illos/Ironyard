import { z } from 'zod';

// Phase 2b Group A+B (slice 6) — utility intent used by the wings
// ancestry-trigger's EndRound countdown. Decrement-by-one emits a
// SetMovementMode with the new roundsRemaining; hit-zero emits EndFlying
// { reason: 'duration-expired' } instead (handled by wings.ts).
//
// Trivial reducer: set `participant.movementMode` to the payload value.
// Server-only — never client-dispatched. The MovementMode shape on the
// participant is defined in packages/shared/src/participant.ts:175-181.
export const SetMovementModePayloadSchema = z.object({
  participantId: z.string().min(1),
  movementMode: z
    .object({
      mode: z.enum(['flying', 'shadow']),
      roundsRemaining: z.number().int().min(0),
    })
    .nullable(),
});
export type SetMovementModePayload = z.infer<typeof SetMovementModePayloadSchema>;
