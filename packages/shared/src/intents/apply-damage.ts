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
});
export type ApplyDamagePayload = z.infer<typeof ApplyDamagePayloadSchema>;
