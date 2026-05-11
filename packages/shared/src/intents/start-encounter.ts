import { z } from 'zod';

export const StartEncounterPayloadSchema = z.object({
  encounterId: z.string().min(1),
});
export type StartEncounterPayload = z.infer<typeof StartEncounterPayloadSchema>;
