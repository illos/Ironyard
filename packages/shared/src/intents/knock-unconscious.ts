import { z } from 'zod';

export const KnockUnconsciousPayloadSchema = z
  .object({
    targetId: z.string().min(1),
    attackerId: z.string().nullable(),
  })
  .strict();
export type KnockUnconsciousPayload = z.infer<typeof KnockUnconsciousPayloadSchema>;
