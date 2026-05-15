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
  // Slice 2a — class-δ spatial triggers
  'spatial-trigger-elementalist-essence',
  'spatial-trigger-tactician-ally-heroic',
  'spatial-trigger-null-field',
  'spatial-trigger-troubadour-line-of-effect',
  // Slice 2a — class-internal raisers
  'pray-to-the-gods',
  'troubadour-auto-revive',
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
