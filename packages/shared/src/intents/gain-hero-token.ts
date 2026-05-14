import { z } from 'zod';

// Director awards bonus hero tokens mid-session (e.g. clever play, late arrival).
// Pool lives on CampaignState.heroTokens. Requires an active session (reducer
// gate); schema enforces shape only.
export const GainHeroTokenPayloadSchema = z.object({
  amount: z.number().int().min(1),
});
export type GainHeroTokenPayload = z.infer<typeof GainHeroTokenPayloadSchema>;
