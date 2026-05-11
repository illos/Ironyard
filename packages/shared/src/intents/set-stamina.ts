import { z } from 'zod';

// Phase 1 cleanup: client-dispatchable manual HP override. Slice 11 surfaced
// this gap — the director long-presses HP to edit but ApplyDamage is
// server-only, so players (and the director's manual edit UX) had no path to
// the engine. SetStamina is the canonical override. The reducer never emits
// derived intents off this — no Bleeding hooks, no death/dying triggers; it's
// a flat, attributed state mutation that the session log captures with the
// actor's identity.
//
// At least one of `currentStamina` / `maxStamina` must be supplied — the Zod
// refine guards against an empty payload. Combined-value validation
// (currentStamina <= maxStamina, currentStamina >= 0) happens in the reducer
// against the live participant.
export const SetStaminaPayloadSchema = z
  .object({
    participantId: z.string().min(1),
    currentStamina: z.number().int().optional(),
    maxStamina: z.number().int().min(1).optional(),
  })
  .refine((v) => v.currentStamina !== undefined || v.maxStamina !== undefined, {
    message: 'at least one of currentStamina / maxStamina must be supplied',
  });
export type SetStaminaPayload = z.infer<typeof SetStaminaPayloadSchema>;
