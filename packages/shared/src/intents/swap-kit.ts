import { z } from 'zod';

export const SwapKitPayloadSchema = z.object({
  characterId: z.string().min(1),
  newKitId: z.string().min(1),
  ownerId: z.string().min(1), // DO stamps from D1 before reducer runs
});
export type SwapKitPayload = z.infer<typeof SwapKitPayloadSchema>;
