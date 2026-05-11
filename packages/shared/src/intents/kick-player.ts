import { z } from 'zod';

// Client sends: { userId }
// DO stamps: { participantIdsToRemove } — the participant IDs of any of the
// kicked user's characters currently on the roster (looked up via campaign_characters).
export const KickPlayerPayloadSchema = z.object({
  userId: z.string().min(1),
  participantIdsToRemove: z.array(z.string().min(1)), // stamped by DO
});
export type KickPlayerPayload = z.infer<typeof KickPlayerPayloadSchema>;
