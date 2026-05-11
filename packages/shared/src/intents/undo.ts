import { z } from 'zod';

export const UndoPayloadSchema = z.object({
  intentId: z.string().min(1),
});
export type UndoPayload = z.infer<typeof UndoPayloadSchema>;
