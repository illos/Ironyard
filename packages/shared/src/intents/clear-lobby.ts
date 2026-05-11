import { z } from 'zod';

export const ClearLobbyPayloadSchema = z.object({});
export type ClearLobbyPayload = z.infer<typeof ClearLobbyPayloadSchema>;
