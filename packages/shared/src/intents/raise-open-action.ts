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
 *
 * `choice` is a kind-specific discriminator. Pre-slice-2a it was a free-form
 * string; slice 2a extends it to an object so the Conduit Pray-to-the-Gods
 * claim can carry the pre-rolled 1d3 (and the conditional 1d6 damage roll
 * when `prayD3 === 1`). String form retained for backwards compatibility
 * and for future kinds that only need a small enum.
 */
export const ClaimOpenActionChoiceSchema = z
  .object({
    // Conduit Pray-to-the-Gods: pre-rolled 1d3 (1 = take damage + piety, 2 = piety only, 3 = double piety + domain effect).
    prayD3: z.number().int().min(1).max(3).optional(),
    // Conduit Pray-to-the-Gods (prayD3 === 1): pre-rolled 1d6 — psychic damage = d6 + level, bypasses damage reduction.
    prayDamage: z.object({ d6: z.number().int().min(1).max(6) }).optional(),
  })
  .strict();
export type ClaimOpenActionChoice = z.infer<typeof ClaimOpenActionChoiceSchema>;

export const ClaimOpenActionPayloadSchema = z.object({
  openActionId: z.string().min(1),
  choice: z.union([z.string(), ClaimOpenActionChoiceSchema]).optional(),
});
export type ClaimOpenActionPayload = z.infer<typeof ClaimOpenActionPayloadSchema>;
