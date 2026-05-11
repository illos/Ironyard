import { z } from 'zod';

// The 9 Draw Steel heroic resources (rules-canon.md §5.4.9). Typed registry —
// only Clarity is allowed a negative floor; every other resource floors at 0.
// Compiler-checked switch coverage at every consumer site.
export const HEROIC_RESOURCE_NAMES = [
  'wrath',
  'piety',
  'essence',
  'ferocity',
  'discipline',
  'insight',
  'focus',
  'clarity',
  'drama',
] as const;

export const HeroicResourceNameSchema = z.enum(HEROIC_RESOURCE_NAMES);
export type HeroicResourceName = z.infer<typeof HeroicResourceNameSchema>;

// Per-participant instance of one of the 9 named heroic resources.
// `floor` defaults to 0; Talent's Clarity is constructed with floor = -(1 + Reason)
// per canon §5.3 — the lone exception to the always-≥-0 rule. Reducer enforces
// `value - amount < floor` rejection on SpendResource.
export const HeroicResourceInstanceSchema = z.object({
  name: HeroicResourceNameSchema,
  value: z.number().int(),
  max: z.number().int().nonnegative().optional(),
  floor: z.number().int().default(0),
});
export type HeroicResourceInstance = z.infer<typeof HeroicResourceInstanceSchema>;

// Free-form named extra resource pool — homebrew or epic secondaries (Censor
// Virtue, Conduit Divine Power) when those land in Phase 2. Slice 7 reserves
// the array; the schema is open so the type system stays out of the way.
export const ExtraResourceInstanceSchema = z.object({
  name: z.string().min(1),
  value: z.number().int(),
  max: z.number().int().nonnegative().optional(),
  floor: z.number().int().default(0),
});
export type ExtraResourceInstance = z.infer<typeof ExtraResourceInstanceSchema>;

// Discriminator for intent payloads — pick a heroic resource by typed name or
// an extra pool by free-form name. Reducer dispatches off `extra` presence.
export const ResourceRefSchema = z.union([
  HeroicResourceNameSchema,
  z.object({ extra: z.string().min(1) }),
]);
export type ResourceRef = z.infer<typeof ResourceRefSchema>;
