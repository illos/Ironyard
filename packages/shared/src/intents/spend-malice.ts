import { z } from 'zod';

// Slice 7: subtract from the Director's encounter-scoped Malice counter
// (canon §5.5). No floor — canon explicitly permits negative Malice when
// driven there by abilities (e.g. Elementalist's Sap Strength). `reason` is
// free-form for the log (e.g. "Brutal Effectiveness (3 Malice)").
export const SpendMalicePayloadSchema = z.object({
  amount: z.number().int().positive(),
  reason: z.string().max(200).optional(),
});
export type SpendMalicePayload = z.infer<typeof SpendMalicePayloadSchema>;
