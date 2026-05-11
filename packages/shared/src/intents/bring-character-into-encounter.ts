import { z } from 'zod';

export const BringCharacterIntoEncounterPayloadSchema = z.object({
  characterId: z.string().min(1),
  ownerId: z.string().min(1), // DO stamps from D1 characters.owner_id
  position: z.number().int().min(0).optional(),
});
export type BringCharacterIntoEncounterPayload = z.infer<
  typeof BringCharacterIntoEncounterPayloadSchema
>;
