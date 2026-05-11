# Campaigns restructure — design

**Status:** draft, awaiting user review
**Date:** 2026-05-10

## Summary

Replace the current flat `sessions` model with a two-level structure: **Campaigns** (long-lived, director-owned containers) and **Lobbies** (the live DO runtime attached to a campaign). Introduce **Encounter Templates** (saved monster bundles, additive when loaded) and **Campaign-Characters** (a per-campaign roster of approved player characters, DM-gated). Reframe the engine so the lobby holds a persistent participant roster across encounters; `EndEncounter` becomes a phase reset, not a roster clear.

This is structural — every piece of D1, every route, the DO, and the reducer's top-level state type are touched. It's also pre-launch in scope: no production data to preserve.

## Terminology

| Term | Meaning |
|---|---|
| **Campaign** | The top-level, long-lived container. Has a name, an invite code, members, and (eventually) saved encounters, party-level data, and more. Owned by a director. Replaces what `sessions` does today. |
| **Lobby** | The **runtime** environment for a campaign — the Durable Object holding live state, sockets, the active participant roster, and the current encounter phase. Not its own table; "joining the lobby" is just connecting a WebSocket to the campaign's DO. One DO per campaign. |
| **Encounter (live)** | The phase of the lobby where initiative is rolled and combat is running. Not a separate persistent entity. Lives inside the campaign's DO state. |
| **Encounter Template** | A named, reusable monster lineup saved by the director (e.g. "Goblin Patrol — 6 minions + 1 sniper"). Stored in D1 per-campaign. Additive when loaded into the lobby. |
| **Session** | **Reserved.** Not used in v1. Kept open for a future intra-campaign categorisation concept ("Session 12: Bandit Camp"). |

## Goals

1. Director can create a Campaign and reuse it across multiple play nights without recreating state.
2. Players join a Campaign once via invite code; membership persists until they leave or are kicked.
3. Players can register characters with a campaign; DM approves before they're playable.
4. Director can save the current monster lineup as an Encounter Template and reload it later.
5. Director can add monsters or templates to the lobby roster at any time — including mid-combat.
6. `EndEncounter` resets only encounter-phase state (round, turn order, malice, conditions); roster and stamina persist.

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
campaign_characters      ← NEW; character ↔ campaign, DM-approved
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

Unchanged from CLAUDE.md baseline. Director-trusted, players-trusted-with-receipts. Two new authorisation surfaces:

- **Approve/deny character submission:** director-only intent. Reducer rejects from any non-director actor.
- **Kick player:** director-only intent. Removes the player's memberships and campaign_characters via reducer + DO; persisted to D1 via the same intent pipeline.

## Data model

### `campaigns`

```ts
id           text PRIMARY KEY        // ULID
name         text NOT NULL
director_id  text NOT NULL → users.id
invite_code  text NOT NULL UNIQUE    // 6-char, generated as today
created_at   integer NOT NULL
updated_at   integer NOT NULL
```

Verbatim shape of today's `sessions` table, renamed.

### `campaign_memberships`

```ts
campaign_id  text NOT NULL → campaigns.id ON DELETE CASCADE
user_id      text NOT NULL → users.id
role         text NOT NULL CHECK (role IN ('director','player'))
joined_at    integer NOT NULL
PRIMARY KEY (campaign_id, user_id)
INDEX idx_campaign_memberships_user ON (user_id)
```

Verbatim shape of `memberships`, renamed.

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

`emptyCampaignState(campaignId)` (renamed) returns `{ ..., participants: [], encounter: null }`.

## Intents

### Renamed / repurposed

| Intent | Change |
|---|---|
| `StartEncounter` | No longer accepts a monster lineup. Engages whoever is currently on the lobby roster: assigns initiative order, sets `encounter.currentRound = 1`, initialises malice. Rejected if `encounter` is already non-null. |
| `EndEncounter` | Sets `encounter = null`. Iterates `participants` and clears each one's conditions array. Stamina, resources, recoveries, surges, heroic resource untouched. |
| `BringCharacterIntoEncounter` | Renamed semantically (but keeping the type literal for now to limit blast radius) — adds a character to the lobby roster, not "into the encounter." Works whether or not an encounter is active. |
| `JoinSession` / `LeaveSession` | Renamed to `JoinLobby` / `LeaveLobby`. Same semantics. |

