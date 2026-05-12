import { z } from 'zod';

// ── Character appearance / narrative details ──────────────────────────────────

export const CharacterDetailsSchema = z.object({
  pronouns: z.string().default(''),
  age: z.string().default(''),
  height: z.string().default(''),
  build: z.string().default(''),
  eyes: z.string().default(''),
  hair: z.string().default(''),
  skinTone: z.string().default(''),
  physicalFeatures: z.string().default(''),
  physicalFeaturesTexture: z.string().default(''),
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

// ── Ancestry choices ──────────────────────────────────────────────────────────

export const AncestryChoicesSchema = z.object({
  // Ids of purchasable traits the player has selected.
  traitIds: z.array(z.string()).default([]),

  // Devil — Silver Tongue: free interpersonal skill pick.
  freeSkillId: z.string().nullable().default(null),

  // Dragon Knight — Wyrmplate: chosen damage type immunity.
  // One of 'acid' / 'cold' / 'corruption' / 'fire' / 'lightning' / 'poison'.
  wyrmplateType: z.string().nullable().default(null),

  // Dragon Knight (Prismatic Scales purchased trait): locked-in
  // second damage type immunity from the same six-element list.
  prismaticScalesType: z.string().nullable().default(null),

  // Revenant — Former Life: the ancestry id the character was
  // before they died. Determines size; speed is always 5.
  formerAncestryId: z.string().nullable().default(null),

  // Revenant — Previous Life slots: parallel array to the
  // `previous-life-*-points` entries in `traitIds`. Each entry
  // resolves to a trait id from the FORMER ancestry's purchasable
  // trait list. Length should match the count of previous-life
  // trait entries in traitIds.
  previousLifeTraitIds: z.array(z.string()).default([]),
});
export type AncestryChoices = z.infer<typeof AncestryChoicesSchema>;

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

export const InventoryEntrySchema = z.object({
  itemId: z.string().min(1),
  // Consumables use quantity > 1. Others default to 1.
  quantity: z.number().int().min(0).default(1),
  // Worn/wielded vs. carried. Per-category invariants (body-slot conflicts,
  // 3-safely-carry) are runtime concerns enforced in 2B/2C, not at the
  // schema level.
  equipped: z.boolean().default(false),
});
export type InventoryEntry = z.infer<typeof InventoryEntrySchema>;

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
  ancestryChoices: AncestryChoicesSchema.default({}),

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

  // The player's drag-and-drop assignment of the chosen array's values to
  // their unlocked characteristic slots. The two slots locked by the class
  // don't appear here. Null until the player has assigned all three values.
  // Example: { agility: 2, presence: -1, reason: -1 }
  characteristicSlots: z.record(z.string(), z.number().int()).nullable().default(null),

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

  // ── Inventory ─────────────────────────────────────────────────────────────
  // Items the character owns. Empty default for fresh characters.
  inventory: z.array(InventoryEntrySchema).default([]),

  // ── Campaign context ──────────────────────────────────────────────────────
  // Set when the character was created using a campaign invite code.
  // Null for standalone characters.
  campaignId: z.string().nullable().default(null),
});
export type Character = z.infer<typeof CharacterSchema>;

// ── Submission-validity gate ──────────────────────────────────────────────
//
// CharacterSchema is draft-tolerant — every field nullable / defaulted.
// CompleteCharacterSchema layers refinements that a fully-built character
// must satisfy. Used by:
//   - the wizard's Submit button enable state
//   - POST /characters when both campaignCode and data are present
//   - applySubmitCharacter authority check
//
// Per-career skill-count / language-count refinements require static-data
// lookup and live in the wizard / reducer rather than the schema; this
// schema enforces structural completeness only.

