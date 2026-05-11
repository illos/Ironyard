import { z } from 'zod';

// C2: payload is now empty — the encounter ID is generated server-side by the
// reducer (via ulid()). The DO no longer needs to stamp an encounterId.
export const StartEncounterPayloadSchema = z.object({});
export type StartEncounterPayload = z.infer<typeof StartEncounterPayloadSchema>;
