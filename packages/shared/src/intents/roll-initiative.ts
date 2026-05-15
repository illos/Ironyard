import { z } from 'zod';

/**
 * Phase 5 Pass 2b1 — Roll initiative for zipper alternation (canon § 4.1).
 *
 * The dispatcher handles all client-side decision-making (d10 roll →
 * chooser UI → manual override) and sends one final intent carrying the
 * chosen winning side. The d10 value is informational (logged only) so
 * the table can audit; engine logic never reads it.
 *
 * Trust: anyone at the table may dispatch. The reducer is idempotent — once
 * `encounter.firstSide` is set, subsequent RollInitiative intents reject.
 */
export const RollInitiativePayloadSchema = z
  .object({
    winner: z.enum(['heroes', 'foes']),
    surprised: z.array(z.string().min(1)).default([]),
    rolledD10: z.number().int().min(1).max(10).optional(),
  })
  .strict();
export type RollInitiativePayload = z.infer<typeof RollInitiativePayloadSchema>;
