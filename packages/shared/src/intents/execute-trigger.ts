import { z } from 'zod';
import { TriggerEventDescSchema } from '../trigger-event';

// Server-only derived intent — emitted by applyResolveTriggerOrder for each
// candidate in the chosen order. Thin wrapper around the actual triggered
// action's effect dispatch (typically RollPower).
export const ExecuteTriggerPayloadSchema = z
  .object({
    participantId: z.string().min(1),
    triggeredActionId: z.string().min(1),
    triggerEvent: TriggerEventDescSchema,
  })
  .strict();
export type ExecuteTriggerPayload = z.infer<typeof ExecuteTriggerPayloadSchema>;
