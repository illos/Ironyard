import { z } from 'zod';

export const StaminaStateSchema = z.enum([
  'healthy',
  'winded',
  'dying',
  'dead',
  'unconscious',
  'inert',
  'rubble',
  'doomed',
]);
export type StaminaState = z.infer<typeof StaminaStateSchema>;

// Server-only derived intent — emitted whenever a participant's staminaState
// changes. Substrate for slice 2's class-δ triggers (Fury winded, Troubadour
// posthumous Drama) and slice 5's action effects (skull emblem on → dead).
export const StaminaTransitionedPayloadSchema = z
  .object({
    participantId: z.string().min(1),
    from: StaminaStateSchema,
    to: StaminaStateSchema,
    cause: z.enum([
      'damage',
      'heal',
      'override-applied',
      'override-cleared',
      'encounter-end',
      'recoveries-refilled',
      'recoveries-exhausted',
    ]),
  })
  .strict();
export type StaminaTransitionedPayload = z.infer<typeof StaminaTransitionedPayloadSchema>;
