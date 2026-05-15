import { z } from 'zod';
import { DamageTypeSchema } from './damage';

// Per-trait override of the canonical stamina state machine. Each variant
// intercepts a specific transition (or asserts an additional entry predicate)
// so that Revenant inert / Hakaan rubble / Hakaan doomed / Title Doomed /
// Curse of Punishment all flow through one mechanism instead of N one-off
// special cases. See docs/superpowers/specs/2026-05-15-pass-3-slice-1-...
export const ParticipantStateOverrideSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('inert'),
    source: z.literal('revenant'),
    instantDeathDamageTypes: z.array(DamageTypeSchema).default([]),
    regainHours: z.number().int().min(0).default(12),
    regainAmount: z.literal('recoveryValue'),
  }),
  z.object({
    kind: z.literal('rubble'),
    source: z.literal('hakaan-doomsight'),
    regainHours: z.number().int().min(0).default(12),
    regainAmount: z.literal('recoveryValue'),
  }),
  z.object({
    kind: z.literal('doomed'),
    source: z.enum(['hakaan-doomsight', 'title-doomed', 'manual']),
    canRegainStamina: z.boolean(),
    autoTier3OnPowerRolls: z.boolean(),
    staminaDeathThreshold: z.enum(['none', 'staminaMax']),
    dieAtEncounterEnd: z.boolean(),
  }),
  z.object({
    kind: z.literal('extra-dying-trigger'),
    source: z.literal('curse-of-punishment'),
    predicate: z.literal('recoveries-exhausted'),
  }),
]);
export type ParticipantStateOverride = z.infer<typeof ParticipantStateOverrideSchema>;
