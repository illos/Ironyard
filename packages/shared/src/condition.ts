import { z } from 'zod';

// Draw Steel has exactly 9 conditions (rules-canon.md §3.1). The set is closed —
// class-specific statuses like the Talent's Strained are deliberately *not* here.
// Pass 3 Slice 1: `Unconscious` added as an engine-managed condition applied by
// the KO-interception path (`applyKnockOut`). Not a player-dispatchable condition;
// removed when the participant regains consciousness.
export const CONDITION_TYPES = [
  'Bleeding',
  'Dazed',
  'Frightened',
  'Grabbed',
  'Prone',
  'Restrained',
  'Slowed',
  'Taunted',
  'Unconscious',
  'Weakened',
] as const;

export const ConditionTypeSchema = z.enum(CONDITION_TYPES);
export type ConditionType = z.infer<typeof ConditionTypeSchema>;

// Duration variants per rules-canon.md §3.2. `trigger` carries a free-form
// description for slice-5 data-only purposes; slice 6's hook system will wire
// triggers to actual end conditions.
// Pass 3 Slice 1: `manual` added for engine-managed conditions that have no
// automatic expiry (dying-induced Bleeding, KO-applied Unconscious). These are
// cleared explicitly by reducer logic (recover from dying, KnockUnconscious lift).
export const ConditionDurationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('EoT') }),
  z.object({ kind: z.literal('save_ends') }),
  z.object({ kind: z.literal('until_start_next_turn'), ownerId: z.string().min(1) }),
  z.object({ kind: z.literal('end_of_encounter') }),
  z.object({ kind: z.literal('manual') }),
  z.object({ kind: z.literal('trigger'), description: z.string().min(1).max(200) }),
]);
export type ConditionDuration = z.infer<typeof ConditionDurationSchema>;

// A condition is imposed by either a creature (e.g. a grabber) or an effect
// (e.g. a spell). The id is the participant id or the source intent / ability id.
export const ConditionSourceSchema = z.object({
  kind: z.enum(['creature', 'effect']),
  id: z.string().min(1),
});
export type ConditionSource = z.infer<typeof ConditionSourceSchema>;

// One imposition of a condition on a participant. `removable: false` is reserved
// for slice-6's dying-induced Bleeding (rules-canon.md §3.5.1); slice 5 always
// emits removable instances. `appliedAtSeq` is the reducer seq at apply time so
// the undo / log layer can order ties.
export const ConditionInstanceSchema = z.object({
  type: ConditionTypeSchema,
  source: ConditionSourceSchema,
  duration: ConditionDurationSchema,
  appliedAtSeq: z.number().int().nonnegative(),
  removable: z.boolean().default(true),
});
export type ConditionInstance = z.infer<typeof ConditionInstanceSchema>;

// What the data parser emits for each condition mention found inside a tier
// outcome's effect text. `scope: 'other'` means the condition applied to a
// non-primary target (multi-target wording like "two targets are Slowed" or
// "all enemies within 3"); the engine leaves those for manual handling. The
// `note` field carries flavor the regex didn't structurally extract: the
// potency-test prefix ("A < 2"), scope qualifier, or numeric rating on
// Bleeding.
export const ConditionApplicationOutcomeSchema = z.object({
  condition: ConditionTypeSchema,
  duration: ConditionDurationSchema,
  scope: z.enum(['target', 'other']),
  note: z.string().optional(),
});
export type ConditionApplicationOutcome = z.infer<typeof ConditionApplicationOutcomeSchema>;

// Wire-side dispatch shape, carried inside a RollPower ladder's tier effect.
// CombatRun filters the data-side `scope` to 'target' before building this
// (so the engine never auto-applies multi-target conditions); the data-side
// `note` is dropped since the engine doesn't read it.
export const ConditionApplicationDispatchSchema = z.object({
  condition: ConditionTypeSchema,
  duration: ConditionDurationSchema,
});
export type ConditionApplicationDispatch = z.infer<typeof ConditionApplicationDispatchSchema>;