### New

| Intent | Purpose |
|---|---|
| `AddMonster` | Adds one or more monster instances to the lobby roster from the codex. Payload: `{ monsterId, quantity, nameOverride? }`. |
| `RemoveParticipant` | Removes a participant from the lobby roster. Rejected if the participant is the currently active participant of an in-progress encounter. Director-only. |
| `ClearLobby` | Bulk-remove all participants. Rejected while an encounter is active. Director-only. |
| `LoadEncounterTemplate` | Adds all participants from a saved template. Client payload: `{ templateId }`. The DO resolves the template row from D1 before invoking the reducer and stamps the resolved monster list onto the intent payload as `{ templateId, monsters: [...] }`; the reducer then emits one derived `AddMonster` per `monsters[]` entry. Works mid-combat (additive). |
| `SubmitCharacter` | Player submits one of their characters for DM approval. Payload: `{ characterId }`. Creates a `campaign_characters` row with `status='pending'`. Player must already be a campaign member. |
| `ApproveCharacter` | Director approves a pending submission. Payload: `{ characterId }`. Updates row to `status='approved'`. Director-only. |
| `DenyCharacter` | Director denies a pending submission. Payload: `{ characterId }`. Deletes the row. Director-only. |
| `RemoveApprovedCharacter` | Director removes a previously-approved character from the campaign. Payload: `{ characterId }`. Deletes the row. Also removes the corresponding participant from the lobby roster if present. Director-only. |
| `KickPlayer` | Director removes a player from the campaign. Payload: `{ userId }`. Deletes their `campaign_memberships` row and all their `campaign_characters` rows; also removes any of their characters' participants from the lobby roster. Director-only. |

### Removed

None — every old intent still has a clear home in the new model. The `encounters` D1 table (dormant) is dropped, but no intent referenced it.

### Server-only intents

`SERVER_ONLY_INTENTS` set in the DO becomes: `JoinLobby`, `LeaveLobby`, `ApplyDamage`. Unchanged surface, renamed entries.

The admin-style intents (`SubmitCharacter`, `Approve/DenyCharacter`, `RemoveApprovedCharacter`, `KickPlayer`, `RemoveParticipant`, `ClearLobby`) are **not** server-only — they're dispatched by clients and gated at the reducer level via actor-role checks. This matches the existing pattern (e.g. an "edit monster HP" intent is rejected by the reducer when a player dispatches against a monster they don't own, rather than being server-only).

## HTTP routes

