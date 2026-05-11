import { z } from 'zod';

export const RespitePayloadSchema = z.object({}).strict();
export type RespitePayload = z.infer<typeof RespitePayloadSchema>;
