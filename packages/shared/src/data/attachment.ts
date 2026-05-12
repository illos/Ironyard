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

export const AttachmentEffectSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('stat-mod'),
    stat: StatModFieldSchema,
    delta: z.number().int(),
  }),
  z.object({
    kind: z.literal('stat-replace'),
    stat: StatReplaceFieldSchema,
    value: z.union([z.number(), z.string()]),
  }),
  z.object({ kind: z.literal('grant-ability'), abilityId: z.string().min(1) }),
  z.object({ kind: z.literal('grant-skill'), skill: z.string().min(1) }),
  z.object({ kind: z.literal('grant-language'), language: z.string().min(1) }),
  z.object({
    kind: z.literal('immunity'),
    damageKind: z.string().min(1),
    value: z.union([z.number().int().nonnegative(), z.literal('level')]),
  }),
  z.object({
    kind: z.literal('weakness'),
    damageKind: z.string().min(1),
    value: z.union([z.number().int().nonnegative(), z.literal('level')]),
  }),
  z.object({ kind: z.literal('free-strike-damage'), delta: z.number().int() }),
]);
export type AttachmentEffect = z.infer<typeof AttachmentEffectSchema>;

export const CharacterAttachmentSchema = z.object({
  source: AttachmentSourceSchema,
  condition: AttachmentConditionSchema.optional(),
  effect: AttachmentEffectSchema,
});
export type CharacterAttachment = z.infer<typeof CharacterAttachmentSchema>;
