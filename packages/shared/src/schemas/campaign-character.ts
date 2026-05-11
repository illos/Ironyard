import { z } from 'zod';

export const CampaignCharacterStatusSchema = z.enum(['pending', 'approved']);
export type CampaignCharacterStatus = z.infer<typeof CampaignCharacterStatusSchema>;

export const CampaignCharacterSchema = z.object({
  campaignId: z.string().min(1),
  characterId: z.string().min(1),
  status: CampaignCharacterStatusSchema,
  submittedAt: z.number().int().nonnegative(),
  decidedAt: z.number().int().nonnegative().nullable(),
  decidedBy: z.string().min(1).nullable(),
});
export type CampaignCharacter = z.infer<typeof CampaignCharacterSchema>;
