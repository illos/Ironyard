import { z } from 'zod';
import { ConditionApplicationOutcomeSchema } from '../condition';
import { DamageTypeSchema } from '../damage';

// Extracted from monster.ts to break the circular dependency introduced when
// ability.ts was split out (ability.ts needs PowerRollSchema; monster.ts
// re-exports AbilitySchema from ability.ts).

// Per-tier outcome. `raw` is always preserved verbatim — UI shows it as the
// source-of-truth fallback. `damage` + `damageType` are structured when the
// parser could extract a leading damage clause; `effect` captures the rest
// (push, slide, save targets, condition mentions) as free text.
export const TierOutcomeSchema = z.object({
  raw: z.string(),
  damage: z.number().int().nonnegative().nullable(),
  damageType: DamageTypeSchema.optional(),
  effect: z.string().optional(),
  // Conditions the parser extracted from the effect text. `scope: 'target'`
  // entries are auto-dispatched by the engine; `scope: 'other'` (multi-target
  // / unusual qualifier) are surfaced visually but stay manual. See
  // condition.ts for the schema.
  conditions: z.array(ConditionApplicationOutcomeSchema).default([]),
});
export type TierOutcome = z.infer<typeof TierOutcomeSchema>;

// Power-roll ladder. Each tier carries both the raw markdown string AND a
// structured parse — the combat UI feeds the structured ladder to RollPower
// while still rendering the raw text so the director can see exactly what the
// source said.
export const PowerRollSchema = z.object({
  bonus: z.string().min(1), // raw "+2", "+5" — the characteristic add
  tier1: TierOutcomeSchema, // "≤11" outcome
  tier2: TierOutcomeSchema, // "12-16" outcome
  tier3: TierOutcomeSchema, // "17+" outcome
});
export type PowerRoll = z.infer<typeof PowerRollSchema>;

// Ability cost / variant — the parenthetical after the name (e.g.
// "Signature Ability", "2 Malice", "Villain Action 1"). Free text for now.
export const ABILITY_TYPES = [
  'action',
  'maneuver',
  'triggered',
  'free-triggered',
  'villain',
  'trait',
] as const;
export const AbilityTypeSchema = z.enum(ABILITY_TYPES);
export type AbilityType = z.infer<typeof AbilityTypeSchema>;
