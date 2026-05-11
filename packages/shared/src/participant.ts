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
  // Slice 6: `level` feeds Bleeding's `1d6 + level` damage (rules-canon §3.5.1)
  // and other level-scaled effects. Range mirrors MonsterSchema (0..20) so the
  // PC and monster shapes share one source of truth. Defaults to 1 so existing
  // payloads that omit the field still parse — slice-5 fixtures don't change.
  level: z.number().int().min(0).max(20).default(1),
  currentStamina: z.number().int().min(0),
  maxStamina: z.number().int().min(1),
  characteristics: CharacteristicsSchema,
  immunities: z.array(TypedResistanceSchema).default([]),
  weaknesses: z.array(TypedResistanceSchema).default([]),
  // Slice 5: conditions live on the participant as data. Slice 6 wires hooks
  // (Bleeding damage, edge/bane contributions, action gating) into the reducer.
  conditions: z.array(ConditionInstanceSchema).default([]),
});
export type Participant = z.infer<typeof ParticipantSchema>;
