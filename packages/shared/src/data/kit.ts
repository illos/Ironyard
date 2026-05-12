import { z } from 'zod';

export const KitSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),
  raw: z.string().default(''),
  staminaBonus: z.number().int().default(0),
  speedBonus: z.number().int().default(0),
  stabilityBonus: z.number().int().default(0),
  meleeDamageBonus: z.number().int().default(0),
  rangedDamageBonus: z.number().int().default(0),
  signatureAbilityId: z.string().nullable().default(null),
  // 2B uses these to gate weapon/armor item bonuses on the attachment fold.
  // Examples: ['heavy-weapon'], ['light-armor', 'shield'].
  keywords: z.array(z.string()).default([]),
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
