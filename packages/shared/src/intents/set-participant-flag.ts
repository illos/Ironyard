import { z } from 'zod';
import { PerEncounterLatchesSchema } from '../per-encounter-flags';

// Pass 3 Slice 2a — server-only support intents emitted by class-trigger
// subscribers (see packages/rules/src/class-triggers). These write small,
// targeted flags onto a participant — no derived cascade, no log noise.
// Player-trust: server-only (only the engine/derived-intent pipeline raises
// them). The lobby envelope rejects client dispatch via SERVER_ONLY_INTENTS.

export const SetParticipantPerEncounterLatchPayloadSchema = z
  .object({
    participantId: z.string().min(1),
    key: PerEncounterLatchesSchema.keyof(),
    value: z.boolean(),
  })
  .strict();
export type SetParticipantPerEncounterLatchPayload = z.infer<
  typeof SetParticipantPerEncounterLatchPayloadSchema
>;

export const SetParticipantPosthumousDramaEligiblePayloadSchema = z
  .object({
    participantId: z.string().min(1),
    value: z.boolean(),
  })
  .strict();
export type SetParticipantPosthumousDramaEligiblePayload = z.infer<
  typeof SetParticipantPosthumousDramaEligiblePayloadSchema
>;
