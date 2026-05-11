# Campaigns restructure — design

**Status:** draft, awaiting user review
**Date:** 2026-05-10

## Summary

Replace the current flat `sessions` model with a two-level structure: **Campaigns** (long-lived containers owned by a single user) and **Lobbies** (the live DO runtime attached to a campaign). Split the old "director" role into three tiers — **Owner** (permanent), **Director permission** (grantable by owner to other members), **Active Director** (transient, one at a time, freely contestable by any director-permitted member). Introduce **Encounter Templates** (saved monster bundles, additive when loaded) and **Campaign-Characters** (a per-campaign roster of submitted player characters, gated on active-director approval). Reframe the engine so the lobby holds a persistent participant roster across encounters; `EndEncounter` becomes a phase reset, not a roster clear.

This is structural — every piece of D1, every route, the DO, and the reducer's top-level state type are touched. It's also pre-launch in scope: no production data to preserve.

## Terminology

| Term | Meaning |
|---|---|
| **Campaign** | The top-level, long-lived container. Has a name, an invite code, members, and (eventually) saved encounters, party-level data, and more. Owned by a single user. Replaces what `sessions` does today. |
| **Owner** | The user who created the campaign. Singular, permanent (for v1 — ownership transfer is a future feature). Always has director permission and is the ultimate authority: can grant/revoke director permission, kick players, deny characters, manage templates. Cannot be kicked. Cannot have their director permission revoked. |
| **Director permission** | A per-member flag (`is_director`) granted by the owner. Members with this flag can **jump behind the screen** to run a session, and can perform all operational acts (approve/deny characters, kick players, manage templates, drive combat). The owner holds this implicitly. Any number of members can hold it. |
| **Active Director** | The single member currently **behind the screen** — the one whose intents are accepted as director-driven (combat control, approvals, etc.). At most one per campaign. Defaults to the owner. Any director-permitted member can press "Jump behind the screen" to become active; this is broadcast and immediate. The previous active director steps out from behind the screen (still has permission, can jump back). |
| **Lobby** | The **runtime** environment for a campaign — the Durable Object holding live state, sockets, the active participant roster, and the current encounter phase. Not its own table; "joining the lobby" is just connecting a WebSocket to the campaign's DO. One DO per campaign. |
| **Encounter (live)** | The phase of the lobby where initiative is rolled and combat is running. Not a separate persistent entity. Lives inside the campaign's DO state. |
| **Encounter Template** | A named, reusable monster lineup saved by the director (e.g. "Goblin Patrol — 6 minions + 1 sniper"). Stored in D1 per-campaign. Additive when loaded into the lobby. |
| **Session** | **Reserved.** Not used in v1. Kept open for a future intra-campaign categorisation concept ("Session 12: Bandit Camp"). |

## Goals

1. Director can create a Campaign and reuse it across multiple play nights without recreating state.
2. Players join a Campaign once via invite code; membership persists until they leave or are kicked.
3. Players can register characters with a campaign; the active director approves before they're playable.
4. Director can save the current monster lineup as an Encounter Template and reload it later.
5. Director can add monsters or templates to the lobby roster at any time — including mid-combat.
6. `EndEncounter` resets only encounter-phase state (round, turn order, malice, conditions); roster and stamina persist.
7. The owner can hand off directing duties: grant director permission to another member, who can then jump behind the screen (e.g. when the owner is absent or wants to play their PC for the night). Owner retains override at all times.

## Non-goals (v1)

- **Encounter run history / replay.** We do not persist per-encounter "what happened" records. The intent log is the audit trail; any encounter-history UI is a derived view, deferred.
- **Multiple parallel lobbies per campaign.** One DO per campaign, full stop.
- **Multiple campaigns running simultaneously for the same user in the same browser.** Single-active-campaign UX; switching is a navigate.
- **Migrating existing dev data.** Project is pre-launch; the new schema replaces the old. `pnpm db:reset` drops and recreates.
- **WebSocket Hibernation API migration.** Today's `server.accept()` stays. Cost is well within tolerance at expected usage (~$1/month/active campaign on Workers Paid). Filed as a follow-up.
- **Renaming the `sessions` term out of the Phase 2+ docs that refer to a "session" colloquially.** Code/schema/types get the full rename; prose docs get a sweep in a follow-up commit.

## Architecture

### Persistent storage (D1)

