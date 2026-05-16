import { z } from 'zod';

// 10th-level Psion participant flags. clarityDamageOptOutThisTurn skips the
// EoT clarity damage dispatch for one turn. Reset at EndTurn.
export const PsionFlagsSchema = z
  .object({
    clarityDamageOptOutThisTurn: z.boolean().default(false),
  })
  .strict();
export type PsionFlags = z.infer<typeof PsionFlagsSchema>;

export function defaultPsionFlags(): PsionFlags {
  return { clarityDamageOptOutThisTurn: false };
}
