import { z } from 'zod';

// Slice 7: add to the Director's encounter-scoped Malice counter (canon §5.5).
// `amount` is signed — canon explicitly permits negative Malice. Per-round
// generation (`heroes_alive + round`) is dispatcher-driven via this intent;
// slice 7 does not compute it from `state`.
export const GainMalicePayloadSchema = z.object({
  amount: z.number().int(),
});
export type GainMalicePayload = z.infer<typeof GainMalicePayloadSchema>;
