// The runtime-resolved shape of the bundled static JSON files. Loaded by
// the web client from /data/*.json and by the API DO from the in-process
// import. The derivation function reads this — it never fetches.

import type {
  AbilitySchema,
  AncestrySchema,
  CareerSchema,
  ClassSchema,
  ItemSchema,
  TitleSchema,
} from '@ironyard/shared';
import { z } from 'zod';

// Light shapes — only what derivation reads. Full schemas live in shared/data.
export const ResolvedKitSchema = z.object({
  id: z.string(),
  name: z.string(),
  staminaBonus: z.number().int().default(0),
  speedBonus: z.number().int().default(0),
  stabilityBonus: z.number().int().default(0),
  meleeDamageBonus: z.number().int().default(0),
  rangedDamageBonus: z.number().int().default(0),
  signatureAbilityId: z.string().optional(),
  keywords: z.array(z.string()).default([]),
});
export type ResolvedKit = z.infer<typeof ResolvedKitSchema>;

export type StaticDataBundle = {
  ancestries: Map<string, z.infer<typeof AncestrySchema>>;
  careers: Map<string, z.infer<typeof CareerSchema>>;
  classes: Map<string, z.infer<typeof ClassSchema>>;
  kits: Map<string, ResolvedKit>;
  abilities: Map<string, z.infer<typeof AbilitySchema>>;
  items: Map<string, z.infer<typeof ItemSchema>>;
  titles: Map<string, z.infer<typeof TitleSchema>>;
};
