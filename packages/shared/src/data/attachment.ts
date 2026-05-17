// CharacterAttachment is the data carrier for any effect that modifies the
// derived CharacterRuntime. Sources (ancestry, kit, item, …) produce these;
// the applier folds them into the runtime. See
// docs/superpowers/specs/2026-05-12-phase-2-epic-2b-attachment-engine-design.md
// for the design rationale.
//
// Both TS types and Zod schemas live here. The TS types are derived from the
// schemas (z.infer) so the schema is the single source of truth — necessary
// for runtime validation when attachments are authored in override files
// (ancestry-traits, items, kits, abilities, titles).

import { z } from 'zod';
import { ConditionTypeSchema } from '../condition';

export const AttachmentSourceSchema = z.object({
  kind: z.enum([
    'ancestry-trait',
    'ancestry-signature',
    'class-feature',
    'level-pick',
    'kit',
    'kit-keyword-bonus',
    'item',
    'title',
  ]),
  id: z.string().min(1),
  requireCanonSlug: z.string().optional(),
});
export type AttachmentSource = z.infer<typeof AttachmentSourceSchema>;

export const AttachmentConditionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('kit-has-keyword'), keyword: z.string().min(1) }),
  z.object({ kind: z.literal('item-equipped') }),
]);
export type AttachmentCondition = z.infer<typeof AttachmentConditionSchema>;

export const StatModFieldSchema = z.enum([
  'maxStamina',
  'recoveriesMax',
  'recoveryValue',
  'speed',
  'stability',
]);
export type StatModField = z.infer<typeof StatModFieldSchema>;

export const StatReplaceFieldSchema = z.enum(['size']);
export type StatReplaceField = z.infer<typeof StatReplaceFieldSchema>;

// Phase 2b Group A+B: immunity.value gains a `level-plus` variant for traits
// like Polder Corruption Immunity (value = level + offset). Backward-compatible
// with the existing `number | 'level'` shape — inner union inside the existing
// `immunity` discriminator (not a separate kind).
const ImmunityValueSchema = z.union([
  z.number().int().nonnegative(),
  z.literal('level'),
  z.object({
    kind: z.literal('level-plus'),
    offset: z.number().int().nonnegative(),
  }),
]);

export const AttachmentEffectSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('stat-mod'),
    stat: StatModFieldSchema,
    delta: z.number().int(),
  }),
  // Phase 2b Group A+B: per-echelon stat-mod (Spark Off Your Skin, Wyrmplate,
  // Psychic Scar). Applier picks `perEchelon[idx]` where idx is derived from
  // character.level: idx = level >= 10 ? 3 : level >= 7 ? 2 : level >= 4 ? 1 : 0.
  z.object({
    kind: z.literal('stat-mod-echelon'),
    stat: StatModFieldSchema,
    perEchelon: z.tuple([
      z.number().int(),
      z.number().int(),
      z.number().int(),
      z.number().int(),
    ]),
  }),
  z.object({
    kind: z.literal('stat-replace'),
    stat: StatReplaceFieldSchema,
    value: z.union([z.number(), z.string()]),
  }),
  z.object({ kind: z.literal('grant-ability'), abilityId: z.string().min(1) }),
  z.object({ kind: z.literal('grant-skill'), skill: z.string().min(1) }),
  z.object({ kind: z.literal('grant-language'), language: z.string().min(1) }),
  // Phase 2b Group A+B (2b.5): grant-skill-edge — Wode + High Elf Glamors.
  // `skillGroup` is the skill GROUP name (e.g. 'intrigue'); consumed by skill
  // rolls in a later slice (slice 5).
  z.object({ kind: z.literal('grant-skill-edge'), skillGroup: z.string().min(1) }),
  z.object({
    kind: z.literal('immunity'),
    damageKind: z.string().min(1),
    value: ImmunityValueSchema,
  }),
  z.object({
    kind: z.literal('weakness'),
    damageKind: z.string().min(1),
    value: z.union([z.number().int().nonnegative(), z.literal('level')]),
  }),
  // Phase 2b Group A+B (2b.8): condition-immunity — Bloodless, Great Fortitude,
  // Polder Fearless, Orc Nonstop, Memonek Nonstop, High Elf Unstoppable Mind.
  // (Memonek Unphased is the surprised-flag, not a ConditionType, so it gates
  // at MarkSurprised + RollInitiative via purchasedTraits, not here.) Applier
  // appends to runtime.conditionImmunities; SetCondition reducer + stamina
  // side-effects consume via isImmuneToCondition (effective.ts).
  z.object({ kind: z.literal('condition-immunity'), condition: ConditionTypeSchema }),
  z.object({ kind: z.literal('free-strike-damage'), delta: z.number().int() }),
  // Slice 6 / Epic 2C § 10.8: per-tier weapon damage bonus. Emitted by the kit
  // collector (one per appliesTo with non-zero values) and by kit-keyword-gated
  // leveled treasure overrides. The applier sums these into
  // `runtime.weaponDamageBonus.{melee,ranged}`; the RollPower handler reads the
  // tier-N slot at roll time when the ability has Weapon + Melee/Ranged.
  z.object({
    kind: z.literal('weapon-damage-bonus'),
    appliesTo: z.enum(['melee', 'ranged']),
    perTier: z.tuple([z.number().int(), z.number().int(), z.number().int()]),
  }),
  // Phase 2b Group A+B (2b.3): kit-side weapon distance bonus. Sums into
  // runtime.meleeDistanceBonus / rangedDistanceBonus; RollPower / range-check
  // sites consume in a later slice (slice 10).
  z.object({
    kind: z.literal('weapon-distance-bonus'),
    appliesTo: z.enum(['melee', 'ranged']),
    delta: z.number().int(),
  }),
  // Phase 2b Group A+B (2b.4): disengage bonus. Sums into runtime.disengageBonus;
  // UI surfaces as +N forced-move on Disengage in a later slice (slice 11).
  z.object({ kind: z.literal('disengage-bonus'), delta: z.number().int() }),
]);
export type AttachmentEffect = z.infer<typeof AttachmentEffectSchema>;

export const CharacterAttachmentSchema = z.object({
  source: AttachmentSourceSchema,
  condition: AttachmentConditionSchema.optional(),
  effect: AttachmentEffectSchema,
});
export type CharacterAttachment = z.infer<typeof CharacterAttachmentSchema>;
