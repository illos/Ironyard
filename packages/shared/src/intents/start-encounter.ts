import { z } from 'zod';

// C2: the reducer generates the canonical encounter id via ulid(). Clients
// may still send a suggested encounterId for optimistic local-state
// reflection; the reducer ignores it. Kept optional to avoid forcing a
// frontend rewrite during the campaigns restructure — the prototype UI's
// optimistic ActiveEncounter shadow uses it. Frontend follow-on plan removes
// this entirely.
export const StartEncounterPayloadSchema = z.object({
  encounterId: z.string().min(1).optional(),
});
export type StartEncounterPayload = z.infer<typeof StartEncounterPayloadSchema>;
