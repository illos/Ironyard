import { z } from 'zod';

export const LeaveLobbyPayloadSchema = z.object({
  userId: z.string().min(1),
});
export type LeaveLobbyPayload = z.infer<typeof LeaveLobbyPayloadSchema>;
