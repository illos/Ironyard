import { z } from 'zod';

export const StartMaintenancePayloadSchema = z
  .object({
    participantId: z.string().min(1),
    abilityId: z.string().min(1),
    // Phase 2b 2b.16 B14 — optional per-target binding so the same ability
    // can be maintained on multiple targets simultaneously (canon
    // Elementalist.md:145). `null` = no per-target binding.
    targetId: z.string().min(1).nullable().default(null),
    costPerTurn: z.number().int().min(1),
  })
  .strict();
export type StartMaintenancePayload = z.infer<typeof StartMaintenancePayloadSchema>;