All routes under `/api/campaigns/*` (renamed from `/api/sessions/*`). Auth middleware unchanged.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/campaigns` | List campaigns the caller belongs to. |
| `POST` | `/api/campaigns` | Create a campaign; caller becomes director. |
| `POST` | `/api/campaigns/join` | Redeem an invite code; caller joins as player. |
| `GET` | `/api/campaigns/:id` | Campaign metadata (name, invite code, caller's role). |
| `GET` | `/api/campaigns/:id/socket` | WS upgrade → lobby DO. |
| `GET` | `/api/campaigns/:id/templates` | List the campaign's encounter templates. |
| `POST` | `/api/campaigns/:id/templates` | Create a template. Director-only. Body: `{ name, data }`. |
| `PATCH` | `/api/campaigns/:id/templates/:tid` | Rename or edit a template. Director-only. |
| `DELETE` | `/api/campaigns/:id/templates/:tid` | Delete a template. Director-only. |
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
- Header rename `x-session-id` → `x-campaign-id`. `x-user-id`, `x-user-display-name`, `x-user-role` unchanged.
- DO is keyed by `campaignId` via `idFromName(campaignId)`. Same pattern as today.
- `load()` reads `campaign_snapshots`, replays non-voided `intents` where `campaign_id = ...`. Identical to today modulo column names.
- WebSocket envelope kinds stay: `applied`, `rejected`, `snapshot`, `sync`, `dispatch`, `member_list`, `member_joined`, `member_left`. The Phase 0 `member_*` envelopes are still emitted for compatibility and removed in their own follow-up.
- `LoadEncounterTemplate` is dispatched by a player or director through the normal `dispatch` path; the DO handler reads the template row from D1 inside the serialized op (before calling the reducer), and the reducer receives the resolved monster list as part of the intent payload at the boundary. **Alternative considered:** read the template in the reducer. Rejected because the reducer is pure (no D1 access) — the DO is the right place to fan a template into participants.

## Migration

Drop-and-recreate. Project is pre-launch; the friend group is not yet using it.

- New Drizzle migration `0001_campaigns.sql` (or whatever number is next) generated against the new schema.
- `pnpm db:reset` script updated to apply the new schema as the only schema.
- Existing fixtures rewritten to seed a campaign + director user + one approved character + one encounter template.

If the user wants a data-preserving migration, the scope expands meaningfully (rename + data move for every table). Flag explicitly during review if so.

## Testing

Per CLAUDE.md, every package gets test coverage before declaring done.

- **`packages/rules`** — reducer tests for: EndEncounter clears conditions but preserves stamina; StartEncounter engages current roster; AddMonster mid-combat appends to roster without disturbing turn order; LoadEncounterTemplate fans into N AddMonster intents; ClearLobby rejected mid-encounter; RemoveParticipant rejected for active-turn participant; character lifecycle intents reject non-director actors.
- **`apps/api`** — route tests for all `/api/campaigns/*` endpoints (auth, membership gating, director gating on templates); DO tests for header rename, replay correctness, LoadEncounterTemplate's D1-side-channel read.
- **`apps/web`** — query/mutation hooks renamed, plus integration test for "save current roster as template" round-trip.

## Risks and trade-offs

- **Rename blast radius.** `SessionState` → `CampaignState` plus column renames touches the reducer, every intent handler, every test, every web-side query hook, the DO, and the routes. Conservative estimate: ~40 files. Mitigation: spec instructs implementation to do the rename as a single mechanical pass before any semantic changes, so the diff is reviewable in two commits (rename, then semantics).
- **Participant model split.** Moving `participants` out of `encounter` is a breaking shape change. Snapshot rows from pre-refactor sessions are unreadable. Acceptable because pre-launch.
- **Template authoring outside the intent log.** Template CRUD is HTTP-only, so creating/editing/deleting a template is **not** an intent and **not** undoable. Acceptable trade — templates are setup data, not in-play state. The act of *loading* one into the lobby is an intent.
- **`SubmitCharacter` requires character ownership at submission time.** A player who later transfers a character to another user, or whose character is deleted, leaves dangling references. Resolution: `ON DELETE CASCADE` on `character_id` handles deletion; ownership transfer isn't a v1 capability.
- **Director adding their own characters.** A director can `SubmitCharacter` against their own characters (e.g. for DMPCs); the reducer-level approval still goes through `ApproveCharacter`, which they'll dispatch themselves. Slightly silly but cheap and consistent.

## Documentation impact

- `CLAUDE.md` — terminology section: add Campaign / Lobby / Encounter Template / Session-reserved.
- `docs/ARCHITECTURE.md` — rename "session" → "campaign" throughout; lobby/encounter split explained.
- `docs/data-pipeline.md` — D1 schema section regenerated.
- `docs/intent-protocol.md` — list new intents; `JoinSession`/`LeaveSession` renamed.
- `docs/rules-engine.md` — `SessionState` → `CampaignState`; participant/encounter split.
- `docs/phases.md` — Phase 1 acceptance criteria reworded to use new vocabulary; encounter builder reframed as **template builder** (separate from lobby), and the in-lobby "add" affordance described.
- New: `docs/superpowers/specs/2026-05-10-campaigns-restructure-design.md` (this file).

## Open assumptions surfaced during brainstorming

1. Invite-code redemption grants membership immediately, no DM approval. (Membership is gate-free; character registration is the DM-gated step.)
2. One invite code per campaign, regenerable by director. (Same as today; not specced here, but worth flagging it stays.)
3. A character can be in multiple campaigns simultaneously. (Schema doesn't constrain; user can run the same hero in two groups.)
4. Templates contain monsters only — no heroes, no terrain geometry (just optional prose notes).
5. Loading a template mid-combat is allowed and does not advance initiative; new monsters land in the roster and get added to the end of the turn order for the *next* round, not the current one. (Implementation detail to confirm during plan-writing.)
6. `ClearLobby` exists and is the only roster-wipe affordance; `EndEncounter` never touches the roster.

If any of these are wrong, raise it on review.
