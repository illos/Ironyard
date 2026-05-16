import { z } from 'zod';

export const ResolveTriggerOrderPayloadSchema = z
  .object({
    pendingTriggerSetId: z.string().min(1),
    order: z.array(z.string().min(1)).min(1),
  })
  .strict();
export type ResolveTriggerOrderPayload = z.infer<typeof ResolveTriggerOrderPayloadSchema>;
