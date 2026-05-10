# Phased build plan

The plan that survived contact with the requirements. Each phase ends in something usable; we don't lay plumbing for months without a payoff.

## Phase 0 — Foundation + auth + session model

**Goal:** "I can log in, create a session, and a friend can join. Nothing happens inside the session yet, but the plumbing is real."

- Monorepo scaffolding (pnpm workspaces): `apps/web`, `apps/api`, `packages/shared`, `packages/rules`, `packages/data`
- Cloudflare Pages for `apps/web`, Worker for `apps/api`
- Magic-link auth (Resend or comparable)
- D1 schema deployed; Drizzle migrations working
- Durable Object class wired up; one DO per session
- WebSocket handshake working — client can connect to a session DO and exchange a `ping`/`pong`
- Intent envelope schemas in `packages/shared`, validated end-to-end with Zod
- `packages/data` build script pulls SteelCompendium SDK and emits `monsters.json` (the rest follow in Phase 1+)
- "Hello session" page at `/sessions/:id` lists members in realtime

**Acceptance:** two browsers logged in as different users, both connected to the same session id, both see each other's connect/disconnect events live.

## Phase 1 — Multi-user combat tracker (authoritative engine)

**Goal:** "We can run a real fight at the table tonight, with players on their phones."

- `packages/rules` reducer with the core intents: combat lifecycle, rolls, damage, conditions, resources, undo
- Monster browser at `/codex/monsters` (read-only)
- Encounter builder: pick monsters, set quantities, scale by victories
- Combat run screen: initiative, HP/conditions/resources per participant, monster ability cards with auto-roll
- Players join the session, claim a participant slot ("this is my character"), and roll attacks from their phone
- PCs are quick stat blocks for now (name, max stamina, immunities, characteristics) — full sheet comes in Phase 2
- Per-round undo with toast attribution ("Sarah → Goblin 3 took 14 fire — Ash bolt hit. Undo · Edit")
- Manual override on every stat (long-press)
- Intent log persisted to D1; DO recovers on restart

**Acceptance:** run a session of Draw Steel using only Ironyard. The director uses an iPad in landscape; players use phones. No paper, no other tools, no major bugs that force a restart.

## Phase 2 — Character creator + interactive sheet

**Goal:** "Players make their PCs in the app and the sheet drives play."

- Markdown ingest for class / ancestry / career / inciting incident / complication
- Character creator wizard, mobile-friendly, savable as a draft
- Interactive character sheet: stamina/recoveries/surges/heroic resource, ability cards with auto-roll, rest mechanics
- Characters stored in D1, owned by a user
- "Bring this character into the session" replaces the quick stat block from Phase 1
- Local-first: characters cached in IndexedDB so the iPad keeps working when wifi flakes

**Acceptance:** a player can build a character from scratch in the app, bring it into a session, and play a full encounter using only the sheet (no rulebook open).

## Phase 3 — Lobby polish

**Goal:** "The session feels like a place, not a tracker."

- Shared 3D dice tray (or 2D, depending on iPad performance) — visible to all members
- Text chat per session, with intent log visible in a separate tab
- Ready / AFK states; turn timers (optional, configurable per session)
- Character portraits, monster art (where licensable)
- Sound effects for hits, crits, conditions (toggleable)
- Session settings panel — rename, transfer director, kick member

**Acceptance:** a session feels social. Friends start a session early to chat before play begins.

## Phase 4 — Polish, hardening, PWA

**Goal:** "Ready to invite a small player base beyond our friends."

- Sharing links (read-only spectator mode for guests)
- Role-based permission tightening, audit
- Rate limits and abuse protections
- Observability — error tracking (Sentry), basic analytics, DO health metrics
- PWA install + offline mode for the character sheet (combat tracker requires network)
- Accessibility pass (keyboard nav, screen-reader labels)
- Performance pass on iPad: bundle splitting, image optimization, animation tuning

**Acceptance:** an external playtester not in the original friend group can sign up, build a character, join a session, and play without help.

## Out of scope (until decided otherwise)

- Maps and grid combat (we track movement as numeric distance; a grid view is a Phase 4+ stretch)
- Voice / video (Discord exists)
- Custom rules / homebrew editor (data layer supports it; UI work is post-v1)
- Marketplace / community sharing
- Native mobile apps

## Cross-cutting work that happens in every phase

- **Rules engine.** Phase 1 lights up the core; every later phase fills in conditions and edge cases. Coverage % from the effect-text parser is a tracked metric.
- **Tests.** Each phase ends with the affected packages passing typecheck, lint, and tests. Phase 1 establishes the fixture-based testing pattern; Phases 2–4 follow it.
- **Docs.** When something surprising lands in code, the relevant doc in `docs/` gets a short note. The docs are the brief for future Claude Code sessions; they need to stay current.
