import { z } from 'zod';

export const JoinSessionPayloadSchema = z.object({
  userId: z.string().min(1),
  displayName: z.string().min(1),
});
export type JoinSessionPayload = z.infer<typeof JoinSessionPayloadSchema>;
