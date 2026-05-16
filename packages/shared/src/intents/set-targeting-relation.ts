import { z } from 'zod';
import { TargetingRelationKindSchema } from '../targeting-relations';

// Pass 3 Slice 2b — mutate a source participant's targetingRelations[kind]
// list. `present: true` adds targetId if absent (idempotent); `present:
// false` removes if present (idempotent). Trust: actor.userId ===
// source.ownerId OR active director. The reducer enforces uniqueness in
// the array (schema accepts duplicates per the slice-2a maintainedAbilities
// precedent).
//
// This intent is NOT in SERVER_ONLY_INTENTS — players manage their own
// relations directly. Director can edit anyone's via the active-director
// permission.
export const SetTargetingRelationPayloadSchema = z
  .object({
    sourceId: z.string().min(1),
    relationKind: TargetingRelationKindSchema,
    targetId: z.string().min(1),
    present: z.boolean(),
  })
  .strict();
export type SetTargetingRelationPayload = z.infer<typeof SetTargetingRelationPayloadSchema>;
