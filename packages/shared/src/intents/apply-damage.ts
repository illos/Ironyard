import { z } from 'zod';
import { DamageTypeSchema } from '../damage';

// ApplyDamage is server-only — emitted by the reducer as a derived intent.
// Clients that dispatch it directly are rejected with 'permission'.
export const ApplyDamagePayloadSchema = z.object({
  targetId: z.string().min(1),
  amount: z.number().int().min(0),
  damageType: DamageTypeSchema,
  sourceIntentId: z.string().min(1),
});
export type ApplyDamagePayload = z.infer<typeof ApplyDamagePayloadSchema>;
