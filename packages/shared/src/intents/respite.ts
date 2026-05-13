import { z } from 'zod';

// Slice 4 (Epic 2C): Respite expansion. The payload carries two
// dispatcher-supplied fields and one stamper-stamped field:
//   - `wyrmplateChoices`: per-character damage-type picks the player
//     made at this respite (Dragon Knight ancestry). Keyed by
//     characterId, value is the chosen damage type slug. Empty when
//     no Dragon Knight player chose to re-pick.
//   - `safelyCarryWarnings`: stamped server-side at dispatch time
//     from D1 inventory state — one entry per PC carrying > 3
//     leveled treasures. The reducer logs these; the consequence
//     intents (RollPower / Unequip) are dispatched separately. See
//     canon § 10.17.
const SafelyCarryWarningSchema = z.object({
  characterId: z.string().min(1),
  characterName: z.string().min(1).optional(),
  count: z.number().int().min(4),
  items: z.array(z.string().min(1)),
});
export type SafelyCarryWarning = z.infer<typeof SafelyCarryWarningSchema>;

export const RespitePayloadSchema = z.object({
  wyrmplateChoices: z.record(z.string().min(1), z.string().min(1)).default({}),
  safelyCarryWarnings: z.array(SafelyCarryWarningSchema).default([]),
});
export type RespitePayload = z.infer<typeof RespitePayloadSchema>;
