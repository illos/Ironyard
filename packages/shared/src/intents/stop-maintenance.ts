import { z } from 'zod';

export const StopMaintenancePayloadSchema = z.object({
  participantId: z.string().min(1),
  abilityId: z.string().min(1),
}).strict();
export type StopMaintenancePayload = z.infer<typeof StopMaintenancePayloadSchema>;