```
users
auth_tokens
auth_sessions
campaigns                ← renamed from sessions; same metadata role
campaign_memberships     ← renamed from memberships; user ↔ campaign
campaign_characters      ← NEW; character ↔ campaign, active-director approved
encounter_templates      ← NEW; replaces dormant `encounters` table
campaign_snapshots       ← renamed from session_snapshots; DO state cache
intents                  ← unchanged structure; column renamed session_id → campaign_id
characters               ← unchanged; still user-owned, no campaign FK
```

The dormant `encounters` table is **dropped**.

### Runtime

- One Durable Object per campaign, keyed by campaign id. Class renamed `SessionDO` → `LobbyDO`. Lifecycle unchanged: alive while sockets are connected, hibernates ~10s after the last disconnects, wakes on the next connection by reading the snapshot and replaying non-voided intents.
- The reducer's top-level state type renames `SessionState` → `CampaignState` and **restructures** to separate lobby-persistent fields from encounter-phase fields (see "Reducer state shape" below).

### Trust

Same spirit as CLAUDE.md baseline — director-trusted, players-trusted-with-receipts — refined into three permission tiers:

1. **Owner** — singular, permanent. Can do everything an active director can, plus grant/revoke director permission. Cannot be kicked or demoted. The `campaigns.owner_id` column is the source of truth; mirrored into `CampaignState.ownerId` for reducer access.
2. **Director permission** — held by the owner implicitly, plus any other members the owner has granted it to via the grant route. Stored on `campaign_memberships.is_director`. A member with director permission can jump behind the screen at any time but is not automatically *the* director.
3. **Active director** — at most one per campaign. Stored in `CampaignState.activeDirectorId`, defaults to `ownerId`. Mutated by the `JumpBehindScreen` intent (any director-permitted member can dispatch it; reducer sets `activeDirectorId = actor.userId`). All operational "director-only" intents check `actor.userId === state.activeDirectorId`.

**Operational acts** (approve/deny character, kick player, manage templates, combat control, `RemoveParticipant`, `ClearLobby`): require *active director* (and the owner trivially satisfies this because they default to it and can jump behind the screen at will).

**Ownership acts** (grant/revoke director permission, future ownership transfer): require *owner*. Enforced by reducer / route checks against `state.ownerId`.

**Revoking the active director.** If the owner revokes director permission from the user currently holding `activeDirectorId`, the revoke route force-dispatches a synthetic `JumpBehindScreen` from the owner so the screen returns to the owner atomically. No window in which a revoked user stays behind the screen.

## Data model

### `campaigns`

```ts
id           text PRIMARY KEY        // ULID
name         text NOT NULL
owner_id     text NOT NULL → users.id   // renamed from director_id
invite_code  text NOT NULL UNIQUE       // 6-char, generated as today
created_at   integer NOT NULL
updated_at   integer NOT NULL
```

Renamed `director_id` → `owner_id` to reflect the permission split: this column is the permanent owner of the campaign, not "the director" (which is now a transient runtime concept).

### `campaign_memberships`

```ts
campaign_id  text NOT NULL → campaigns.id ON DELETE CASCADE
user_id      text NOT NULL → users.id
is_director  integer NOT NULL DEFAULT 0   // 1 = has director permission; owner implicitly has it
joined_at    integer NOT NULL
PRIMARY KEY (campaign_id, user_id)
INDEX idx_campaign_memberships_user ON (user_id)
```

