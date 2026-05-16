import { z } from 'zod';
import { PerEncounterLatchesSchema, PerRoundFlagsSchema, PerTurnFlagKeySchema } from '../per-encounter-flags';

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

export const SetParticipantPerRoundFlagPayloadSchema = z
  .object({
    participantId: z.string().min(1),
    key: PerRoundFlagsSchema.keyof(),
    value: z.boolean(),
  })
  .strict();
export type SetParticipantPerRoundFlagPayload = z.infer<
  typeof SetParticipantPerRoundFlagPayloadSchema
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

// Per-turn entries are scoped to a specific participant's turn (via
// `scopedToTurnOf`) and reset at that participant's EndTurn. Multiple keys
// can co-exist per `scopedToTurnOf`; (scopedToTurnOf, key) is unique within
// the participant's entries — the reducer dedupes on that pair.
export const SetParticipantPerTurnEntryPayloadSchema = z
  .object({
    participantId: z.string().min(1),
    scopedToTurnOf: z.string().min(1),
    key: PerTurnFlagKeySchema,
    value: z.union([z.boolean(), z.number(), z.array(z.string())]),
  })
  .strict();
export type SetParticipantPerTurnEntryPayload = z.infer<
  typeof SetParticipantPerTurnEntryPayloadSchema
>;
