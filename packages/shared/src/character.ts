import { z } from 'zod';

// ── Character appearance / narrative details ──────────────────────────────────

export const CharacterDetailsSchema = z.object({
  pronouns: z.string().default(''),
  hairColor: z.string().default(''),
  eyeColor: z.string().default(''),
  height: z.string().default(''),
  build: z.string().default(''),
  age: z.string().default(''),
  backstory: z.string().default(''),
});
export type CharacterDetails = z.infer<typeof CharacterDetailsSchema>;

// ── Culture choices ───────────────────────────────────────────────────────────

const CultureEnvironmentSchema = z.enum(['nomadic', 'rural', 'secluded', 'urban', 'wilderness']);
const CultureOrganizationSchema = z.enum(['bureaucratic', 'communal']);
const CultureUpbringingSchema = z.enum([
  'academic',
  'creative',
  'labor',
  'lawless',
  'martial',
  'noble',
]);

export const CharacterCultureSchema = z.object({
  // Custom name the player gives their culture (optional display label).
  customName: z.string().default(''),
  environment: CultureEnvironmentSchema.nullable().default(null),
  organization: CultureOrganizationSchema.nullable().default(null),
  upbringing: CultureUpbringingSchema.nullable().default(null),
  // One skill chosen per culture aspect (environment, organization, upbringing).
  environmentSkill: z.string().nullable().default(null),
  organizationSkill: z.string().nullable().default(null),
  upbringingSkill: z.string().nullable().default(null),
  // The language the culture speaks (in addition to Caelian which all heroes know).
  language: z.string().nullable().default(null),
});
export type CharacterCulture = z.infer<typeof CharacterCultureSchema>;

// ── Career choices ────────────────────────────────────────────────────────────

export const CharacterCareerChoicesSchema = z.object({
  // Specific skills chosen when the career offers a group-pick rather than
  // fixed skills (e.g. "one from interpersonal").
  skills: z.array(z.string()).default([]),
  // Languages chosen (up to the career's languageCount).
  languages: z.array(z.string()).default([]),
  // The inciting incident chosen from the career's list.
  incitingIncidentId: z.string().nullable().default(null),
  // The perk chosen from the career's perk type.
  perkId: z.string().nullable().default(null),
});
export type CharacterCareerChoices = z.infer<typeof CharacterCareerChoicesSchema>;

// ── Per-level class choices ───────────────────────────────────────────────────

// Records the player's picks for a single class level. Ability ids reference
// entries in abilities.json (static data). Perk and skill ids reference
// entries in perks.json and the skills registry respectively.
export const LevelChoicesSchema = z.object({
  // Abilities chosen from the general class pool at this level.
  abilityIds: z.array(z.string()).default([]),
  // Abilities chosen from the subclass pool at this level.
  subclassAbilityIds: z.array(z.string()).default([]),
  // Perk chosen at this level (null if this level doesn't grant a perk).
  perkId: z.string().nullable().default(null),
  // Skill chosen at this level (null if this level doesn't grant a skill).
  skillId: z.string().nullable().default(null),
});
export type LevelChoices = z.infer<typeof LevelChoicesSchema>;

// ── Full character blob ───────────────────────────────────────────────────────
//
// This is the JSON stored in `characters.data` in D1. It is the canonical,
// user-owned representation of a hero's sheet. The `name` field is also
// stored as a top-level column on the `characters` table for list views;
// keep them in sync on every write.

export const CharacterSchema = z.object({
  // ── Advancement ──────────────────────────────────────────────────────────
  level: z.number().int().min(1).max(10).default(1),
  // ── XP (Phase 2 addition) ────────────────────────────────────────────────
  xp: z.number().int().min(0).default(0),

  // ── Narrative details ─────────────────────────────────────────────────────
  details: CharacterDetailsSchema.default({}),

  // ── Ancestry ─────────────────────────────────────────────────────────────
  // References ancestries.json by id.
  ancestryId: z.string().nullable().default(null),
  ancestryChoices: z
    .object({
      // Ids of purchasable traits the player has selected.
      traitIds: z.array(z.string()).default([]),
    })
    .default({}),

  // ── Culture ───────────────────────────────────────────────────────────────
  culture: CharacterCultureSchema.default({}),

  // ── Career ────────────────────────────────────────────────────────────────
  // References careers.json by id.
  careerId: z.string().nullable().default(null),
  careerChoices: CharacterCareerChoicesSchema.default({}),

  // ── Class ─────────────────────────────────────────────────────────────────
  // References classes.json by id.
  classId: z.string().nullable().default(null),

  // The distribution array chosen for the unlocked characteristic slots.
  // Each value maps to one of the free characteristics in order they appear
  // on the character sheet (the locked ones are pre-set by the class).
  // Null until the player has made this pick.
  characteristicArray: z.array(z.number().int()).nullable().default(null),

  // References the subclass id within classes.json (e.g. an Order, Aspect, etc.).
  subclassId: z.string().nullable().default(null),

  // Per-level ability / perk / skill picks. Keyed "1" through "10".
  // Only levels up to `level` will have entries; higher levels are not shown.
  levelChoices: z.record(z.string(), LevelChoicesSchema).default({}),

  // ── Kit ───────────────────────────────────────────────────────────────────
  // References kits.json by id. Nullable if the class doesn't use a kit.
  kitId: z.string().nullable().default(null),

  // ── Complication (optional) ───────────────────────────────────────────────
  // References complications.json by id. Null if the player opted out.
  complicationId: z.string().nullable().default(null),

  // ── Campaign context ──────────────────────────────────────────────────────
  // Set when the character was created using a campaign invite code.
  // Null for standalone characters.
  campaignId: z.string().nullable().default(null),
});
export type Character = z.infer<typeof CharacterSchema>;

// ── HTTP response shape ───────────────────────────────────────────────────────
//
// What the API returns when listing or fetching a character. The `data` field
// is the parsed + validated CharacterSchema blob.

export const CharacterResponseSchema = z.object({
  id: z.string().min(1),
  ownerId: z.string().min(1),
  name: z.string().min(1),
  data: CharacterSchema,
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});
export type CharacterResponse = z.infer<typeof CharacterResponseSchema>;

// ── Create request ────────────────────────────────────────────────────────────

export const CreateCharacterRequestSchema = z.object({
  name: z.string().min(1).max(80),
  // Optional invite code. If present: join the campaign, create the character
  // with that campaign context, and auto-submit for director approval.
  campaignCode: z.string().length(6).optional(),
});
export type CreateCharacterRequest = z.infer<typeof CreateCharacterRequestSchema>;

// ── Update request ────────────────────────────────────────────────────────────

// Partial update — the wizard sends the full CharacterSchema blob on each save.
export const UpdateCharacterRequestSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  data: CharacterSchema.optional(),
});
export type UpdateCharacterRequest = z.infer<typeof UpdateCharacterRequestSchema>;
