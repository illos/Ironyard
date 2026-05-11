import { z } from 'zod';

// Client sends: { userId }
// DO stamps: { participantIdsToRemove, placeholderCharacterIdsToRemove } —
// participantIdsToRemove: participant IDs of any of the kicked user's full
//   Participants (pc kind) currently on the roster.
// placeholderCharacterIdsToRemove: characterIds of any pc-placeholder entries
//   owned by the kicked user (added by BringCharacterIntoEncounter before an
//   encounter starts).
export const KickPlayerPayloadSchema = z.object({
  userId: z.string().min(1),
  participantIdsToRemove: z.array(z.string().min(1)), // stamped by DO
  placeholderCharacterIdsToRemove: z.array(z.string().min(1)).default([]), // stamped by DO
});
export type KickPlayerPayload = z.infer<typeof KickPlayerPayloadSchema>;
