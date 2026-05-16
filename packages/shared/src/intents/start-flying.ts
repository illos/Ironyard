import { z } from 'zod';

// Phase 2b Group A+B (slice 6) — elective StartFlying intent for Devil /
// Dragon Knight Wings (and slice 7 — Polder Shadowmeld via `mode: 'shadow'`).
// Reducer (packages/rules/src/intents/start-flying.ts) sets
// `participant.movementMode = { mode, roundsRemaining }` where
// `roundsRemaining` derives from the PC's Might score (min 1). Player
// dispatch is gated on `staminaState ∈ {'healthy', 'winded', 'doomed'}`;
// the director can bypass via `source: 'server'`.
export const StartFlyingPayloadSchema = z.object({
  participantId: z.string().min(1),
  // 'flying' default keeps slice-6 dispatchers terse. Slice 7 (Polder
  // Shadowmeld) opts into 'shadow' explicitly.
  mode: z.enum(['flying', 'shadow']).default('flying'),
});
export type StartFlyingPayload = z.infer<typeof StartFlyingPayloadSchema>;
