import { z } from 'zod';

// Player or director spends from the hero token pool. Three reason paths:
//   surge_burst    — amount 1, derives GainResource { name: 'surges', amount: 2 }
//   regain_stamina — amount 2, derives ApplyHeal { amount: recoveryValue }
//   narrative      — any amount >= 1, no derived intent (table narrates)
// Reducer validates (reason, amount) coherence; schema enforces base shape.
export const SpendHeroTokenPayloadSchema = z.object({
  amount: z.number().int().min(1),
  reason: z.enum(['surge_burst', 'regain_stamina', 'narrative']),
  participantId: z.string().min(1),
});
export type SpendHeroTokenPayload = z.infer<typeof SpendHeroTokenPayloadSchema>;
