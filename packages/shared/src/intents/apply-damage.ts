import { z } from 'zod';
import { DamageTypeSchema } from '../damage';

// ApplyDamage is server-only — emitted by the reducer as a derived intent.
// Clients that dispatch it directly are rejected with 'permission'.
// Pass 3 Slice 1: `intent` field selects between standard damage application
// ('kill') and the §2.9 knock-out interception ('knock-out'). Defaulting to
// 'kill' preserves pre-slice-1 dispatch behavior.
export const ApplyDamagePayloadSchema = z.object({
  targetId: z.string().min(1),
  amount: z.number().int().min(0),
  damageType: DamageTypeSchema,
  sourceIntentId: z.string().min(1),
  intent: z.enum(['kill', 'knock-out']).default('kill'),
  // Pass 3 Slice 2a: when true, the reducer skips immunity reduction and
  // weakness addition ("cannot be reduced" semantics — e.g. Conduit's
  // Pray-on-1 outcome and future sources). Default false preserves
  // pre-slice-2a behavior.
  bypassDamageReduction: z.boolean().optional().default(false),
  // Pass 3 Slice 2a — pre-rolled 1d3 for the Fury Ferocity stamina-transition
  // trigger (first-time winded / first-time dying). The reducer is pure
  // (no Math.random — see reducer.ts header), so the impure boundary —
  // currently the client — pre-rolls and supplies the value on the payload,
  // matching the slice-1 `rolledD10` precedent on RollInitiative.
  //
  // Required only when this ApplyDamage will trigger the Fury Ferocity
  // entry (i.e. target is a Fury PC with latch unflipped and transitions
  // to winded or dying). If omitted in such a case the trigger evaluator
  // throws to surface the missing roll at the call site. Optional / undefined
  // for the common case of monsters and non-Fury PCs.
  ferocityD3: z.number().int().min(1).max(3).optional(),
});
export type ApplyDamagePayload = z.infer<typeof ApplyDamagePayloadSchema>;
