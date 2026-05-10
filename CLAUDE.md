# Ironyard — guidance for Claude Code

This file is the brief for any Claude Code session working in this repo. Read it before doing anything substantive.

## What this project is

A multi-user web app for running the Draw Steel TTRPG at the table. See [`README.md`](README.md) for the user-facing pitch. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the deep architecture.

## Read these in order before starting work

1. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system design, data flow, trust model
2. [`docs/intent-protocol.md`](docs/intent-protocol.md) — how mutations work; **read this before touching any state**
3. [`docs/rules-engine.md`](docs/rules-engine.md) — read if working in `packages/rules`
4. [`docs/data-pipeline.md`](docs/data-pipeline.md) — read if working in `packages/data` or touching D1 schema
5. [`docs/phases.md`](docs/phases.md) — what's done, what's next, what's out of scope right now

## Conventions (non-negotiable)

- **TypeScript, strict mode.** No `any` without an explicit comment justifying it.
- **Zod schemas are the source of truth** for any data crossing a boundary (HTTP, WebSocket, DO storage, D1 serialization). Types are derived from schemas via `z.infer`, not hand-written separately.
- **Every mutation is an intent.** Never mutate state directly in a component or handler. State changes flow through the intent reducer in `packages/rules`. See `docs/intent-protocol.md`.
- **Auto-roll-and-apply is the default UX** for every roll-producing action. Manual entry is an override, not the primary path.
- **Authoritative engine, with override.** The rules engine computes effects; the UI shows what was applied with an Undo / Edit affordance. Cap the undo stack at "current round."
- **Touch-first.** 44pt minimum hit targets. No hover-only affordances. iPad in landscape is the design sweet spot.
- **No copyright text in the repo.** SteelCompendium data is fetched at build time, not committed. Static JSON output of the ingest goes to `apps/web/public/data/` and is gitignored.

## Trust model

Director-trusted, players-trusted-with-receipts:

- Players can dispatch intents that affect their own character and roll attacks against any target.
- Players cannot edit monsters or other players' characters.
- The director can dispatch any intent and override anything.
- Every intent is attributed in the session log (who, when, what).
- No anti-cheat in v1 — friend-group trust. Architect such that swapping to server-side dice rolling later is just changing where `Math.random()` is called.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend framework | React + Vite | Stateful UIs are React's strong suit; biggest library ecosystem |
| Routing | TanStack Router | Type-safe routes; first-class for SPAs |
| Server state | TanStack Query | Cache + sync with server; pairs well with WebSocket invalidation |
| Client state | Zustand | Simple, no boilerplate; works with the intent reducer |
| Local persistence | Dexie (IndexedDB) | Offline-first character cache and intent queue |
| Styling | Tailwind | Fast, responsive, consistent |
| Form primitives | react-hook-form + Zod | Schema-driven forms for the character creator |
| Headless UI | Radix UI | Accessible primitives; we style with Tailwind |
| Drag/drop | dnd-kit | Encounter builder, initiative reordering |
| Backend framework | Hono on Cloudflare Workers | Tiny, fast, typed, edge-deployed |
| Database | D1 (SQLite at the edge) | Cheap, simple, durable for our scale |
| ORM | Drizzle | TypeScript-native, lightweight, generates types from schema |
| Realtime | Durable Objects + WebSocket | One DO per session; serializable, single-writer |
| Auth | Magic-link via Resend | No passwords, friend-group friendly |
| Deployment | Cloudflare Pages (web) + Workers (api) | Single platform, generous free tier |

## How to verify your work

Per [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), every package has tests. Before declaring a task done:

- `pnpm test` passes in the affected packages
- `pnpm typecheck` passes repo-wide
- `pnpm lint` passes
- For UI work: take a screenshot at iPad-portrait (810×1080) and iPhone-portrait (390×844) to confirm responsive layout

## Things that will hurt you if you skip them

- **Don't bypass the intent reducer.** If you update `participant.hp` directly in a component, the change won't sync, won't be undoable, and won't be in the log. Always dispatch.
- **Don't put SteelCompendium data into D1.** Static reference data is bundled with the app. D1 is for user-owned and session-owned data only.
- **Don't add `any` to fix a type error.** Fix the type. If you genuinely need an escape hatch, it goes in `packages/shared/src/escape.ts` with a comment.
- **Don't write to LocalStorage / SessionStorage in components.** Persistence goes through Dexie or the server.
- **Don't fetch data directly with `fetch` in a component.** Use TanStack Query hooks defined in `apps/web/src/api/`.
