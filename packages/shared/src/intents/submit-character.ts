import { z } from 'zod';

// Client sends: { characterId }
// DO stamps: { ownsCharacter, isCampaignMember } from D1 lookups.
export const SubmitCharacterPayloadSchema = z.object({
  characterId: z.string().min(1),
  ownsCharacter: z.boolean(), // stamped by DO
  isCampaignMember: z.boolean(), // stamped by DO
});
export type SubmitCharacterPayload = z.infer<typeof SubmitCharacterPayloadSchema>;
