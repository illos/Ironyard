import { z } from 'zod';
import { IntentSchema } from './intent';

const SeqSchema = z.number().int().nonnegative();

// Anything received from the client over the WebSocket.
// Per pre-Phase-0 #1, `sync` keys on the seq high-water mark, not an intent id.
export const ClientMsgSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('dispatch'),
    intent: IntentSchema,
  }),
  z.object({
    kind: z.literal('sync'),
    sinceSeq: SeqSchema,
  }),
  z.object({
    kind: z.literal('ping'),
  }),
]);
export type ClientMsg = z.infer<typeof ClientMsgSchema>;

// Anything broadcast from the DO over the WebSocket.
// `state` on `applied` is a partial patch; `snapshot.state` is full SessionState.
// Both stay `z.unknown()` until Phase 1 produces a SessionStateSchema.
export const ServerMsgSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('applied'),
    intent: IntentSchema,
    seq: SeqSchema,
    state: z.unknown().optional(),
  }),
  z.object({
    kind: z.literal('rejected'),
    intentId: z.string().min(1),
    reason: z.string().min(1),
  }),
  z.object({
    kind: z.literal('snapshot'),
    state: z.unknown(),
    seq: SeqSchema,
  }),
  z.object({
    kind: z.literal('pong'),
  }),
]);
export type ServerMsg = z.infer<typeof ServerMsgSchema>;
