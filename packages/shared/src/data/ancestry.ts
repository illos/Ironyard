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
