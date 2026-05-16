import { z } from 'zod';

// Server-only intent. Derived from ClaimOpenAction { kind: 'troubadour-auto-revive' }.
// Restores the Troubadour to 1 stamina, resets drama to 0, clears the
// posthumousDramaEligible flag, recomputes stamina state.
export const TroubadourAutoRevivePayloadSchema = z
  .object({
    participantId: z.string().min(1),
  })
  .strict();
export type TroubadourAutoRevivePayload = z.infer<typeof TroubadourAutoRevivePayloadSchema>;
