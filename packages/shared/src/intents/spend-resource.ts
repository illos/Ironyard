import { z } from 'zod';
import { ResourceRefSchema } from '../resource';

// Slice 7: spend heroic resource (or extras pool). `amount` is a positive int.
// Reducer rejects with `floor_breach` when `value - amount < floor`. Talent's
// Clarity is the lone resource that may legally go below 0 (canon §5.3 — floor
// is `-(1 + Reason)`, set at participant-construction time). `reason` is
// free-form for the log (e.g. "Clarity Shard — 5-cost").
export const SpendResourcePayloadSchema = z.object({
  participantId: z.string().min(1),
  name: ResourceRefSchema,
  amount: z.number().int().positive(),
  reason: z.string().max(200).optional(),
});
export type SpendResourcePayload = z.infer<typeof SpendResourcePayloadSchema>;
