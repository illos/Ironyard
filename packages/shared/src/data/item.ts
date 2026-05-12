import { z } from 'zod';

const ItemBase = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),
  raw: z.string().default(''),
});

const ArtifactSchema = ItemBase.extend({
  category: z.literal('artifact'),
});
export type Artifact = z.infer<typeof ArtifactSchema>;

const ConsumableSchema = ItemBase.extend({
  category: z.literal('consumable'),
  echelon: z.number().int().min(1).max(4).optional(),
  effectKind: z
    .enum(['instant', 'duration', 'two-phase', 'attack', 'area', 'unknown'])
    .default('unknown'),
});
export type Consumable = z.infer<typeof ConsumableSchema>;

const LeveledTreasureSchema = ItemBase.extend({
  category: z.literal('leveled-treasure'),
  echelon: z.number().int().min(1).max(4),
  kitKeyword: z.string().nullable().default(null),
});
export type LeveledTreasure = z.infer<typeof LeveledTreasureSchema>;

const TrinketSchema = ItemBase.extend({
  category: z.literal('trinket'),
  bodySlot: z
    .enum(['arms', 'feet', 'hands', 'head', 'neck', 'waist', 'ring'])
    .nullable()
    .default(null),
});
export type Trinket = z.infer<typeof TrinketSchema>;

export const ItemSchema = z.discriminatedUnion('category', [
  ArtifactSchema,
  ConsumableSchema,
  LeveledTreasureSchema,
  TrinketSchema,
]);
export type Item = z.infer<typeof ItemSchema>;

export const ItemFileSchema = z.object({
  version: z.string().min(1),
  generatedAt: z.number().int().nonnegative(),
  count: z.number().int().nonnegative(),
  items: z.array(ItemSchema),
});
export type ItemFile = z.infer<typeof ItemFileSchema>;
