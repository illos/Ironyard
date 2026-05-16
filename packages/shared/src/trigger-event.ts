import { z } from 'zod';
import { DamageTypeSchema } from './damage';

// Description of the event that fires triggered actions. Used by
// PendingTriggerSet (cross-side Q10 resolution) and by slice 2's class-δ
// triggers when they subscribe to the same event stream. Open discriminated
// union — future event kinds add as additional variants.
export const TriggerEventDescSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('damage-applied'),
    targetId: z.string().min(1),
    attackerId: z.string().nullable(),
    amount: z.number().int().min(0),
    type: DamageTypeSchema,
  }),
  z.object({
    kind: z.literal('stamina-transition'),
    participantId: z.string().min(1),
    from: z.enum([
      'healthy',
      'winded',
      'dying',
      'dead',
      'unconscious',
      'inert',
      'rubble',
      'doomed',
    ]),
    to: z.enum(['healthy', 'winded', 'dying', 'dead', 'unconscious', 'inert', 'rubble', 'doomed']),
  }),
  z.object({
    kind: z.literal('forced-movement'),
    targetId: z.string().min(1),
    actorId: z.string().nullable(),
    distance: z.number().int(),
  }),
]);
export type TriggerEventDesc = z.infer<typeof TriggerEventDescSchema>;
