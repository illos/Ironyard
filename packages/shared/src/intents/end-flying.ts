import { z } from 'zod';

// Phase 2b Group A+B (slice 6) — EndFlying clears `participant.movementMode`
// (set back to `null`). Three canonical reasons:
//   - 'voluntary': the player elected to land
//   - 'fall': Prone was added while flying (any cause: SetCondition, KO,
//     inert) — the wings ancestry-trigger emits this from
//     `evaluateOnConditionApplied`
//   - 'duration-expired': roundsRemaining hit 0 at EndRound (the wings
//     ancestry-trigger emits this from `evaluateOnEndRound`)
//
// When reason === 'fall' AND the target is not already Prone, the reducer
// also emits a derived SetCondition { type: 'Prone' } so the participant
// ends the cascade with Prone applied. No fall damage — the engine does
// not track altitude (per project_no_movement_tracking memory).
export const EndFlyingPayloadSchema = z.object({
  participantId: z.string().min(1),
  reason: z.enum(['voluntary', 'fall', 'duration-expired']),
});
export type EndFlyingPayload = z.infer<typeof EndFlyingPayloadSchema>;
