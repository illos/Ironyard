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

  // Reference to an Ability id for ancestries whose Signature Trait is an
  // invocable ability (Human *Detect the Supernatural* maneuver; Polder
  // *Shadowmeld* magic maneuver). Per the printed Heroes Book, ancestries
  // grant "Signature Traits", not "signature abilities" — that term is a
  // class concept (Fury / Conduit free-action signature). The field is
  // named to reflect that distinction. Other Signature Traits route
  // through different engine paths (size mods, immunities, triggered
  // passives, test edges); see rules-canon § 10.2 and Q17 for the gap
  // tracker. Always null in the shipped data today — the corresponding
  // abilities live in ancestry markdown, not abilities markdown, so the
  // ingest doesn't yet pick them up.
  signatureTraitAbilityId: z.string().nullable().default(null),
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