The `role` enum is replaced by `is_director`. The old `director` role is now derived (owner of the campaign OR a member with `is_director = 1`); everyone else is a plain member. The owner's membership row has `is_director = 1` set at create time for query convenience, but the owner's authority does not depend on it (it's derived from `campaigns.owner_id`).

### `campaign_characters`

```ts
campaign_id  text NOT NULL → campaigns.id ON DELETE CASCADE
character_id text NOT NULL → characters.id ON DELETE CASCADE
status       text NOT NULL CHECK (status IN ('pending','approved'))
submitted_at integer NOT NULL
decided_at   integer
decided_by   text → users.id          // director who approved; null while pending
PRIMARY KEY (campaign_id, character_id)
INDEX idx_campaign_characters_campaign ON (campaign_id)
```

**Notes.** Denied submissions are deleted, not stored — no value in keeping them. The composite PK on `(campaign_id, character_id)` does not constrain "one character per user" — a single user can have multiple characters in the same campaign (deliberate; covers running two PCs or DM-owned NPCs). The `character_id` FK cascades from `characters` so deleting a character removes its campaign registrations cleanly. Kicking a player is an application-level action that explicitly deletes their rows in both `campaign_memberships` and `campaign_characters`.

**Source of truth.** `campaign_characters` lives **only in D1**. It is **not** mirrored in `CampaignState`. Intents that mutate it (`SubmitCharacter`, `Approve/DenyCharacter`, `RemoveApprovedCharacter`, `KickPlayer`) are **side-effect intents**: the reducer validates the actor's role and the request shape, the DO performs the D1 row write inside the same serialized op, and the intent is persisted to the `intents` log so the change is attributed. The reducer returns the unchanged `CampaignState` for these intents (no in-memory state change). Clients read the current set via `GET /api/campaigns/:id/characters` and re-fetch on receiving an `applied` envelope of any of these intent types. This mirrors how `campaign_memberships` is handled (D1-resident, not in state).

**Undo of side-effect intents is out of scope.** Today's Undo flow voids rows in the intents log and rebuilds `CampaignState` by replaying non-voided rows — it has no hook to reverse D1 row writes outside of state. Side-effect intents are therefore effectively non-undoable; the director instead dispatches the opposite intent (deny what was approved, re-approve what was removed). This is acceptable: these actions happen outside combat in practice and so live outside the current-round Undo window anyway.

### `encounter_templates`

```ts
id           text PRIMARY KEY        // ULID
campaign_id  text NOT NULL → campaigns.id ON DELETE CASCADE
name         text NOT NULL
data         text NOT NULL           // JSON; EncounterTemplateSchema in shared
created_at   integer NOT NULL
updated_at   integer NOT NULL
INDEX idx_encounter_templates_campaign ON (campaign_id)
```

**`data` JSON shape (v1):**

```ts
EncounterTemplateSchema = z.object({
  monsters: z.array(z.object({
    monsterId: z.string(),     // matches a SteelCompendium monster id
    quantity: z.number().int().min(1).max(50),
    nameOverride: z.string().optional(),  // "Goblin Sniper Alpha" — applied as suffix on each instance if multiple
  })),
  notes: z.string().optional(),  // free-form director notes / terrain prose
});
```

No scaling-by-victories baked in. The original Phase 1 plan mentioned "scale by victories" in the encounter builder — that becomes a **load-time** option in the UI (director can bump quantities before confirming), not a property of the template itself. Templates are static.

No heroes in templates. A template is monsters only; heroes are added via `BringCharacterIntoEncounter`.

### `campaign_snapshots`

```ts
campaign_id  text PRIMARY KEY → campaigns.id ON DELETE CASCADE
state        text NOT NULL           // JSON; CampaignState
seq          integer NOT NULL
saved_at     integer NOT NULL
```

Verbatim shape, renamed.

### `intents`

```ts
id           text PRIMARY KEY        // ULID
campaign_id  text NOT NULL → campaigns.id ON DELETE CASCADE
seq          integer NOT NULL
actor_id     text NOT NULL → users.id
payload      text NOT NULL
voided       integer NOT NULL DEFAULT 0
created_at   integer NOT NULL
UNIQUE (campaign_id, seq)
INDEX idx_intents_campaign_seq ON (campaign_id, seq)
```

Same shape, `session_id` column renamed to `campaign_id`.

### `characters`

Unchanged. Still owned by users via `owner_id`; no `campaign_id` column.

## Reducer state shape

The current `SessionState` shape lumps participants inside `activeEncounter`. The new model splits them: the participant roster is **lobby-persistent**, the encounter phase is **transient**.

```ts
export type CampaignState = {
  campaignId: string;
  // Cached from campaigns.owner_id at load(); immutable per campaign for v1.
  // Used by the reducer to authorise owner-only intents without a D1 round-trip.
  ownerId: string;
  // The user currently behind the screen. Defaults to ownerId on creation.
  // Mutated by JumpBehindScreen. Operational "director-only" intents are
  // gated on actor.userId === activeDirectorId.
  activeDirectorId: string;
  seq: number;
  connectedMembers: Member[];
  notes: NoteEntry[];
  // Lobby-persistent roster. Heroes + monsters added to the lobby.
  // Survives EndEncounter; cleared only by RemoveParticipant or ClearLobby.
  participants: Participant[];
  // Encounter phase. null when there is no active encounter.
  // EndEncounter sets this to null AND scrubs participants' conditions.
  encounter: EncounterPhase | null;
};

export type EncounterPhase = {
  id: string;                              // ULID, assigned at StartEncounter
  currentRound: number | null;
  turnOrder: string[];                     // participant ids
  activeParticipantId: string | null;
  turnState: Record<string, TurnState>;
  malice: MaliceState;
};
```

`Participant` keeps everything it has today (id, name, kind, stamina, conditions, resources, etc.). Conditions live on the participant and are wiped by `EndEncounter`.

`emptyCampaignState(campaignId, ownerId)` (renamed, second param added) returns `{ campaignId, ownerId, activeDirectorId: ownerId, seq: 0, connectedMembers: [], notes: [], participants: [], encounter: null }`. The DO must know the campaign's owner at `load()` time — it reads `campaigns.owner_id` once during cold start and threads it into the empty-state factory.

**Note on `directorMembers`.** The set of director-permitted users is **not** mirrored into `CampaignState`. The truth is `campaign_memberships.is_director`. The reducer cannot validate `JumpBehindScreen` purely from state — instead, the DO performs a D1 lookup of the actor's `is_director` flag inside the serialized op (the same pattern used for `LoadEncounterTemplate`), stamps the verdict onto the intent payload as `{ permitted: boolean }`, and the reducer accepts or rejects based on that plus `actor.userId === state.ownerId`.

## Intents

### Renamed / repurposed

| Intent | Change |
|---|---|
| `StartEncounter` | No longer accepts a monster lineup. Engages whoever is currently on the lobby roster: assigns initiative order, sets `encounter.currentRound = 1`, initialises malice. Rejected if `encounter` is already non-null. |
| `EndEncounter` | Sets `encounter = null`. Iterates `participants` and clears each one's conditions array. Stamina, resources, recoveries, surges, heroic resource untouched. |
| `BringCharacterIntoEncounter` | Renamed semantically (but keeping the type literal for now to limit blast radius) — adds a character to the lobby roster, not "into the encounter." Works whether or not an encounter is active. |
| `JoinSession` / `LeaveSession` | Renamed to `JoinLobby` / `LeaveLobby`. Same semantics. |

### New

Authority levels referenced below:
- **Active-director gated:** reducer accepts iff `actor.userId === state.activeDirectorId`. The owner satisfies this trivially because the screen defaults to them and they can always jump back behind it.
- **Owner-gated:** reducer accepts iff `actor.userId === state.ownerId`.
- **Director-permitted gated:** DO stamps a D1-derived `permitted` flag onto the intent; reducer accepts iff `permitted === true` OR `actor.userId === state.ownerId`.

| Intent | Authority | Purpose |
|---|---|---|
| `AddMonster` | Active director | Adds one or more monster instances to the lobby roster from the codex. Payload: `{ monsterId, quantity, nameOverride? }`. |
| `RemoveParticipant` | Active director | Removes a participant from the lobby roster. Rejected if the participant is the currently active participant of an in-progress encounter. |
| `ClearLobby` | Active director | Bulk-remove all participants. Rejected while an encounter is active. |
| `LoadEncounterTemplate` | Active director | Adds all participants from a saved template. Client payload: `{ templateId }`. The DO resolves the template row from D1 before invoking the reducer and stamps the resolved monster list onto the intent payload as `{ templateId, monsters: [...] }`; the reducer then emits one derived `AddMonster` per `monsters[]` entry. Works mid-combat (additive). |
| `SubmitCharacter` | Any campaign member | Player submits one of their characters for director approval. Payload: `{ characterId }`. Creates a `campaign_characters` row with `status='pending'`. Player must already be a campaign member and own the character. |
| `ApproveCharacter` | Active director | Approves a pending submission. Payload: `{ characterId }`. Updates row to `status='approved'`. |
| `DenyCharacter` | Active director | Denies a pending submission. Payload: `{ characterId }`. Deletes the row. |
| `RemoveApprovedCharacter` | Active director | Removes a previously-approved character from the campaign. Payload: `{ characterId }`. Deletes the row. Also removes the corresponding participant from the lobby roster if present. |
| `KickPlayer` | Active director | Removes a player from the campaign. Payload: `{ userId }`. Deletes their `campaign_memberships` row and all their `campaign_characters` rows; also removes any of their characters' participants from the lobby roster. Rejected if `userId === state.ownerId` (owner can't be kicked). |
| `JumpBehindScreen` | Director-permitted | Actor jumps behind the screen and becomes the active director. Client payload: `{}`. DO stamps `{ permitted }` from D1; reducer sets `state.activeDirectorId = actor.userId`. The previous active director simply steps out (no separate notification). |

