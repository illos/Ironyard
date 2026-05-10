import { z } from 'zod';
import { ActorSchema } from './actor';

export const IntentSourceSchema = z.enum(['auto', 'manual']);
export type IntentSource = z.infer<typeof IntentSourceSchema>;

// Phase 0 keeps the type discriminator open; Phase 1 narrows it to a literal
// union once the full intent taxonomy in packages/shared/src/intents.ts lands.
export const IntentTypeSchema = z.string().min(1);
export type IntentType = z.infer<typeof IntentTypeSchema>;

// Per intent-protocol.md, the DO sets timestamp on receive — clients dispatch
// without it. We accept both shapes here; Phase 1 will split this into a
// stricter wire-side `IntentDispatchSchema` if the asymmetry starts to bite.
export const IntentSchema = z.object({
  id: z.string().min(1), // ULID, generated client-side
  sessionId: z.string().min(1),
  actor: ActorSchema,
  timestamp: z.number().int().nonnegative().optional(),
  source: IntentSourceSchema,
  type: IntentTypeSchema,
  payload: z.unknown(), // Phase 1: narrowed per-intent-type via a discriminated union
  causedBy: z.string().min(1).optional(),
});
export type Intent = z.infer<typeof IntentSchema>;
