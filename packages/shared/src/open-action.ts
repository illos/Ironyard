import { z } from 'zod';

/**
 * Open Action kinds. Pass 3 Slice 1 adds the first real kind.
 * Each new kind extends this enum; the OpenActionSchema validator picks
 * them up automatically.
 *
 * Pass 3 Slice 1
 */
export const OpenActionKindSchema = z.enum([
  // Pass 3 Slice 1
  'title-doomed-opt-in',
  // Slice 2 entries (added when slice 2 lands):
  //   'pray-to-the-gods'
  //   'spatial-trigger-elementalist-essence'
  //   ...
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
