import { z } from 'zod';
import { CharacteristicSchema } from '../characteristic';
import { ConditionApplicationDispatchSchema } from '../condition';
import { DamageTypeSchema } from '../damage';

const d10 = z.number().int().min(1).max(10);

const TierEffectSchema = z.object({
  damage: z.number().int().min(0),
  damageType: DamageTypeSchema,
  // Conditions to auto-apply on this tier landing. CombatRun's buildLadder
  // populates from `Ability.powerRoll.tierN.conditions` (filtered to
  // scope='target'); the engine derives one SetCondition per entry per
  // target. Default [] keeps slice-3 RollPower payloads valid.
  conditions: z.array(ConditionApplicationDispatchSchema).default([]),
});

// Phase 1 slice 3: the ability's tier ladder lives in the payload. Slice 4+
// moves to ability-registry lookup, at which point the engine reads the ladder
// from data instead of the wire.
export const RollPowerPayloadSchema = z.object({
  abilityId: z.string().min(1),
  attackerId: z.string().min(1),
  targetIds: z.array(z.string().min(1)).min(1),
  characteristic: CharacteristicSchema,
  edges: z.number().int().min(0).max(2),
  banes: z.number().int().min(0).max(2),
  rolls: z.object({
    d10: z.tuple([d10, d10]),
  }),
  ladder: z.object({
    t1: TierEffectSchema,
    t2: TierEffectSchema,
    t3: TierEffectSchema,
  }),
  // Slice 6: optional d6 used by the Bleeding hook (canon §3.5.1 — `1d6 + level`
  // when the actor has Bleeding and uses an action / triggered action /
  // Might-or-Agility roll). Dispatchers pre-roll this iff the actor has
  // Bleeding; absent ⇒ engine logs `manual_override_required` and skips auto
  // damage so the table can roll manually.
  bleedingD6: z.number().int().min(1).max(6).optional(),
  // Slice 6 / Epic 2C § 10.8: the ability's keywords (lowercased or original-cased
  // per AbilitySchema). The engine inspects these for `Weapon` + (`Melee`/`Ranged`)
  // to decide whether the attacker's `weaponDamageBonus[slot][tier - 1]` adds
  // to the tier outcome. Default [] keeps older payloads parseable — those just
  // skip the kit-bonus fold.
  abilityKeywords: z.array(z.string()).default([]),
  // Phase 5 Pass 2a — ability type lets the reducer auto-emit MarkActionUsed
  // for the right Turn-flow slot. Optional for back-compat: legacy / test
  // payloads without it simply skip the derived intent.
  abilityType: z
    .enum(['action', 'maneuver', 'triggered', 'free-triggered', 'villain', 'trait'])
    .optional(),
  // Phase 5 Pass 2a — human-readable ability name for toast attribution.
  // Optional for back-compat: legacy payloads fall back to abilityId.
  abilityName: z.string().optional(),
  // Pass 3 Slice 2a — number of surges the actor spent to fuel this power roll
  // (canon § 5.6). Dispatchers pass a non-zero value when the actor opted to
  // spend surges as part of the ability resolution (Strained ability fueling,
  // optional surge-boost on a regular ability, etc.). The reducer uses this to
  // emit the `surge-spent-with-damage` action-trigger event so Shadow's
  // Insight gain (canon § 5.4.6) can fire. Default 0 keeps legacy payloads
  // valid (no surges spent ⇒ no Shadow trigger).
  surgesSpent: z.number().int().min(0).default(0),
});
export type RollPowerPayload = z.infer<typeof RollPowerPayloadSchema>;
