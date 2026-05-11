import { z } from 'zod';

export const EncounterTemplateEntrySchema = z.object({
  monsterId: z.string().min(1),
  quantity: z.number().int().min(1).max(50),
  nameOverride: z.string().min(1).max(80).optional(),
});
export type EncounterTemplateEntry = z.infer<typeof EncounterTemplateEntrySchema>;

export const EncounterTemplateDataSchema = z.object({
  monsters: z.array(EncounterTemplateEntrySchema),
  notes: z.string().max(2000).optional(),
});
export type EncounterTemplateData = z.infer<typeof EncounterTemplateDataSchema>;

export const EncounterTemplateSchema = z.object({
  id: z.string().min(1),
  campaignId: z.string().min(1),
  name: z.string().min(1).max(120),
  data: EncounterTemplateDataSchema,
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});
export type EncounterTemplate = z.infer<typeof EncounterTemplateSchema>;
