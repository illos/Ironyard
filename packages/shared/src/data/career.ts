import { z } from 'zod';

// ── Perk type ─────────────────────────────────────────────────────────────────

// Matches the six perk categories described in Chapter 7: Perks.
export const PerkTypeSchema = z.enum([
  'crafting',
  'exploration',
  'interpersonal',
  'intrigue',
  'lore',
  'supernatural',
]);
export type PerkType = z.infer<typeof PerkTypeSchema>;

// ── Inciting incident ─────────────────────────────────────────────────────────

export const IncitingIncidentSchema = z.object({
  id: z.string().min(1), // slugified title
  title: z.string().min(1),
  description: z.string(),
});
export type IncitingIncident = z.infer<typeof IncitingIncidentSchema>;

// ── Skill grant ───────────────────────────────────────────────────────────────

// Careers grant skills either as fixed picks ("you have the Sneak skill") or
// as a player choice from a skill group ("one skill from the interpersonal
// group"). Both shapes are needed to drive the wizard UI.
export const SkillGrantSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('fixed'),
    skillId: z.string().min(1), // exact skill name, lowercased
  }),
  z.object({
    kind: z.literal('choice'),
    group: z.enum(['crafting', 'exploration', 'interpersonal', 'intrigue', 'lore']),
    count: z.number().int().min(1).default(1),
  }),
]);
export type SkillGrant = z.infer<typeof SkillGrantSchema>;

// ── Career ────────────────────────────────────────────────────────────────────

export const CareerSchema = z.object({
  id: z.string().min(1), // matches front-matter item_id
  name: z.string().min(1),
  description: z.string(), // intro paragraph from body text
  // Skills granted: mix of fixed and choice grants.
  skillGrants: z.array(SkillGrantSchema).default([]),
  // Number of bonus languages the player may select.
  languageCount: z.number().int().min(0).default(0),
  // The type of perk the career unlocks. Nullable only if the source omits it
  // (shouldn't happen in v1 data, but graceful).
  perkType: PerkTypeSchema.nullable().default(null),
  // Inciting incidents listed for this career. Player picks one.
  incitingIncidents: z.array(IncitingIncidentSchema).default([]),
  // Optional wealth or renown grant (display-only in Phase 2).
  renown: z.number().int().min(0).default(0),
  wealthNote: z.string().optional(),
});
export type Career = z.infer<typeof CareerSchema>;

// ── File envelope ─────────────────────────────────────────────────────────────

export const CareerFileSchema = z.object({
  version: z.string().min(1),
  generatedAt: z.number().int().nonnegative(),
  count: z.number().int().nonnegative(),
  careers: z.array(CareerSchema),
});
export type CareerFile = z.infer<typeof CareerFileSchema>;
