import { z } from 'zod';

// ── Ancestry trait ────────────────────────────────────────────────────────────

export const AncestryTraitSchema = z.object({
  id: z.string().min(1), // slugified name
  name: z.string().min(1),
  cost: z.number().int().min(1), // ancestry points required
  description: z.string(),
});
export type AncestryTrait = z.infer<typeof AncestryTraitSchema>;

// ── Ancestry ──────────────────────────────────────────────────────────────────

export const AncestrySchema = z.object({
  id: z.string().min(1), // matches front-matter item_id
  name: z.string().min(1),
  description: z.string(), // flavor text intro from the body
  // The free trait every member of this ancestry gets automatically.
  signatureTrait: z.object({
    name: z.string().min(1),
    description: z.string(),
  }),
  // Traits the player purchases with ancestry points.
  purchasedTraits: z.array(AncestryTraitSchema),
  // Total ancestry points the player has to spend. Always 3 in v1.
  ancestryPoints: z.number().int().min(1).default(3),

  // Default size if this ancestry is the character's ancestry. '1M' for
  // most ancestries; '1S' for polder; '1L' for hakaan. Revenant has no
  // fixed size — it's inherited from the chosen formerAncestry at runtime.
  defaultSize: z.string().min(1).default('1M'),

  // Default base speed in squares. 5 for most ancestries. Revenant is
  // always 5 regardless of former life.
  defaultSpeed: z.number().int().min(0).default(5),

  // Granted immunities from the ancestry's signature trait. Each entry
  // is a typed resistance descriptor where `value` may be either a fixed
  // number or the string 'level' meaning "equal to character.level at
  // runtime". Most ancestries grant no immunities (empty array).
  // Time Raider's Psychic Scar grants { kind: 'psychic', value: 'level' }.
  grantedImmunities: z
    .array(
      z.object({
        kind: z.string().min(1),
        value: z.union([z.number().int().nonnegative(), z.literal('level')]),
      }),
    )
    .default([]),

  // Reference to an Ability id (when the ingest pipeline starts emitting
  // PC abilities). Used for the 3 Class-D ancestries (human, orc, dwarf).
  // Always null for Epic 1.1 — Class D ability collection is deferred to
  // Epic 2's ability ingest pass. The field is added now so the schema
  // is stable.
  signatureAbilityId: z.string().nullable().default(null),
});
export type Ancestry = z.infer<typeof AncestrySchema>;

// ── File envelope ─────────────────────────────────────────────────────────────

export const AncestryFileSchema = z.object({
  version: z.string().min(1),
  generatedAt: z.number().int().nonnegative(),
  count: z.number().int().nonnegative(),
  ancestries: z.array(AncestrySchema),
});
export type AncestryFile = z.infer<typeof AncestryFileSchema>;
