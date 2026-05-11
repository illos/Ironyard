import { z } from 'zod';

// Phase 1 cleanup: closes the active encounter. Resets every encounter-scoped
// pool on every participant (heroicResources, extras, surges), wipes Director's
// Malice, and removes conditions whose duration is `end_of_encounter`.
// Recoveries do NOT reset here (canon §2.13 — respite-only).
export const EndEncounterPayloadSchema = z.object({
  encounterId: z.string().min(1),
});
export type EndEncounterPayload = z.infer<typeof EndEncounterPayloadSchema>;
