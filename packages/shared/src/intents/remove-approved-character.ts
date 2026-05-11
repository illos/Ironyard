import { z } from 'zod';

export const RemoveApprovedCharacterPayloadSchema = z.object({
  characterId: z.string().min(1),
});
export type RemoveApprovedCharacterPayload = z.infer<typeof RemoveApprovedCharacterPayloadSchema>;
