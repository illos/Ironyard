import { z } from 'zod';

export const StartRoundPayloadSchema = z.object({}).strict();
export type StartRoundPayload = z.infer<typeof StartRoundPayloadSchema>;

export const EndRoundPayloadSchema = z.object({}).strict();
export type EndRoundPayload = z.infer<typeof EndRoundPayloadSchema>;

export const StartTurnPayloadSchema = z.object({
  participantId: z.string().min(1),
  rolls: z.object({
    d3: z.number().int().min(1).max(3),
  }).optional(),
});
export type StartTurnPayload = z.infer<typeof StartTurnPayloadSchema>;

// Slice 6: optional `saveRolls` carries one d10 per `save_ends` condition on the
// ending creature, ordered by the condition's `appliedAtSeq`. The engine emits
// one derived `RollResistance` per save when this is present. Missing or
// wrong-length ⇒ the engine logs `manual_override_required` per save and skips
// the auto-fire so the table can roll manually (canon-gate idiom).
export const EndTurnPayloadSchema = z
  .object({
    saveRolls: z.array(z.number().int().min(1).max(10)).optional(),
  })
  .strict();
export type EndTurnPayload = z.infer<typeof EndTurnPayloadSchema>;

export const SetInitiativePayloadSchema = z.object({
  order: z.array(z.string().min(1)),
});
export type SetInitiativePayload = z.infer<typeof SetInitiativePayloadSchema>;