### Removed

None — every old intent still has a clear home in the new model. The `encounters` D1 table (dormant) is dropped, but no intent referenced it.

### Server-only intents

`SERVER_ONLY_INTENTS` set in the DO becomes: `JoinLobby`, `LeaveLobby`, `ApplyDamage`. Unchanged surface, renamed entries.

The admin-style intents (`SubmitCharacter`, `Approve/DenyCharacter`, `RemoveApprovedCharacter`, `KickPlayer`, `RemoveParticipant`, `ClearLobby`, `JumpBehindScreen`) are **not** server-only — they're dispatched by clients and gated at the reducer level via the authority checks documented in the intents table. This matches the existing pattern (e.g. an "edit monster HP" intent is rejected by the reducer when a player dispatches against a monster they don't own, rather than being server-only).

The synthetic `JumpBehindScreen` dispatched by the revoke route (see HTTP routes below) is the **one exception**: it's server-emitted and bypasses client gating, because the revoke action needs to atomically move the screen back to the owner regardless of who's currently behind it.

## HTTP routes

All routes under `/api/campaigns/*` (renamed from `/api/sessions/*`). Auth middleware unchanged.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/campaigns` | List campaigns the caller belongs to. |
| `POST` | `/api/campaigns` | Create a campaign; caller becomes owner. The membership row for the caller is created with `is_director = 1`. |
| `POST` | `/api/campaigns/join` | Redeem an invite code; caller joins as a member (no director permission). |
| `GET` | `/api/campaigns/:id` | Campaign metadata (name, invite code, caller's permission flags: `isOwner`, `isDirector`, plus `activeDirectorId`). |
| `GET` | `/api/campaigns/:id/socket` | WS upgrade → lobby DO. |
| `GET` | `/api/campaigns/:id/members` | List members with their `is_director` flag. Any member. |
| `POST` | `/api/campaigns/:id/members/:userId/director` | Grant director permission. Owner-only. Sets `is_director = 1`. |
| `DELETE` | `/api/campaigns/:id/members/:userId/director` | Revoke director permission. Owner-only. Sets `is_director = 0`. If the revoked user is currently the active director, the route also dispatches a server-emitted `JumpBehindScreen` from the owner so the screen moves back atomically. Rejected if `userId === ownerId` (owner's permission is implicit and cannot be revoked). |
| `GET` | `/api/campaigns/:id/templates` | List the campaign's encounter templates. |
| `POST` | `/api/campaigns/:id/templates` | Create a template. Active-director-only (route checks `state.activeDirectorId` via DO; or accepts owner unconditionally). Body: `{ name, data }`. |
| `PATCH` | `/api/campaigns/:id/templates/:tid` | Rename or edit a template. Active-director-only. |
| `DELETE` | `/api/campaigns/:id/templates/:tid` | Delete a template. Active-director-only. |
| `GET` | `/api/campaigns/:id/characters` | List campaign-character rows (filtered by status). |

The template endpoints sit outside the intent stream — they manage template definitions, not lobby state. Loading a template into the lobby goes through the `LoadEncounterTemplate` intent and reads the template row mid-dispatch.

Member/character lifecycle intents (`SubmitCharacter`, `ApproveCharacter`, etc.) flow through the WebSocket / intent pipeline like every other state change so they're attributed, logged, and undoable. The HTTP `GET /campaigns/:id/characters` endpoint exists for the "show me pending submissions" UI without needing the WS connection.

## Saved encounter UX (data-level only)

Two creation paths supported by the spec:

1. **Save from lobby.** Director composes monsters in the lobby roster, hits "Save as template," names it. Backend: read current `participants` filtered to `kind: 'monster'`, count by `monsterId`, write `encounter_templates` row. Primary path.
2. **Dedicated builder page.** Pure-form UI: pick monsters, set quantities, save. Same backend endpoint. Lower priority for v1.

Loading is a single button: **Add → Saved encounter → pick from list**. The "Add" menu also offers "Single monster" (opens monster codex picker) and "Hero" (opens approved-characters picker for the current campaign).

## DO changes

- Class rename `SessionDO` → `LobbyDO`.
- Header rename `x-session-id` → `x-campaign-id`. `x-user-id`, `x-user-display-name` unchanged. **`x-user-role` is removed** — the reducer derives authority from `actor.userId` against `state.ownerId` / `state.activeDirectorId` / D1-stamped `is_director`. There's no client-claimed role to honour.
- DO is keyed by `campaignId` via `idFromName(campaignId)`. Same pattern as today.
- `load()` reads `campaign_snapshots`; if there is no snapshot it bootstraps from `campaigns.owner_id` to populate `ownerId` and seed `activeDirectorId = ownerId`. Then replays non-voided `intents` where `campaign_id = ...`. Identical to today modulo column names plus the bootstrap read.
- WebSocket envelope kinds stay: `applied`, `rejected`, `snapshot`, `sync`, `dispatch`, `member_list`, `member_joined`, `member_left`. The Phase 0 `member_*` envelopes are still emitted for compatibility and removed in their own follow-up.
- `LoadEncounterTemplate` is dispatched by a director through the normal `dispatch` path; the DO handler reads the template row from D1 inside the serialized op (before calling the reducer), and the reducer receives the resolved monster list as part of the intent payload at the boundary. **Alternative considered:** read the template in the reducer. Rejected because the reducer is pure (no D1 access) — the DO is the right place to fan a template into participants.
- `JumpBehindScreen` follows the same DO-stamping pattern: handler reads `campaign_memberships.is_director` for the actor, stamps `{ permitted: boolean }` onto the payload before reducer dispatch. Cheap (single indexed read).
- **Revoke-side synthetic dispatch.** When the revoke HTTP route fires while the target user is the active director, it constructs a `JumpBehindScreen` intent with `actor = { userId: ownerId, ... }`, `source = 'server'`, `permitted: true`, and pushes it through the normal `_applyOne` pipeline. Same serialized-op queue, same broadcast.

## Migration

Drop-and-recreate. Project is pre-launch; the friend group is not yet using it.

- New Drizzle migration generated against the new schema. Renames `sessions` → `campaigns` (and `director_id` → `owner_id`), `memberships` → `campaign_memberships` (and `role` column replaced with `is_director`), `session_snapshots` → `campaign_snapshots`, `intents.session_id` → `intents.campaign_id`. Drops dormant `encounters`. Adds `encounter_templates` and `campaign_characters`.
- `pnpm db:reset` script updated to apply the new schema as the only schema.
- Existing fixtures rewritten to seed: a campaign + owner user + one secondary director-permitted member + one approved character + one encounter template.

If the user wants a data-preserving migration, the scope expands meaningfully (rename + data move for every table). Flag explicitly during review if so.

## Testing

Per CLAUDE.md, every package gets test coverage before declaring done.

- **`packages/rules`** — reducer tests for: EndEncounter clears conditions but preserves stamina; StartEncounter engages current roster; AddMonster mid-combat appends to roster without disturbing turn order; LoadEncounterTemplate fans into N AddMonster intents; ClearLobby rejected mid-encounter; RemoveParticipant rejected for active-turn participant; operational intents reject actors who are not the active director; owner-gated checks (KickPlayer cannot target the owner); JumpBehindScreen rejected when `permitted=false` and actor is not owner; JumpBehindScreen accepted for owner unconditionally; JumpBehindScreen accepted for a director-permitted member and updates `activeDirectorId`.
- **`apps/api`** — route tests for all `/api/campaigns/*` endpoints (auth, membership gating, active-director gating on templates, owner-only gating on grant/revoke director); revoke-while-active-director triggers a synthetic JumpBehindScreen and the screen returns to the owner atomically; DO tests for header rename, replay correctness, LoadEncounterTemplate's D1-side-channel read, JumpBehindScreen's D1-stamped `permitted` flag.
- **`apps/web`** — query/mutation hooks renamed, plus integration test for "save current roster as template" round-trip.

## Risks and trade-offs

- **Rename blast radius.** `SessionState` → `CampaignState` plus column renames touches the reducer, every intent handler, every test, every web-side query hook, the DO, and the routes. Conservative estimate: ~40 files. Mitigation: spec instructs implementation to do the rename as a single mechanical pass before any semantic changes, so the diff is reviewable in two commits (rename, then semantics).
- **Participant model split.** Moving `participants` out of `encounter` is a breaking shape change. Snapshot rows from pre-refactor sessions are unreadable. Acceptable because pre-launch.
- **Template authoring outside the intent log.** Template CRUD is HTTP-only, so creating/editing/deleting a template is **not** an intent and **not** undoable. Acceptable trade — templates are setup data, not in-play state. The act of *loading* one into the lobby is an intent.
- **`SubmitCharacter` requires character ownership at submission time.** A player who later transfers a character to another user, or whose character is deleted, leaves dangling references. Resolution: `ON DELETE CASCADE` on `character_id` handles deletion; ownership transfer isn't a v1 capability.
- **Director adding their own characters.** A director can `SubmitCharacter` against their own characters (e.g. for DMPCs); the active-director approval still goes through `ApproveCharacter`, which they'll dispatch themselves. Slightly silly but cheap and consistent.
- **Two sources of truth for director permission.** `campaign_memberships.is_director` (D1) is canonical; `CampaignState.activeDirectorId` (in state) is who's behind the screen at runtime. They can drift if the revoke route writes the column but fails to dispatch the synthetic `JumpBehindScreen`. Mitigation: the route writes D1 and dispatches the intent inside the same Worker request, in that order; any failure between the two leaves the column updated and the screen stale, which the reducer self-corrects on the next operational intent (the now-revoked active director's action gets rejected, prompting the owner to manually jump back behind the screen).
- **Screen contests are non-collaborative.** Two director-permitted members pressing "Jump behind the screen" in close succession will both succeed; the later one wins. No locking or confirmation. Acceptable at friend-group scale; revisit if it becomes a problem.

## Documentation impact

- `CLAUDE.md` — terminology section: add Campaign / Owner / Director permission / Active Director / Lobby / Encounter Template / Session-reserved.
- `docs/ARCHITECTURE.md` — rename "session" → "campaign" throughout; lobby/encounter split explained.
- `docs/data-pipeline.md` — D1 schema section regenerated.
- `docs/intent-protocol.md` — list new intents; `JoinSession`/`LeaveSession` renamed.
- `docs/rules-engine.md` — `SessionState` → `CampaignState`; participant/encounter split.
- `docs/phases.md` — Phase 1 acceptance criteria reworded to use new vocabulary; encounter builder reframed as **template builder** (separate from lobby), and the in-lobby "add" affordance described.
- New: `docs/superpowers/specs/2026-05-10-campaigns-restructure-design.md` (this file).

## Open assumptions surfaced during brainstorming

1. Invite-code redemption grants membership immediately, no approval. (Membership is gate-free; character registration is the director-gated step.)
2. One invite code per campaign, regenerable by the owner. (Same as today; not specced in detail here, but worth flagging it stays owner-only.)
3. A character can be in multiple campaigns simultaneously. (Schema doesn't constrain; user can run the same hero in two groups.)
4. Templates contain monsters only — no heroes, no terrain geometry (just optional prose notes).
5. Loading a template mid-combat is allowed and does not advance initiative; new monsters land in the roster and get added to the end of the turn order for the *next* round, not the current one. (Implementation detail to confirm during plan-writing.)
6. `ClearLobby` exists and is the only roster-wipe affordance; `EndEncounter` never touches the roster.
7. **Ownership transfer is out of scope for v1.** `campaigns.owner_id` is immutable once set. A future feature can introduce a `TransferOwnership` route guarded by both-party confirmation.
8. **Operational acts collapse to "active director."** Anyone holding director permission who jumps behind the screen can approve characters, kick players, manage templates, etc. The owner is not required for these — only for grant/revoke director permission. This makes a "I'm running tonight" handoff fully functional without owner involvement after the grant.
9. **The screen is freely contestable.** Any director-permitted member can press "Jump behind the screen" at any time and become active director immediately, with no consent from the previous active director. Acceptable because permission is owner-controlled (only trusted users hold it) and changes are broadcast and attributed.
10. **No "request to direct" flow.** A member without director permission cannot ask for it via an in-app intent. The owner grants permission out-of-band (or via a future UI). Keeps the surface small.

If any of these are wrong, raise it on review.
