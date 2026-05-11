import { z } from 'zod';
import { CharacteristicsSchema } from './characteristic';
import { ConditionInstanceSchema } from './condition';
import { TypedResistanceSchema } from './damage';

// Quick stat block. Phase 1 ships PCs as form-built blocks; later phases swap
// PCs in by character id from the D1 `characters` table, but the in-encounter
// representation stays this shape.
export const ParticipantSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(['pc', 'monster']),
  currentStamina: z.number().int().min(0),
  maxStamina: z.number().int().min(1),
  characteristics: CharacteristicsSchema,
  immunities: z.array(TypedResistanceSchema).default([]),
  weaknesses: z.array(TypedResistanceSchema).default([]),
  // Slice 5: conditions live on the participant as data. The hook system
  // (Bleeding damage, edge/bane contributions, action gating) lands in slice 6.
  // Payloads that omit this field still parse — slice-3 fixtures don't need
  // to change.
  conditions: z.array(ConditionInstanceSchema).default([]),
});
export type Participant = z.infer<typeof ParticipantSchema>;
