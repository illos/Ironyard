import { z } from 'zod';
import { AbilityTypeSchema, PowerRollSchema } from './power-roll';

// ── AbilitySchema ──────────────────────────────────────────────────────────────
//
// Covers both monster abilities (ingested by packages/data) and PC abilities
// (ingested by the Phase 2 Epic 2A class-ability pipeline). Monster abilities
// never populate the PC-extension fields; they default to null/false so the
// combat engine can treat them uniformly.
//
// Field notes:
//   costLabel  — free-text label from the monster statblock parenthetical,
//                e.g. "Signature Ability", "2 Malice", "Villain Action 1".
//                Not present on PC abilities; omit when ingesting class data.
//   cost       — heroic resource cost for PC abilities (0 = signature,
//                3/5/7/9 = heroic). Null for monster abilities.
//   tier       — class level at which the ability is available (1–10).
//                Null for monster abilities.
//   isSubclass — true when the ability belongs to a subclass option.
//   sourceClassId — slug of the hero class that owns this ability (e.g. "fury").

export const AbilitySchema = z.object({
  // ── Existing fields (verbatim from monster.ts, costLabel renamed from cost) ──
  name: z.string().min(1),
  type: AbilityTypeSchema,
  costLabel: z.string().optional(), // was `cost` on monster.ts — free-text label
  keywords: z.array(z.string()).default([]),
  distance: z.string().optional(),
  target: z.string().optional(),
  powerRoll: PowerRollSchema.optional(),
  effect: z.string().optional(),
  trigger: z.string().optional(),
  raw: z.string(), // always-correct fallback for the UI

  // ── PC extensions ────────────────────────────────────────────────────────────
  cost: z.number().int().min(0).nullable().default(null),
  tier: z.number().int().min(1).max(10).nullable().default(null),
  isSubclass: z.boolean().default(false),
  sourceClassId: z.string().nullable().default(null),
});
export type Ability = z.infer<typeof AbilitySchema>;

export const AbilityFileSchema = z.object({
  version: z.string().min(1),
  generatedAt: z.number().int().nonnegative(),
  count: z.number().int().nonnegative(),
  abilities: z.array(AbilitySchema),
});
export type AbilityFile = z.infer<typeof AbilityFileSchema>;
