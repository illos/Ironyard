import { z } from 'zod';

// Slice 7: pay 1 recovery; emit a derived `ApplyHeal { amount: recoveryValue }`
// to restore HP (canon §2.13 Recoveries). The recoveryValue lives on the
// participant; the dispatcher / character sheet sets it on character creation.
export const SpendRecoveryPayloadSchema = z.object({
  participantId: z.string().min(1),
});
export type SpendRecoveryPayload = z.infer<typeof SpendRecoveryPayloadSchema>;
