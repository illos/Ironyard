import { z } from 'zod';
import { ConditionTypeSchema } from '../condition';

// Slice 5: clears a condition from a participant. When `sourceId` is supplied
// only instances from that source are removed; otherwise every instance of the
// named type is removed. Instances flagged `removable: false` (slice-6's dying
// Bleeding) are skipped defensively.
export const RemoveConditionPayloadSchema = z.object({
  targetId: z.string().min(1),
  condition: ConditionTypeSchema,
  sourceId: z.string().min(1).optional(),
});
export type RemoveConditionPayload = z.infer<typeof RemoveConditionPayloadSchema>;
