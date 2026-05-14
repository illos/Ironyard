import { z } from 'zod';

// Director-only. Opens a new play session, declares attending characters,
// initializes the hero token pool. Rejects if a session is already active or
// if any attendingCharacterId references a non-approved character (the latter
// is validated by the DO stamper against D1; the schema enforces shape only).
//
// `sessionId` is an optional client-suggested id (same pattern as
// StartEncounter's `encounterId?`). If absent the reducer generates one via
// ulid(). The client SHOULD generate it ahead of time so the optimistic
// mirror in useSessionSocket can set `currentSessionId` directly from the
// applied envelope without waiting for a snapshot.
//
// See docs/superpowers/specs/2026-05-13-phase-2-epic-2e-sessions-design.md.
export const StartSessionPayloadSchema = z.object({
  sessionId: z.string().min(1).optional(),
  name: z.string().min(1).max(120).optional(),
  attendingCharacterIds: z.array(z.string().min(1)).min(1),
  heroTokens: z.number().int().min(0).optional(),
});
export type StartSessionPayload = z.infer<typeof StartSessionPayloadSchema>;
