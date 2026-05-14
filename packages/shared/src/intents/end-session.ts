import { z } from 'zod';

// Director-only. Closes the active session. Reducer reads currentSessionId
// from state; no payload data needed. Strict — rejects unexpected fields.
export const EndSessionPayloadSchema = z.object({}).strict();
export type EndSessionPayload = z.infer<typeof EndSessionPayloadSchema>;
