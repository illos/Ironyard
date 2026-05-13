import { z } from 'zod';

// Client sends: { userId }
// DO stamps: { participantIdsToRemove } — participant IDs of the kicked user's
// full Participants (pc kind) currently on the roster.
export const KickPlayerPayloadSchema = z.object({
  userId: z.string().min(1),
  participantIdsToRemove: z.array(z.string().min(1)), // stamped by DO
});
export type KickPlayerPayload = z.infer<typeof KickPlayerPayloadSchema>;
