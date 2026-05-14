import { z } from 'zod';

// Director-only. Adjust the attending-character list mid-session for late
// arrivals or early departures. Does NOT auto-grant or revoke hero tokens —
// canon ties tokens to session-start. Director uses GainHeroToken explicitly
// if they want to be generous. At least one of add/remove must be present.
export const UpdateSessionAttendancePayloadSchema = z
  .object({
    add: z.array(z.string().min(1)).optional(),
    remove: z.array(z.string().min(1)).optional(),
  })
  .refine((p) => (p.add && p.add.length > 0) || (p.remove && p.remove.length > 0), {
    message: 'must specify at least one of add or remove',
  });
export type UpdateSessionAttendancePayload = z.infer<typeof UpdateSessionAttendancePayloadSchema>;
