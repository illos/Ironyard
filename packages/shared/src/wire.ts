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

const MemberSchema = z.object({
  userId: z.string().min(1),
  displayName: z.string().min(1),
});
export type Member = z.infer<typeof MemberSchema>;

// Anything broadcast from the DO over the WebSocket.
// `state` on `applied` is a partial patch; `snapshot.state` is full SessionState.
// Both stay `z.unknown()` until Phase 1 produces a SessionStateSchema.
// member_joined / member_left / member_list are Phase 0 lobby presence and
// will likely consolidate into a single derived view once the reducer ships.
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
  z.object({
    kind: z.literal('member_joined'),
    member: MemberSchema,
  }),
  z.object({
    kind: z.literal('member_left'),
    member: MemberSchema,
  }),
  z.object({
    kind: z.literal('member_list'),
    members: z.array(MemberSchema),
  }),
]);
export type ServerMsg = z.infer<typeof ServerMsgSchema>;
