import { z } from 'zod';

export const DenyCharacterPayloadSchema = z.object({
  characterId: z.string().min(1),
});
export type DenyCharacterPayload = z.infer<typeof DenyCharacterPayloadSchema>;
