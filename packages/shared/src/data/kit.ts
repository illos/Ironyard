import { z } from 'zod';

export const KitSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),
  raw: z.string().default(''),
  staminaBonus: z.number().int().default(0),
  speedBonus: z.number().int().default(0),
  stabilityBonus: z.number().int().default(0),
  // Slice 6 (Epic 2C § 10.8): per-tier damage bonus tuples. Source markdown
  // reads "+X/+Y/+Z" — preserved positionally as [tier1, tier2, tier3]. The
  // attachment collector emits a `weapon-damage-bonus` effect (one per
  // appliesTo) and the RollPower handler adds the tier-N entry to ability
  // damage when the ability has Weapon + Melee/Ranged keywords.
  meleeDamageBonusPerTier: z
    .tuple([z.number().int(), z.number().int(), z.number().int()])
    .default([0, 0, 0]),
  rangedDamageBonusPerTier: z
    .tuple([z.number().int(), z.number().int(), z.number().int()])
    .default([0, 0, 0]),
  signatureAbilityId: z.string().nullable().default(null),
  // 2B uses these to gate weapon/armor item bonuses on the attachment fold.
  // Examples: ['heavy-weapon'], ['light-armor', 'shield'].
  keywords: z.array(z.string()).default([]),
  // Phase 2b Group A+B (2b.3 + 2b.4): kit-side bonuses. The kit collector
  // emits `weapon-distance-bonus` / `disengage-bonus` attachment effects when
  // these are non-zero in a later slice; the applier sums into the matching
  // CharacterRuntime fields and ParticipantSchema snapshots them at
  // StartEncounter. Defaults keep older fixtures and parse paths green.
  meleeDistanceBonus: z.number().int().nonnegative().default(0),
  rangedDistanceBonus: z.number().int().nonnegative().default(0),
  disengageBonus: z.number().int().nonnegative().default(0),
});
export type Kit = z.infer<typeof KitSchema>;

// ── File envelope ─────────────────────────────────────────────────────────────

export const KitFileSchema = z.object({
  version: z.string().min(1),
  generatedAt: z.number().int().nonnegative(),
  count: z.number().int().nonnegative(),
  kits: z.array(KitSchema),
});
export type KitFile = z.infer<typeof KitFileSchema>;
