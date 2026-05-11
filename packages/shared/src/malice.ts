import { z } from 'zod';

// Director's Malice — encounter-scoped pool (rules-canon §5.5). May be
// negative; engine permits this per canon ("Negative Malice" sub-section).
// `lastMaliciousStrikeRound` reserved for the canon §5.5 Malicious Strike
// "not two rounds in a row" rule; slice 7 only initializes it to null.
export const MaliceStateSchema = z.object({
  current: z.number().int(),
  lastMaliciousStrikeRound: z.number().int().nullable().default(null),
});
export type MaliceState = z.infer<typeof MaliceStateSchema>;
