import { z } from 'zod';
import { OpenActionKindSchema } from '../open-action';

/**
 * Server-only intent — the DO emits this as a derived intent from
 * event-source intents (a damage application, a roll result, a forced
 * movement) when a class-specific or spatial condition might allow a
 * player to claim a heroic-resource gain or other rule effect.
 *
 * The reducer appends a new `OpenAction` to `state.openActions`. The
 * intent envelope's id becomes the OpenAction's `raisedByIntentId`.
 */
export const RaiseOpenActionPayloadSchema = z.object({
  kind: OpenActionKindSchema,
  participantId: z.string().min(1),
  expiresAtRound: z.number().int().nonnegative().nullable().default(null),
  payload: z.record(z.string(), z.unknown()).default({}),
});
export type RaiseOpenActionPayload = z.infer<typeof RaiseOpenActionPayloadSchema>;

/**
 * Player or active-director dispatches this to claim a pending OpenAction.
 * Reducer authorizes (owner OR active director); removes the OA; emits any
 * derived intents the kind's resolver registers. Non-blocking — there is
 * no `DismissOpenAction`; unclaimed entries auto-expire.
 */
export const ClaimOpenActionPayloadSchema = z.object({
  openActionId: z.string().min(1),
  // `choice` is a kind-specific discriminator (e.g. pray-to-the-gods may
  // surface a Yes/No; spatial triggers don't need it). Free-form for now;
  // 2b.0.1 consumers narrow it per kind.
  choice: z.string().optional(),
});
export type ClaimOpenActionPayload = z.infer<typeof ClaimOpenActionPayloadSchema>;
