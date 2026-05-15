import { z } from 'zod';

/**
 * Phase 5 Pass 2b1 — Toggle the `surprised` flag on a single participant
 * (canon § 4.1). Director-only; rejected once round > 1 (surprise ends
 * automatically at the end of round 1 per canon, swept by `applyEndRound`).
 */
export const MarkSurprisedPayloadSchema = z
  .object({
    participantId: z.string().min(1),
    surprised: z.boolean(),
  })
  .strict();
export type MarkSurprisedPayload = z.infer<typeof MarkSurprisedPayloadSchema>;
