import { z } from 'zod';

// Phase 5 Pass 2a — marks one of the three Turn-flow action slots
// (main / maneuver / move) as used or unused on a specific participant.
// Auto-emitted as a derived intent from RollPower (based on ability.type)
// and dispatched directly by the Turn-flow "Skip" / "Done moving" buttons.
// `used: false` clears the slot (used by the undo path).
export const MarkActionUsedPayloadSchema = z.object({
  participantId: z.string().min(1),
  slot: z.enum(['main', 'maneuver', 'move']),
  used: z.boolean().default(true),
});
export type MarkActionUsedPayload = z.infer<typeof MarkActionUsedPayloadSchema>;
