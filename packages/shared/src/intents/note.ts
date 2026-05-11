import { z } from 'zod';

export const NotePayloadSchema = z.object({
  text: z.string().min(1).max(2000),
});
export type NotePayload = z.infer<typeof NotePayloadSchema>;
