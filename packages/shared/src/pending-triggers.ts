import { z } from 'zod';
import { TriggerEventDescSchema } from './trigger-event';

// Pause-state for cross-side trigger resolution (canon §4.10 / Q10). When set,
// the engine has emitted the original event but the triggered-action responses
// are queued waiting for the director to pick an order via ResolveTriggerOrder.
export const PendingTriggerSetSchema = z.object({
  id: z.string().min(1),                  // ulid; matches ResolveTriggerOrder.pendingTriggerSetId
  triggerEvent: TriggerEventDescSchema,
  candidates: z.array(
    z.object({
      participantId: z.string().min(1),
      triggeredActionId: z.string().min(1),
      side: z.enum(['heroes', 'foes']),
    }),
  ),
  order: z.array(z.string().min(1)).nullable().default(null),
});
export type PendingTriggerSet = z.infer<typeof PendingTriggerSetSchema>;
