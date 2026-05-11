import { z } from 'zod';

// Slice 7: restore HP (currentStamina) up to maxStamina. Used as the derived
// intent emitted by SpendRecovery; future heal abilities (Conduit, Troubadour
// rallying cry, etc.) reuse it. A dying-but-alive PC (currentStamina < 0 per
// canon §2.8) climbs from their negative value when healed.
export const ApplyHealPayloadSchema = z.object({
  targetId: z.string().min(1),
  amount: z.number().int().positive(),
});
export type ApplyHealPayload = z.infer<typeof ApplyHealPayloadSchema>;
