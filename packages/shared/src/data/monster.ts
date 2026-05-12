import { z } from 'zod';
import { CharacteristicsSchema } from '../characteristic';
import { TypedResistanceSchema } from '../damage';
import { AbilitySchema } from './ability';

// Phase 1 slice 7 (monster ingest extension): extended Monster shape with
// stamina, EV, immunities/weaknesses, characteristics, movement, abilities.
// See docs/data-pipeline.md for the data contract.
//
// Level range widened from the spec's 1..10 — the source data includes
// level 0 templates (Noncombatant) and level 11+ bosses (Ajax the Invincible).
// 0..20 covers what's in the bestiary today with headroom for future content.

// Re-exports from power-roll.ts and ability.ts for backward compatibility.
// All existing consumers that import from './data/monster' keep working.
export {
  ABILITY_TYPES,
  AbilityTypeSchema,
  PowerRollSchema,
  TierOutcomeSchema,
} from './power-roll';
export type { AbilityType, PowerRoll, TierOutcome } from './power-roll';

export { AbilitySchema } from './ability';
export type { Ability, AbilityFile } from './ability';

// Movement modes seen in SteelCompendium statblocks. "walk" is implicit and
// not included in the table cell; we add it when no other mode is listed.
export const MOVEMENT_MODES = [
  'walk',
  'fly',
  'hover',
  'climb',
  'swim',
  'burrow',
  'teleport',
] as const;
export const MovementModeSchema = z.enum(MOVEMENT_MODES);
export type MovementMode = z.infer<typeof MovementModeSchema>;

export const EvSchema = z.object({
  ev: z.number().int().nonnegative(),
  eliteEv: z.number().int().nonnegative().optional(),
  note: z.string().optional(), // e.g. "for 4 minions"
});
export type Ev = z.infer<typeof EvSchema>;

export const StaminaSchema = z.object({
  base: z.number().int().nonnegative(),
  withCaptain: z.number().int().nonnegative().optional(),
});
export type Stamina = z.infer<typeof StaminaSchema>;

export const MonsterSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  level: z.number().int().min(0).max(20),
  roles: z.array(z.string()).default([]),
  ancestry: z.array(z.string()).default([]),
  ev: EvSchema,
  stamina: StaminaSchema,
  immunities: z.array(TypedResistanceSchema).default([]),
  weaknesses: z.array(TypedResistanceSchema).default([]),
  speed: z.number().int().nonnegative(),
  movement: z.array(MovementModeSchema).default([]),
  size: z.string().min(1),
  stability: z.number().int(),
  freeStrike: z.number().int().nonnegative(),
  withCaptain: z.string().optional(),
  // Narrative-only immunity/weakness strings that don't fit TypedResistance
  // (e.g. "Cold, fire, or lightning" — DM choice at start of combat).
  immunityNote: z.string().optional(),
  weaknessNote: z.string().optional(),
  characteristics: CharacteristicsSchema,
  abilities: z.array(AbilitySchema).default([]),
});
export type Monster = z.infer<typeof MonsterSchema>;

export const MonsterFileSchema = z.object({
  version: z.string().min(1), // SteelCompendium data-md pin
  generatedAt: z.number().int().nonnegative(),
  count: z.number().int().nonnegative(),
  monsters: z.array(MonsterSchema),
  // Coverage telemetry per build — surfaced in UI footer and used by CI to
  // catch regressions in parser quality over time.
  coverage: z
    .object({
      total: z.number().int().nonnegative(),
      withStamina: z.number().int().nonnegative(),
      withEv: z.number().int().nonnegative(),
      withCharacteristics: z.number().int().nonnegative(),
      withAbilities: z.number().int().nonnegative(),
      withAnyImmunity: z.number().int().nonnegative(),
      withAnyWeakness: z.number().int().nonnegative(),
      totalAbilityBlocks: z.number().int().nonnegative(),
      parsedAbilityBlocks: z.number().int().nonnegative(),
      // Per-tier damage parse coverage. `totalTierOutcomes` is 3× the number
      // of abilities with a powerRoll; `tiersWithDamage` is how many of those
      // tiers had a parseable leading "N (type) damage" clause. The rest are
      // effect-only (movement, conditions, healing) and are not failures.
      totalTierOutcomes: z.number().int().nonnegative().optional(),
      tiersWithDamage: z.number().int().nonnegative().optional(),
      tiersWithConditions: z.number().int().nonnegative().optional(),
    })
    .optional(),
});
export type MonsterFile = z.infer<typeof MonsterFileSchema>;
