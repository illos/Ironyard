import { z } from 'zod';
import { ParticipantStateOverrideSchema } from '../stamina-override';

export const ApplyParticipantOverridePayloadSchema = z
  .object({
    participantId: z.string().min(1),
    override: ParticipantStateOverrideSchema,
  })
  .strict();
export type ApplyParticipantOverridePayload = z.infer<typeof ApplyParticipantOverridePayloadSchema>;
