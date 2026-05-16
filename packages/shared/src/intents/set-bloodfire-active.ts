import { z } from 'zod';

// Phase 2b Group A+B (slice 8) — utility intent for the Orc Bloodfire Rush
// trigger. The ancestry-trigger fires SetBloodfireActive { active: true } on
// the first delivered damage of a round (latch held until end of round),
// and SetBloodfireActive { active: false } from EndRound's sweep.
//
// Server-only — never client-dispatched. The bloodfireActive flag on
// participant is defined in packages/shared/src/participant.ts.
export const SetBloodfireActivePayloadSchema = z.object({
  participantId: z.string().min(1),
  active: z.boolean(),
});
export type SetBloodfireActivePayload = z.infer<typeof SetBloodfireActivePayloadSchema>;
