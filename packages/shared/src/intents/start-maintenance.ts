import { z } from 'zod';

export const StartMaintenancePayloadSchema = z
  .object({
    participantId: z.string().min(1),
    abilityId: z.string().min(1),
    costPerTurn: z.number().int().min(1),
  })
  .strict();
export type StartMaintenancePayload = z.infer<typeof StartMaintenancePayloadSchema>;
