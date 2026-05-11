# Architecture

## Goals

1. **Multi-user from day one.** Players own characters, the active director owns monsters, both share a campaign.
2. **Authoritative-with-override rules engine.** App auto-applies effects; UI surfaces what happened with Undo/Edit.
3. **Touch-first UX.** iPad-landscape is the sweet spot; phone and desktop also first-class.
4. **Cheap to run for a friend group; able to scale to a small player base** without a rewrite.
5. **LLM-friendly codebase.** Schema-first, strict types, conventions consistent enough that an agent can navigate it without re-deriving structure.

## The two kinds of data

The single most load-bearing architectural decision: split static reference data from dynamic campaign data.

### Static reference data — bundled at build time

Rules text, ancestries, classes, careers, complications, inciting incidents, monsters, abilities, conditions. Read-only. Versioned with [SteelCompendium](https://github.com/SteelCompendium) releases.

- **Lives in:** `packages/data` (ingest + parsers) → `apps/web/public/data/*.json` (bundled output)
- **Why not in D1:** querying static data over a Worker → D1 hop adds latency for no gain. A few MB of JSON loads instantly from the edge cache, search is fast in-memory.
- **Update cadence:** pin to a SteelCompendium release tag; bump deliberately. Surface the data version in the UI footer so directors know which printing of the rules they're playing.

### Dynamic campaign data — D1 + Durable Objects

Users, campaigns, characters, encounter templates, intent logs, chat. Read-write, multi-user, occasionally needs realtime sync.

- **Lives in:** D1 (canonical, durable) + the per-campaign Durable Object (hot, in-memory, broadcasts)
- **Why both:** D1 is the source of truth across restarts; the lobby DO holds the live campaign state and pushes intents to connected clients without a D1 round-trip per change.

## System diagram

```
┌────────────────┐     WebSocket (intents)    ┌─────────────────────────┐
│  React client  │ ◄───────────────────────► │ LobbyDO                 │
│  (Pages)       │                            │  per Campaign           │
│                │     HTTP (queries, auth)   │  - in-memory state      │
│                │ ─────────────────────────► │  - intent log           │
└────────────────┘                            │  - broadcasts to peers  │
       │                                      └────────────┬────────────┘
       │                                                   │
       ▼                                                   │ persists
   Bundled static JSON                                     ▼
   (rules, monsters, classes)                      ┌──────────────┐
                                                   │     D1       │
                                                   │  (SQLite)    │
                                                   └──────────────┘
```

**D1 tables:** `campaigns`, `campaign_memberships`, `campaign_characters`, `encounter_templates`, `campaign_snapshots`, `intents`, `characters`, `users`, `auth_tokens`, `auth_sessions`. See [`data-pipeline.md`](data-pipeline.md) for the full schema.

## Major modules

### `apps/web` — the React client

- Routes: `/`, `/login`, `/campaigns`, `/campaigns/:id` (lobby), `/campaigns/:id/run` (combat tracker), `/characters`, `/characters/:id` (sheet), `/characters/new` (creator), `/codex` (browse rules/monsters)
- One WebSocket connection per active campaign lobby, owned by a top-level provider
- Intents are dispatched through a hook (`useDispatch`) that:
  1. Optimistically applies the intent to the local Zustand store via the rules reducer
  2. Sends the intent over the WebSocket to the lobby DO
  3. Reconciles when the DO broadcasts the canonical result
### `apps/api` — Hono Worker + Durable Objects

- HTTP routes for queries that don't need a lobby connection (login, list characters, list campaigns, fetch a campaign snapshot, encounter-template CRUD)
- One Durable Object class: `LobbyDO`. Route `WS /api/campaigns/:id/socket` upgrades to a DO-backed WebSocket
- D1 binding for all persistent reads/writes
- Drizzle for SQL

### `packages/rules` — the engine

A pure, stateless reducer:

```ts
function applyIntent(state: CampaignState, intent: Intent): {
  state: CampaignState;
  derived: Intent[];   // intents the engine emits in response (e.g. damage from a hit)
  log: LogEntry[];     // human-readable log for the UI
};
```

- Same code runs in the lobby DO (authoritative) and the client (optimistic)
- Each intent type has a corresponding inverse for undo
- Comprehensive test suite using fixture scenarios

See [`rules-engine.md`](rules-engine.md).

### `packages/data` — the SteelCompendium pipeline

- A build script that pulls the SDK at a pinned version, normalizes it to our typed schema, parses string-encoded fields (`stamina`, `ev`, `roll`) into structured types, and emits JSON to `apps/web/public/data/`
- Runs in CI on every deploy
- Output files: `monsters.json`, `abilities.json`, `classes.json`, `ancestries.json`, `careers.json`, `complications.json`, `conditions.json`, `rules.json`

See [`data-pipeline.md`](data-pipeline.md).

### `packages/shared` — types and schemas

Zod schemas for everything that crosses a boundary: intents, DTOs, DB row shapes, WebSocket envelopes. Imported by both `apps/web` and `apps/api`.

## Auth

Magic-link email via Resend.

1. User submits email → API generates a single-use token, stores it in D1 with a short TTL, sends an email
2. User clicks link → API exchanges token for a session cookie (HttpOnly, Secure, SameSite=Lax)
3. Cookie is verified on every request

For dev: a "skip auth" toggle bound to `IRONYARD_DEV_SKIP_AUTH=1` lets us run locally without an email provider.

## Permission model

Three tiers, encoded in the lobby DO and enforced by the reducer:

| Tier | Who | How identified |
|---|---|---|
| **Owner** | Singular user who created the campaign | `campaigns.owner_id`; mirrored as `CampaignState.ownerId` |
| **Director permission** | Any member the owner has granted `is_director = 1` | `campaign_memberships.is_director`; DO stamps a `permitted` field on relevant intents |
| **Active Director** | The one member currently behind the screen | `CampaignState.activeDirectorId`; mutated by `JumpBehindScreen` |

| Action | Active Director | Player (own char) | Player (other) |
|---|---|---|---|
| Dispatch intent affecting own character | yes | yes | — |
| Dispatch intent affecting another character | yes | no | no |
| Dispatch intent affecting a monster | yes | yes (attack) | yes (attack) |
| Add monsters / load templates | yes | no | no |
| Approve / deny / kick | yes | no | no |
| Grant / revoke director permission | owner only | no | no |
| Read campaign state | yes | yes | yes |

The DO's intent handler runs a permission check — and in some cases a D1 lookup — before applying. Operational intents are gated on `actor.userId === state.activeDirectorId`. The owner trivially satisfies this because the screen defaults to them and they can always jump back.

## Error handling and recovery

- The lobby DO snapshots state to D1 every N intents (or every 30s, whichever first)
- On DO restart: load the latest `campaign_snapshots` row, replay any intents in the log past the snapshot sequence number
- If the WS drops: client sends a `sync { sinceSeq }` on reconnect and the DO replays missed intents in seq order
- Conflict resolution: the DO is the single writer. Optimistic client state is reconciled to whatever the DO says — see "Optimistic UI" in [`intent-protocol.md`](intent-protocol.md) for the per-envelope reconciliation rules.

## Performance targets (informal)

- Initial page load on iPad over 4G: < 2.5s LCP
- Intent → other clients see update: < 200ms p95
- Combat tracker animations at 60fps on iPad
- Rules JSON bundle: < 2 MB gzipped

## Out of scope (until further notice)

- Public sharing / browse-others'-characters / community features
- Theater of the mind vs. battle-map distinction (we'll do a simple grid view in Phase 4 if at all)
- Voice / video (Discord exists)
- Custom rules / homebrew editor (data layer supports it; UI is post-v1)
- Mobile native apps
