import { z } from 'zod';

export const ApproveCharacterPayloadSchema = z.object({
  characterId: z.string().min(1),
});
export type ApproveCharacterPayload = z.infer<typeof ApproveCharacterPayloadSchema>;
