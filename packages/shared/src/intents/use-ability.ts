import { z } from 'zod';
import { ActiveAbilityExpirySchema, ActiveAbilitySourceSchema } from '../active-ability';

// UseAbility toggles on a narrative-only ability (no auto-applied mechanics)
// as an active tag on the participant. The engine tracks expiry and renders
// the tag on the sheet; the table adjudicates the effect.
//
// Power-rolling abilities use RollPower; consumables use UseConsumable. This
// intent is the third dispatch path, specifically for traits / maneuvers
// without structured effect data — resolves rule-questions Q17 Bucket A.
export const UseAbilityPayloadSchema = z.object({
  participantId: z.string().min(1),
  abilityId: z.string().min(1),
  source: ActiveAbilitySourceSchema,
  // Dispatcher-supplied. Most ancestry signature traits with a duration use
  // 'EoT'; long-running buffs or class features would use 'end_of_encounter'.
  duration: ActiveAbilityExpirySchema,
});
export type UseAbilityPayload = z.infer<typeof UseAbilityPayloadSchema>;
