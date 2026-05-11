import { z } from 'zod';
import { MonsterSchema } from '../data/monster';

export const LoadEncounterTemplateClientPayloadSchema = z.object({
  templateId: z.string().min(1),
});
export type LoadEncounterTemplateClientPayload = z.infer<
  typeof LoadEncounterTemplateClientPayloadSchema
>;

// DO stamps the resolved entries onto the payload before reducer sees it.
export const LoadEncounterTemplateResolvedEntrySchema = z.object({
  monsterId: z.string().min(1),
  quantity: z.number().int().min(1).max(50),
  nameOverride: z.string().min(1).max(80).optional(),
  monster: MonsterSchema,
});
export type LoadEncounterTemplateResolvedEntry = z.infer<
  typeof LoadEncounterTemplateResolvedEntrySchema
>;

export const LoadEncounterTemplatePayloadSchema = z.object({
  templateId: z.string().min(1),
  entries: z.array(LoadEncounterTemplateResolvedEntrySchema).min(1),
});
export type LoadEncounterTemplatePayload = z.infer<typeof LoadEncounterTemplatePayloadSchema>;
