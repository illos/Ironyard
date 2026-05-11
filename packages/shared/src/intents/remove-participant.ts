import { z } from 'zod';

export const RemoveParticipantPayloadSchema = z.object({
  participantId: z.string().min(1),
});
export type RemoveParticipantPayload = z.infer<typeof RemoveParticipantPayloadSchema>;
