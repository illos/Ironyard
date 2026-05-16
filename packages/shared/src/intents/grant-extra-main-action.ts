import { z } from 'zod';

// Server-only derived intent — emitted by applyRollPower on nat 19/20 with a
// main-action ability. Sets participant.turnActionUsage.main = false so the
// actor gets an extra main action this turn (canon §4.10).
export const GrantExtraMainActionPayloadSchema = z
  .object({
    participantId: z.string().min(1),
  })
  .strict();
export type GrantExtraMainActionPayload = z.infer<typeof GrantExtraMainActionPayloadSchema>;
