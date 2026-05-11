import { z } from 'zod';

// Slice 7: spend N surges from the participant's universal pool (canon §5.6).
// Class-specific spend consequences (extra damage, potency boost) live on the
// ability surface (slice 8); this intent just decrements the pool so the log
// is complete.
export const SpendSurgePayloadSchema = z.object({
  participantId: z.string().min(1),
  count: z.number().int().positive(),
});
export type SpendSurgePayload = z.infer<typeof SpendSurgePayloadSchema>;