export const CompleteCharacterSchema = CharacterSchema.refine((c) => c.ancestryId !== null, {
  message: 'ancestry required',
  path: ['ancestryId'],
})
  .refine((c) => c.culture.environment !== null, {
    message: 'culture.environment required',
    path: ['culture', 'environment'],
  })
  .refine((c) => c.culture.organization !== null, {
    message: 'culture.organization required',
    path: ['culture', 'organization'],
  })
  .refine((c) => c.culture.upbringing !== null, {
    message: 'culture.upbringing required',
    path: ['culture', 'upbringing'],
  })
  .refine((c) => c.culture.environmentSkill !== null, {
    message: 'culture.environmentSkill required',
    path: ['culture', 'environmentSkill'],
  })
  .refine((c) => c.culture.organizationSkill !== null, {
    message: 'culture.organizationSkill required',
    path: ['culture', 'organizationSkill'],
  })
  .refine((c) => c.culture.upbringingSkill !== null, {
    message: 'culture.upbringingSkill required',
    path: ['culture', 'upbringingSkill'],
  })
  .refine((c) => c.culture.language !== null, {
    message: 'culture.language required',
    path: ['culture', 'language'],
  })
  .refine((c) => c.careerId !== null, {
    message: 'career required',
    path: ['careerId'],
  })
  .refine((c) => c.careerChoices.incitingIncidentId !== null, {
    message: 'inciting incident required',
    path: ['careerChoices', 'incitingIncidentId'],
  })
  .refine((c) => c.classId !== null, {
    message: 'class required',
    path: ['classId'],
  })
  .refine((c) => c.characteristicArray !== null, {
    message: 'characteristic array required',
    path: ['characteristicArray'],
  })
  .refine((c) => c.characteristicArray === null || c.characteristicSlots !== null, {
    message: 'characteristic slot assignment required',
    path: ['characteristicSlots'],
  })
  .refine(
    (c) => {
      for (let lvl = 1; lvl <= c.level; lvl++) {
        if (!c.levelChoices[String(lvl)]) return false;
      }
      return true;
    },
    { message: 'levelChoices must cover every level up to `level`', path: ['levelChoices'] },
  )
  // Devil: must pick free interpersonal skill via Silver Tongue
  .refine((c) => c.ancestryId !== 'devil' || c.ancestryChoices.freeSkillId !== null, {
    message: 'Devil characters must pick a Silver Tongue skill',
    path: ['ancestryChoices', 'freeSkillId'],
  })
  // Dragon Knight: must pick Wyrmplate damage type
  .refine((c) => c.ancestryId !== 'dragon-knight' || c.ancestryChoices.wyrmplateType !== null, {
    message: 'Dragon Knight characters must pick a Wyrmplate damage type',
    path: ['ancestryChoices', 'wyrmplateType'],
  })
  // Dragon Knight + Prismatic Scales purchased: must pick second damage type
  .refine(
    (c) =>
      c.ancestryId !== 'dragon-knight' ||
      !c.ancestryChoices.traitIds.includes('prismatic-scales') ||
      c.ancestryChoices.prismaticScalesType !== null,
    {
      message: 'Prismatic Scales requires a second damage type pick',
      path: ['ancestryChoices', 'prismaticScalesType'],
    },
  )
  // Revenant: must pick former ancestry
  .refine((c) => c.ancestryId !== 'revenant' || c.ancestryChoices.formerAncestryId !== null, {
    message: 'Revenant characters must pick a Former Life ancestry',
    path: ['ancestryChoices', 'formerAncestryId'],
  })
  // Revenant: previousLifeTraitIds length must equal previous-life-* slot count
  .refine(
    (c) => {
      if (c.ancestryId !== 'revenant') return true;
      const slotCount = c.ancestryChoices.traitIds.filter((id) =>
        id.startsWith('previous-life-'),
      ).length;
      return c.ancestryChoices.previousLifeTraitIds.length === slotCount;
    },
    {
      message: 'Each Previous Life slot must have a chosen trait',
      path: ['ancestryChoices', 'previousLifeTraitIds'],
    },
  );

export type CompleteCharacter = z.infer<typeof CompleteCharacterSchema>;

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
  // with that campaign context, and (if `data` is also a complete character)
  // auto-submit for director approval.
  campaignCode: z.string().length(6).optional(),
  // Optional one-shot payload. If present alongside campaignCode AND passes
  // CompleteCharacterSchema, the handler auto-submits. Otherwise the row is
  // created with these draft contents.
  data: CharacterSchema.optional(),
});
export type CreateCharacterRequest = z.infer<typeof CreateCharacterRequestSchema>;

// ── Update request ────────────────────────────────────────────────────────────

// Partial update — the wizard sends the full CharacterSchema blob on each save.
export const UpdateCharacterRequestSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  data: CharacterSchema.optional(),
});
export type UpdateCharacterRequest = z.infer<typeof UpdateCharacterRequestSchema>;
