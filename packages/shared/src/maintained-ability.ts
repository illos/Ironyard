import { z } from 'zod';

// An ability being actively maintained by an Elementalist. Cost is deducted
// at start-of-turn after the per-turn gain; auto-drops if the deduction would
// drive essence negative. See slice 2a spec § Elementalist Maintenance.
export const MaintainedAbilitySchema = z.object({
  abilityId: z.string().min(1),
  costPerTurn: z.number().int().min(1),
  startedAtRound: z.number().int().min(1),
}).strict();
export type MaintainedAbility = z.infer<typeof MaintainedAbilitySchema>;
