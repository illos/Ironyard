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
  talentStrainedOptInRider: z.boolean().optional(), // 10th-level Psion: opt INTO Strained: rider when not yet strained
  talentClarityDamageOptOutThisTurn: z.boolean().optional(), // 10th-level Psion: opt OUT of EoT clarity damage this turn
  startMaintenance: z.boolean().optional(), // Elementalist: also start maintaining this ability
  // Pass 3 Slice 2a — caller (UI dispatcher) supplies the per-turn Essence
  // cost when also dispatching StartMaintenance. Required when
  // `startMaintenance: true`. Slice 2c may replace this with a parsed
  // `Ability.maintenanceCost` extracted from "(Maintain: X)" effect text.
  maintenanceCostPerTurn: z.number().int().min(1).optional(),
  // Pass 3 Slice 2a — caller-supplied ability metadata for class-δ action
  // triggers (Tactician's "ally heroic within 10sq" needs to distinguish
  // signature vs heroic). Defaults applied at consumption time: 'signature' /
  // 'action'. The UI dispatcher reads these from the static `Ability` record
  // (cost === 0 → 'signature', cost in {3,5,7,9} → 'heroic'; `type` → kind).
  abilityCategory: z.enum(['signature', 'heroic']).optional(),
  abilityKind: z.string().optional(),
});
export type UseAbilityPayload = z.infer<typeof UseAbilityPayloadSchema>;
