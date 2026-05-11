import { z } from 'zod';
import { ResourceRefSchema } from '../resource';

// Slice 7: grant heroic resource (or extras pool) to a participant. `amount`
// is a signed int — negative values move toward / past the floor and are
// rejected if they would breach `floor` (rules-canon §5.3 / §5.4). Use
// `SpendResource` for the positive-cost case (cleaner intent semantics in the
// log).
export const GainResourcePayloadSchema = z.object({
  participantId: z.string().min(1),
  name: ResourceRefSchema,
  amount: z.number().int(),
});
export type GainResourcePayload = z.infer<typeof GainResourcePayloadSchema>;
