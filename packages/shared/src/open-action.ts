import { z } from 'zod';

/**
 * Open Action kinds. Empty in 2b.0 — first entries (pray-to-the-gods,
 * the four spatial triggers, etc.) are added by 2b.0.1 alongside their
 * raisers and copy registry entries. Each new kind extends this enum;
 * the OpenActionSchema validator picks them up automatically.
 *
 * Zod's `z.enum` requires a non-empty tuple, so a `__sentinel_2b_0__`
 * placeholder ships here in 2b.0. The first kind-add commit in 2b.0.1
 * MUST remove the sentinel as it replaces it with the real first kind.
 */
export const OpenActionKindSchema = z.enum([
  '__sentinel_2b_0__',
]);

export type OpenActionKind = z.infer<typeof OpenActionKindSchema>;

/**
 * A single open-action queue entry. Non-blocking: visible to every user
 * in the lobby, claimable only by the targeted participant's owner or the
 * active director. Unclaimed entries auto-expire when `expiresAtRound` is
 * reached (or at EndEncounter unconditionally). See 2b.0 spec §2.
 */
export const OpenActionSchema = z.object({
  id: z.string().min(1),
  kind: OpenActionKindSchema,
  participantId: z.string().min(1),
  raisedAtRound: z.number().int().nonnegative(),
  raisedByIntentId: z.string().min(1),
  expiresAtRound: z.number().int().nonnegative().nullable(),
  payload: z.record(z.string(), z.unknown()),
});

export type OpenAction = z.infer<typeof OpenActionSchema>;
