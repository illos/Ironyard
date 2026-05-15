import { z } from 'zod';
import { DamageTypeSchema } from '../damage';

// ApplyDamage is server-only — emitted by the reducer as a derived intent.
// Clients that dispatch it directly are rejected with 'permission'.
// Pass 3 Slice 1: `intent` field selects between standard damage application
// ('kill') and the §2.9 knock-out interception ('knock-out'). Defaulting to
// 'kill' preserves pre-slice-1 dispatch behavior.
export const ApplyDamagePayloadSchema = z.object({
  targetId: z.string().min(1),
  amount: z.number().int().min(0),
  damageType: DamageTypeSchema,
  sourceIntentId: z.string().min(1),
  intent: z.enum(['kill', 'knock-out']).default('kill'),
  // Pass 3 Slice 2a: when true, the reducer skips immunity reduction and
  // weakness addition ("cannot be reduced" semantics — e.g. Conduit's
  // Pray-on-1 outcome and future sources). Default false preserves
  // pre-slice-2a behavior.
  bypassDamageReduction: z.boolean().optional().default(false),
});
export type ApplyDamagePayload = z.infer<typeof ApplyDamagePayloadSchema>;
