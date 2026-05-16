import { z } from 'zod';

// Phase 2b 2b.15 — Combat.md:673-675 KO wake. Director-triggered intent that
// brings a PC or director-controlled creature out of the Unconscious state.
//   - Hero (`kind: 'pc'`): spends 1 Recovery and regains stamina equal to
//     recovery value. Rejected if `recoveries.current === 0` (canon: hero must
//     finish a respite to wake when out of Recoveries).
//   - Director-controlled creature: gains 1 Stamina.
// Both paths clear the Unconscious + Prone conditions and re-derive state.
// The canonical 1-hour wait is narrative — the engine doesn't enforce time.
export const WakeFromUnconsciousPayloadSchema = z
  .object({
    participantId: z.string().min(1),
  })
  .strict();
export type WakeFromUnconsciousPayload = z.infer<typeof WakeFromUnconsciousPayloadSchema>;
