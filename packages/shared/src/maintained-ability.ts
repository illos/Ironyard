import { z } from 'zod';

// An ability being actively maintained by an Elementalist. Cost is deducted
// at start-of-turn after the per-turn gain; auto-drops if the deduction would
// drive essence negative. See slice 2a spec § Elementalist Maintenance.
//
// Phase 2b 2b.16 B14 — `targetId` distinguishes parallel maintenances of the
// same ability on different targets. Canon Elementalist.md:145: "If you
// maintain the same ability on several targets and the effect includes a
// power roll, you make that roll once and apply the same effect to all
// targets." `null` means "no per-target binding" (effect is positional, has
// no targets, or the ability author hasn't supplied one). Reducer dedup is
// on (abilityId, targetId) pairs — `targetId: null` still dedupes against
// another `null` of the same abilityId.
export const MaintainedAbilitySchema = z
  .object({
    abilityId: z.string().min(1),
    targetId: z.string().min(1).nullable().default(null),
    costPerTurn: z.number().int().min(1),
    startedAtRound: z.number().int().min(1),
  })
  .strict();
export type MaintainedAbility = z.infer<typeof MaintainedAbilitySchema>;
