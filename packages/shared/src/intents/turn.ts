import { z } from 'zod';

export const StartRoundPayloadSchema = z.object({}).strict();
export type StartRoundPayload = z.infer<typeof StartRoundPayloadSchema>;

export const EndRoundPayloadSchema = z.object({}).strict();
export type EndRoundPayload = z.infer<typeof EndRoundPayloadSchema>;

export const StartTurnPayloadSchema = z.object({
  participantId: z.string().min(1),
});
export type StartTurnPayload = z.infer<typeof StartTurnPayloadSchema>;

export const EndTurnPayloadSchema = z.object({}).strict();
export type EndTurnPayload = z.infer<typeof EndTurnPayloadSchema>;

export const SetInitiativePayloadSchema = z.object({
  order: z.array(z.string().min(1)),
});
export type SetInitiativePayload = z.infer<typeof SetInitiativePayloadSchema>;
