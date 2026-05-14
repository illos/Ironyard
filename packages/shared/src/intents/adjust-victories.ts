import { z } from 'zod';

// Phase 5 Pass 2a — director-only intent that adjusts every PC participant's
// `victories` by the given signed delta. The post-state is clamped to ≥ 0 by
// the reducer. Applied collectively to the whole party (canon § 8.1: when
// the party earns a victory, every member gains one).
export const AdjustVictoriesPayloadSchema = z.object({
  delta: z.number().int(),
});
export type AdjustVictoriesPayload = z.infer<typeof AdjustVictoriesPayloadSchema>;
