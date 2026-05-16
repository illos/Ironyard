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
  // Slice 2a — class-δ spatial triggers. Phase 2b 2b.16 B20 removed the
  // `spatial-trigger-null-field` kind: Null's Discipline trigger 2
  // auto-applies via MarkActionUsed (see class-triggers/per-class/null.ts)
  // and the OA detour was never wired as a raise path.
  'spatial-trigger-elementalist-essence',
  'spatial-trigger-tactician-ally-heroic',
  'spatial-trigger-troubadour-line-of-effect',
  // Slice 2a — class-internal raisers
  'pray-to-the-gods',
  'troubadour-auto-revive',
  // Phase 2b Group A+B slice 9 — Orc Relentless. Canon (Orc.md):
  // "Whenever a creature deals damage to you that leaves you dying, you can
  // make a free strike against any creature. If the creature is reduced to 0
  // Stamina by your strike, you can spend a Recovery." The raise emits the
  // affordance; the player dispatches the free strike + (optional) Recovery
  // spend manually via existing intents. UI prompt + claim handler land when
  // the OA UI grows to render this kind.
  'orc-relentless-free-strike',
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
