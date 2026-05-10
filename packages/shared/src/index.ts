// Zod schemas for everything that crosses a boundary land here.
// Phase 0 item 4 fills in: Intent envelope, ClientMsg / ServerMsg, Actor.
// Phase 0 item 5 adds: D1 row DTOs (Drizzle types are derived separately in apps/api).
// For Phase 1: per-intent payload schemas wired into packages/rules.

export const PACKAGE = '@ironyard/shared' as const;
