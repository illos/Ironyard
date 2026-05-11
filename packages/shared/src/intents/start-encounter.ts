import { z } from 'zod';
import { CharacterSchema } from '../character';

// D4: Pre-resolved PC blobs stamped onto the payload by the DO before dispatch.
// One entry per PC placeholder currently in the roster. The DO reads
// characters.name + characters.data from D1 and stamps them here so the
// pure reducer never does I/O.
export const StartEncounterStampedPcSchema = z.object({
  characterId: z.string().min(1),
  ownerId: z.string().min(1),
  name: z.string().min(1), // from characters.name column (not data blob)
  character: CharacterSchema, // full blob, stamped by DO from D1
});
export type StartEncounterStampedPc = z.infer<typeof StartEncounterStampedPcSchema>;

// C2: the reducer generates the canonical encounter id via ulid(). Clients
// may still send a suggested encounterId for optimistic local-state
// reflection; the reducer ignores it. Kept optional to avoid forcing a
// frontend rewrite during the campaigns restructure — the prototype UI's
// optimistic ActiveEncounter shadow uses it. Frontend follow-on plan removes
// this entirely.
export const StartEncounterPayloadSchema = z.object({
  encounterId: z.string().min(1).optional(),
  // D4: DO stamps the PC character blobs here before dispatch. Optional/defaults
  // to [] so existing callers (tests, early UI) don't need to change right away.
  stampedPcs: z.array(StartEncounterStampedPcSchema).optional().default([]),
});
export type StartEncounterPayload = z.infer<typeof StartEncounterPayloadSchema>;
