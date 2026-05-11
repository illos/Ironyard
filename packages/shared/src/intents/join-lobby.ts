import { z } from 'zod';

export const JoinLobbyPayloadSchema = z.object({
  userId: z.string().min(1),
  displayName: z.string().min(1),
});
export type JoinLobbyPayload = z.infer<typeof JoinLobbyPayloadSchema>;
