import { z } from 'zod';

export const ClearParticipantOverridePayloadSchema = z.object({
  participantId: z.string().min(1),
}).strict();
export type ClearParticipantOverridePayload = z.infer<typeof ClearParticipantOverridePayloadSchema>;
