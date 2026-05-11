import { z } from 'zod';
import { CharacteristicSchema } from '../characteristic';

// ── Characteristic array options ──────────────────────────────────────────────

// A single distribution array the player can choose for their free
// characteristic slots, e.g. [2, -1, -1] or [1, 1, -1].
export const CharacteristicArraySchema = z.array(z.number().int().min(-2).max(2));
export type CharacteristicArray = z.infer<typeof CharacteristicArraySchema>;

// ── Ability slot ──────────────────────────────────────────────────────────────

// Describes one ability the player picks at a given level.
// cost === 0 means it is a signature ability (always-available, free).
export const AbilitySlotSchema = z.object({
  cost: z.number().int().min(0), // heroic resource cost; 0 = signature
  isSubclass: z.boolean().default(false), // drawn from the subclass pool
});
export type AbilitySlot = z.infer<typeof AbilitySlotSchema>;

// ── Level entry ───────────────────────────────────────────────────────────────

export const ClassLevelSchema = z.object({
  level: z.number().int().min(1).max(10),
  // Human-readable feature names from the advancement table (display only).
  featureNames: z.array(z.string()).default([]),
  // Ability picks the player makes at this level.
  abilitySlots: z.array(AbilitySlotSchema).default([]),
  // Whether this level grants a perk pick.
  grantsPerk: z.boolean().default(false),
  // Whether this level grants a skill pick.
  grantsSkill: z.boolean().default(false),
  // Whether this level includes a characteristic increase (auto-applied per
  // the class's characteristic increase rule, no player decision).
  grantsCharacteristicIncrease: z.boolean().default(false),
});
export type ClassLevel = z.infer<typeof ClassLevelSchema>;

// ── Subclass ──────────────────────────────────────────────────────────────────

export const SubclassSchema = z.object({
  id: z.string().min(1), // slugified name
  name: z.string().min(1),
  description: z.string().default(''),
  // Skill granted when choosing this subclass (common but not universal).
  skillGrant: z.string().nullable().default(null),
});
export type Subclass = z.infer<typeof SubclassSchema>;

// ── Class ─────────────────────────────────────────────────────────────────────

export const ClassSchema = z.object({
  id: z.string().min(1), // matches front-matter item_id
  name: z.string().min(1),
  description: z.string(), // flavor intro from class body
  // ── Characteristics ──
  // Stats that are pre-set for all members of this class (always 2 at level 1).
  lockedCharacteristics: z.array(CharacteristicSchema),
  // Arrays the player assigns to the remaining (unlocked) characteristic slots.
  characteristicArrays: z.array(CharacteristicArraySchema),
  // The characteristic used for potency calculations.
  potencyCharacteristic: CharacteristicSchema,
  // ── Resource ──
  heroicResource: z.string().min(1), // e.g. 'wrath', 'clarity'
  // ── Stamina & recoveries ──
  startingStamina: z.number().int().min(1),
  staminaPerLevel: z.number().int().min(1),
  recoveries: z.number().int().min(1),
  // ── Starting skills ──
  // Plain english description of which skills the class grants at level 1,
  // e.g. "any two from the interpersonal or lore skill groups".
  startingSkillsNote: z.string().default(''),
  startingSkillCount: z.number().int().min(0).default(0),
  startingSkillGroups: z
    .array(z.enum(['crafting', 'exploration', 'interpersonal', 'intrigue', 'lore']))
    .default([]),
  // ── Subclass ──
  subclassLabel: z.string().min(1), // e.g. 'Order', 'Aspect', 'College'
  subclasses: z.array(SubclassSchema).default([]),
  // ── Level progression ──
  levels: z.array(ClassLevelSchema).min(10).max(10),
});
export type HeroClass = z.infer<typeof ClassSchema>;

// ── File envelope ─────────────────────────────────────────────────────────────

export const ClassFileSchema = z.object({
  version: z.string().min(1),
  generatedAt: z.number().int().nonnegative(),
  count: z.number().int().nonnegative(),
  classes: z.array(ClassSchema),
});
export type ClassFile = z.infer<typeof ClassFileSchema>;
