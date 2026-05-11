import { z } from 'zod';
import { CharacteristicsSchema } from './characteristic';
import { ConditionInstanceSchema } from './condition';
import { TypedResistanceSchema } from './damage';
import { ExtraResourceInstanceSchema, HeroicResourceInstanceSchema } from './resource';

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
  // currentStamina ≥ 0 in slice 3 but heroes can go negative when dying per
  // canon §2.8. The healing intent reads `currentStamina` straight; we don't
  // tighten or loosen the constraint here in slice 7.
  currentStamina: z.number().int().min(0),
  maxStamina: z.number().int().min(1),
  characteristics: CharacteristicsSchema,
  immunities: z.array(TypedResistanceSchema).default([]),
  weaknesses: z.array(TypedResistanceSchema).default([]),
  // Slice 5: conditions live on the participant as data. Slice 6 wires hooks
  // (Bleeding damage, edge/bane contributions, action gating) into the reducer.
  conditions: z.array(ConditionInstanceSchema).default([]),
  // Slice 7: heroic resource pools. Each participant carries ≤ 1 instance per
  // canon heroic resource name (typed registry — rules-canon §5.4.9). Talent's
  // Clarity is the only resource that can have a negative `floor`. Free-form
  // extras (e.g. Censor Virtue, Conduit Divine Power at 10th level, homebrew)
  // live in `extras` so the type system stays clean for the canon-fixed nine.
  heroicResources: z.array(HeroicResourceInstanceSchema).default([]),
  extras: z.array(ExtraResourceInstanceSchema).default([]),
  // Slice 7: universal surges pool (canon §5.6). Floor 0, no ceiling. Reset to
  // 0 at end of encounter (handled by future EndEncounter intent).
  surges: z.number().int().min(0).default(0),
  // Slice 7: recoveries pool (canon §2.13). `SpendRecovery` consumes 1 and
  // dispatches a derived `ApplyHeal { amount: recoveryValue }` capped at
  // maxStamina. The dispatcher / character sheet computes `recoveryValue`
  // (typically maxStamina/3 rounded down); the engine doesn't derive it.
  recoveries: z
    .object({
      current: z.number().int().min(0),
      max: z.number().int().min(0),
    })
    .default({ current: 0, max: 0 }),
  recoveryValue: z.number().int().min(0).default(0),
});
export type Participant = z.infer<typeof ParticipantSchema>;
