import { z } from 'zod';

export const TitleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  echelon: z.number().int().min(1).max(4),
  description: z.string().default(''),
  raw: z.string().default(''),
  grantsAbilityId: z.string().nullable().default(null),
});
export type Title = z.infer<typeof TitleSchema>;

export const TitleFileSchema = z.object({
  version: z.string().min(1),
  generatedAt: z.number().int().nonnegative(),
  count: z.number().int().nonnegative(),
  titles: z.array(TitleSchema),
});
export type TitleFile = z.infer<typeof TitleFileSchema>;
