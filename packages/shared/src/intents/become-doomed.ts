import { z } from 'zod';

export const BecomeDoomedPayloadSchema = z
  .object({
    participantId: z.string().min(1),
    source: z.enum(['hakaan-doomsight', 'manual']),
  })
  .strict();
export type BecomeDoomedPayload = z.infer<typeof BecomeDoomedPayloadSchema>;
