import { z } from 'zod';

export const LeaveSessionPayloadSchema = z.object({
  userId: z.string().min(1),
});
export type LeaveSessionPayload = z.infer<typeof LeaveSessionPayloadSchema>;
