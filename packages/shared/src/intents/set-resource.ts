import { z } from 'zod';
import { ResourceRefSchema } from '../resource';

// Slice 7: manual override path. Ignores floor and ceiling — Director can put
// the resource at any integer. If the participant doesn't yet have an instance
// for this name, `initialize` provides the construction parameters (max,
// floor). Talent dispatchers pass `floor: -(1 + Reason)` here.
export const SetResourcePayloadSchema = z.object({
  participantId: z.string().min(1),
  name: ResourceRefSchema,
  value: z.number().int(),
  initialize: z
    .object({
      max: z.number().int().nonnegative().optional(),
      floor: z.number().int().optional(),
    })
    .optional(),
});
export type SetResourcePayload = z.infer<typeof SetResourcePayloadSchema>;
