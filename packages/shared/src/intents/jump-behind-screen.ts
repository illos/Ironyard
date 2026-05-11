import { z } from 'zod';

// Client sends: {} — actor identity carries the request.
// DO stamps: { permitted } from D1 is_director lookup.
export const JumpBehindScreenPayloadSchema = z.object({
  permitted: z.boolean(),
});
export type JumpBehindScreenPayload = z.infer<typeof JumpBehindScreenPayloadSchema>;
