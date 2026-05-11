import { z } from 'zod';
import { ConditionDurationSchema, ConditionSourceSchema, ConditionTypeSchema } from '../condition';

// Slice 5: imposes a condition on a participant. The reducer enforces canon
// stacking rules (rules-canon.md §3.4) — same {type, sourceId} is idempotent,
// Frightened/Taunted from a different source displaces older instances of
// the same type.
export const SetConditionPayloadSchema = z.object({
  targetId: z.string().min(1),
  condition: ConditionTypeSchema,
  source: ConditionSourceSchema,
  duration: ConditionDurationSchema,
});
export type SetConditionPayload = z.infer<typeof SetConditionPayloadSchema>;
