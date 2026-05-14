# Phase 2 Epic 2E — Sessions Layer (MVP)

**Status:** Designed, awaiting plan.
**Predecessor:** Phase 2 Epic 2D — Encounter lifecycle cleanup ([plan](../plans/2026-05-13-phase-2-epic-2d-encounter-lifecycle-cleanup.md)).
**Successor:** Phase 2 Epic 2F — Combat feature-completeness (Clusters A + B + C — lifecycle automation, encounter-start init, damage state machine).
**CLAUDE.md alignment:** the `Session` term has been reserved as a non-feature since v1; this epic lights it up. The reservation note is updated accordingly.

## One-line summary

Introduce a real "play session" boundary as a thin scaffold. Heroes start each session with hero tokens equal to attending-party size; encounters auto-populate from session attendance; combat cannot begin without an active session. The data layer (`sessions` table, `currentSessionId` on Campaign) is the load-bearing change — once it exists, future epics (combat completeness, character sharing, per-session notes) can hang off it.

## Goals

- A play session is a first-class entity with its own row, name, start/end timestamps, and attendance list.
- `StartSession` declares "who's at the table tonight" by picking from approved campaign characters; that list drives:
  - Hero token initialization at the canon-prescribed rate (= attending characters count).
  - Pre-checked character list in the EncounterBuilder.
- Hero tokens are a campaign-level pool tracked across encounters within a session; spent during play; reset on next `StartSession`. Two cheap spend paths land in this epic (`+2 surges`, regain stamina = recoveryValue); retroactive variants (reroll, succeed-on-fail-save) defer to a follow-up epic.
- `EndSession` cleanly closes a session; `StartEncounter` rejects if no session is active.
- Mid-session attendance adjustments (`UpdateSessionAttendance`) for late arrivals / early departures, without auto-granting tokens.

## Non-goals

Deferred to later epics so this stays a scaffold, not a destination:

- **Session detail / list pages.** `/campaigns/:id/sessions` route and per-session intent filtering UI do not ship in 2E. Add when a playtest specifically asks for "show me last week's session log."
- **Retroactive hero-token spend paths** (reroll-the-last-test, succeed-on-fail-save). These need a generic `RetroSubstitute` intent that voids a specific past intent and re-threads the cascade. Real engine work, separate epic. The pool + cheap spend paths land here; full spend semantics later.
- **NPC ally entities + Character sharing** (the entity_grants table and `effective_controller()` resolver from [`character-sharing.md`](../../character-sharing.md)). Phase 3 capability. The session-attendance schema is designed forward-compatible — see [Forward-compat notes](#forward-compat-notes).
- **Per-session notes / victories.** Notes stay campaign-scoped; victories remain `state.partyVictories` and drain on Respite. Sessions are real-world bookkeeping; respite is the in-game drain event. Decoupling them is correct.
- **Combat automation (Epic 2F).** Cluster A + B + C — EoT condition expiry, malice auto-gain per round, heroic resource turn-start generation, winded/dying state machine, Stabilize roll, Temporary Stamina. All deferred to Epic 2F so this epic stays focused.
- **Cross-session character sharing flow** (lent characters move between sessions). The session-attendance schema names entities by character ID; when Phase 3 lands and a player can attend with a borrowed character, the same ID flows through unchanged. No data migration.

## Architecture

### Data model

**New D1 table `sessions`:**

```sql
CREATE TABLE sessions (
  id                       TEXT PRIMARY KEY,           -- ulid
  campaign_id              TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name                     TEXT NOT NULL,              -- director-supplied or 'Session N'
  started_at               INTEGER NOT NULL,           -- ms epoch
  ended_at                 INTEGER,                    -- null while active
  attending_character_ids  TEXT NOT NULL,              -- JSON-encoded string[]
  hero_tokens_start        INTEGER NOT NULL,
  hero_tokens_end          INTEGER                     -- snapshot at EndSession; null if active
);

CREATE INDEX sessions_campaign_idx ON sessions(campaign_id, started_at DESC);
```

**Campaign table addition:**

```sql
ALTER TABLE campaigns ADD COLUMN current_session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL;
```

### CampaignState additions

```ts
type CampaignState = {
  // ...existing fields...
  currentSessionId: string | null;          // mirrors campaigns.current_session_id
  attendingCharacterIds: string[];          // mirrors session.attending_character_ids
  heroTokens: number;                       // live pool; set at StartSession, mutated by Gain/SpendHeroToken
};
```

The state mirrors session attendance so the reducer / UI don't have to join across tables for every read. The D1 row is the canonical record for cross-session history; the state fields are the live values.

### Intents

Five new intents land in `packages/shared/src/intents/`:

```ts
// All four are director-only at the actor check.
StartSession {
  name?: string;                            // default 'Session N' (server-stamped from sessions count + 1)
  attendingCharacterIds: string[];          // pre-validated against approved characters
  heroTokens?: number;                      // optional override; default = attendingCharacterIds.length
};

EndSession {
  // No payload; reducer reads state.currentSessionId.
};

UpdateSessionAttendance {
  add?: string[];                           // characterIds to extend the list
  remove?: string[];                        // characterIds to drop
  // No auto-grant of hero tokens (canon: tokens are 'at session start').
};

GainHeroToken {
  amount: number;                           // director-supplied bonus (≥ 1)
};

SpendHeroToken {
  amount: number;                           // 1 or 2
  reason: 'surge_burst' | 'regain_stamina' | 'narrative';
  participantId: string;                    // who's spending — for log attribution and derivations
};
```

#### Reducer behavior summary

| Intent | Effects on state | Derived intents | Side-effects (D1) |
|---|---|---|---|
| `StartSession` | sets `currentSessionId`, `attendingCharacterIds`, `heroTokens` | none | inserts `sessions` row; updates `campaigns.current_session_id` |
| `EndSession` | clears `currentSessionId`, `attendingCharacterIds`; preserves `heroTokens` for history but pool becomes inaccessible (no active session = can't spend) | none | stamps `sessions.ended_at` and `hero_tokens_end`; clears `campaigns.current_session_id` |
| `UpdateSessionAttendance` | mutates `attendingCharacterIds` | none | updates `sessions.attending_character_ids` |
| `GainHeroToken` | `heroTokens += amount` | none | none |
| `SpendHeroToken { reason: 'surge_burst' }` | `heroTokens -= amount` | `GainResource { name: 'surges', amount: 2 }` against `participantId` | none |
| `SpendHeroToken { reason: 'regain_stamina' }` | `heroTokens -= amount` | `ApplyHeal { targetId: participantId, amount: recoveryValue }` (no recovery spent) | none |
| `SpendHeroToken { reason: 'narrative' }` | `heroTokens -= amount` | none — director / player narrates | none |

#### Validation rules

- `StartSession` rejects if `state.currentSessionId !== null` (one session at a time).
- `StartSession` rejects if any `attendingCharacterIds[i]` is not in the campaign's approved-character list.
- `StartSession` rejects if `heroTokens < 0` (zero is valid for harsh-mode campaigns).
- `EndSession` rejects if `state.currentSessionId === null`.
- `UpdateSessionAttendance` rejects if no active session, or if any `add[i]` is not approved.
- `GainHeroToken` rejects if `amount < 1`.
- `GainHeroToken` / `SpendHeroToken` reject if no active session.
- `SpendHeroToken { reason: 'regain_stamina', amount }` requires `amount === 2`; `surge_burst` requires `amount === 1`; `narrative` requires `amount >= 1`.

#### StartEncounter enforcement

`applyStartEncounter` gains one new precondition:

```ts
if (state.currentSessionId === null) {
  return { state, derived: [], log: [...], errors: [{ code: 'no_active_session', message: 'start a session before running combat' }] };
}
```

The EncounterBuilder pre-checks `attendingCharacterIds` in its character checklist. The director can override at encounter time — uncheck a player who stepped out, check a guest character that's been added via `UpdateSessionAttendance`. The intent itself still consumes `characterIds[]` from its payload, so 2E does not change Epic 2D's atomic StartEncounter contract; the pre-population is a UI default.

### Stamping

The DO stamper for `StartSession`:

```ts
// apps/api/src/lobby-do-stampers.ts
async function stampStartSession(intent, campaignState, env) {
  const conn = db(env.DB);
  // 1. Read approved-character roster from D1 to validate the attending list.
  // 2. Read existing sessions count for default name 'Session N' if name omitted.
  // 3. Stamp the validated list + default name onto intent.payload.
}
```

Other session intents are pure reducer-side (no D1 reads needed for validation).

### Side-effects

Three new side-effects in `apps/api/src/lobby-do-side-effects.ts`:

- `sideEffectStartSession` — INSERT into `sessions`; UPDATE `campaigns.current_session_id`.
- `sideEffectEndSession` — UPDATE `sessions.ended_at` + `hero_tokens_end`; UPDATE `campaigns.current_session_id = null`.
- `sideEffectUpdateSessionAttendance` — UPDATE `sessions.attending_character_ids` to the new list.

`GainHeroToken` / `SpendHeroToken` are state-only — no D1 write (the pool lives on CampaignState; the session row's `hero_tokens_*` columns are start/end snapshots only).

### UI surface (CampaignView)

**No active session** (`currentSessionId === null`):

```
┌────────────────────────────────────────────────┐
│ Start a new session                            │
│                                                │
│ Session name (optional): [Session 3       ]    │
│                                                │
│ Who's playing tonight?                         │
│   ☑ Mira Brightblade  (Alice)                  │
│   ☑ Garth Stoneheart  (Bob)                    │
│   ☐ Sage Wyrmflame    (Cleric)                 │
│   ☑ Pip Greenfingers  (David)                  │
│                                                │
│ Hero tokens at start:  [  3  ]  (= attending)  │
│                                                │
│              [ Start session ]                 │
└────────────────────────────────────────────────┘
```

The session-name input is pre-filled with "Session N" where N is `sessions.count(campaign_id) + 1`. The hero-tokens count auto-updates as boxes toggle but is editable so directors can grant a generous starting pool.

**Active session:**

```
┌────────────────────────────────────────────────────┐
│ Session: Bandit Camp · started 2026-05-13         │
│ 3 attending · 2 / 3 hero tokens                    │
│                       [Edit attendance] [End session]│
└────────────────────────────────────────────────────┘
```

The "End session" button confirms before dispatching. Tokens remaining at end are preserved on the session row for history but pool becomes locked (the next `StartSession` overrides).

The "Edit attendance" button opens an inline panel showing the campaign's full approved roster with checkboxes (current attendees pre-checked); on save it dispatches `UpdateSessionAttendance { add, remove }` with the diff. Hero tokens do not auto-adjust — the director uses `GainHeroToken { amount: N }` separately if they want to be generous to late arrivals.

The "Approved characters" section on the campaign page filters to `attendingCharacterIds` during an active session — what the director sees is who's at the table tonight, not the full roster.

### UI surface (PlayerSheetPanel)

When an active session is in place AND the connected user owns one of the attending characters, the sheet panel surfaces hero-token spend buttons next to the existing "Spend recovery" affordance:

```
┌──────────────────────────────────────────┐
│ Hero tokens: 2 / 3                        │
│                                           │
│   [ +2 Surges  (1 token) ]                │
│   [ Regain Stamina  (2 tokens) ]          │
└──────────────────────────────────────────┘
```

Buttons disabled when insufficient tokens. The "Regain Stamina" dispatch uses the participant's `recoveryValue` (no recovery spent — the token replaces it).

Narrative spend (the reroll / succeed-on-fail variants) is **not surfaced** in this epic. The director / player narrates and either spends manually via `SpendHeroToken { reason: 'narrative', amount: 1 }` or waits for the retro-substitution epic.

### UI surface (EncounterBuilder)

The character checklist on `/campaigns/:id/build` is pre-checked from `state.attendingCharacterIds` rather than starting empty. Players who aren't attending the session do not appear in the list at all (only the attending subset). If the director wants to include a non-attending character mid-encounter (rare edge case), they update session attendance first via the campaign page, then return to the builder.

The "no active session → can't start encounter" gate surfaces as a banner on the builder route: "Start a session before building an encounter."

## Forward-compat notes

The character-sharing spec ([`character-sharing.md`](../../character-sharing.md)) ships in Phase 3 and will add:

1. **NPC allies** — director-owned persistent entities that travel across sessions on hero initiative. They should attend sessions alongside PCs.
2. **Borrowed characters** — players can control characters owned by other users via `entity_grants`. A borrowed character at the table is just a character ID; the resolver picks the active controller at encounter start.

This epic supports both forward-paths without requiring a data migration:

- `attendingCharacterIds` works unchanged for borrowed characters (the ID is the same).
- For NPC allies, Phase 3 will add a parallel `attending_npc_ally_ids: TEXT` column OR rename the column to `attending_entity_ids` (JSON `[{kind, id}, ...]`). The rename is a one-migration Drizzle change; we don't pay that cost in 2E.
- Hero token formula (`= attending PCs only`) survives the Phase 3 extension because NPC allies don't count toward party-size by canon.

## Data flow

```
User taps "Start session" with attending list
                  ↓
Client dispatches StartSession (WS)
                  ↓
DO stamps validated attendingCharacterIds + default name
                  ↓
applyStartSession reducer
  - sets state.currentSessionId, attendingCharacterIds, heroTokens
                  ↓
sideEffectStartSession
  - INSERT sessions row
  - UPDATE campaigns.current_session_id
                  ↓
DO broadcasts applied envelope to all clients
                  ↓
useSessionSocket.reflect updates local mirror
                  ↓
CampaignView shows "Session: X · Y tokens" badge

[ encounter happens ]

User taps "End session"
                  ↓
Client dispatches EndSession
                  ↓
applyEndSession reducer
  - clears state.currentSessionId, attendingCharacterIds
  - preserves state.heroTokens for history (pool becomes inaccessible w/o session)
                  ↓
sideEffectEndSession
  - UPDATE sessions.ended_at + hero_tokens_end
  - UPDATE campaigns.current_session_id = null
                  ↓
Broadcast applied; UI returns to "Start a new session" panel
```

## Error handling

Standard intent-rejection pattern: invalid payload / pre-condition failure returns `{ errors: [{ code, message }] }` from the reducer with no state change. Codes added:

| Code | When |
|---|---|
| `no_active_session` | StartEncounter, EndSession, UpdateSessionAttendance, GainHeroToken, SpendHeroToken — any session-required intent with `currentSessionId === null` |
| `session_already_active` | StartSession when `currentSessionId !== null` |
| `unknown_character` | StartSession or UpdateSessionAttendance referencing a non-approved character |
| `insufficient_tokens` | SpendHeroToken when amount > heroTokens |
| `invalid_spend_reason` | SpendHeroToken with mismatched (reason, amount) — e.g. surge_burst with amount=2 |

All errors are logged at `kind: 'error'` level in the intent log. The UI surfaces a toast.

## Testing

Tests follow the existing per-intent unit-test pattern:

- `packages/shared/tests/intents/start-session.spec.ts` — payload schema (valid, missing fields, wrong types)
- `packages/rules/tests/intents/start-session.spec.ts` — reducer (success, session_already_active, unknown_character, default-name generation when omitted)
- `packages/rules/tests/intents/end-session.spec.ts` — reducer (success, no_active_session)
- `packages/rules/tests/intents/update-session-attendance.spec.ts` — reducer (add, remove, mixed, no_active_session, unknown_character)
- `packages/rules/tests/intents/gain-hero-token.spec.ts` — reducer (success, no_active_session, negative amount rejected)
- `packages/rules/tests/intents/spend-hero-token.spec.ts` — reducer (each reason path, insufficient_tokens, invalid_spend_reason, derived intent emission)
- `apps/api/tests/lobby-do-stampers.spec.ts` — extend with `stampStartSession` cases (validates against approved roster, defaults session name)
- `apps/api/tests/sessions-side-effects.spec.ts` — new file; mocks D1 to verify INSERT / UPDATE patterns for StartSession + EndSession + UpdateSessionAttendance
- `apps/api/tests/integration/sessions-flow.spec.ts` — new integration test; full StartSession → StartEncounter → EndSession cycle through the real DO + Miniflare D1

Existing tests that need updating:

- `packages/rules/tests/start-encounter.spec.ts` — every test that calls `applyStartEncounter` against a state with `currentSessionId === null` now needs to either set `currentSessionId` in the fixture or expect a `no_active_session` rejection. Most fixtures get a one-line `currentSessionId: 'sess-test'` addition to `baseState`.
- `apps/api/tests/integration/lobby-ws-flow.spec.ts` — integration tests that dispatch StartEncounter against a fresh campaign now need to dispatch StartSession first.

Expected delta: ~40 new tests, ~15 existing tests updated.

## Migration

Existing campaigns have `current_session_id = NULL` after the Drizzle migration runs. Directors hit "Start session 1" before their next play night. **No backfill, no synthesized historical sessions.** Prior intents (from playtests already in production) remain in the intent log and reflect their original campaign state — they just aren't grouped under a session row.

The follow-up implication is that the not-yet-implemented `/campaigns/:id/sessions` list page (deferred to a future epic) would show "Session 1" as the earliest entry per campaign — accurate, just not retroactive.

## Documentation deliverables

This epic touches three docs alongside code:

- **`CLAUDE.md` terminology table** — remove the "**Session** | **Reserved.** Not used in v1." row; replace with the active definition: "**Session** — a real-world play meeting bounded by `StartSession` / `EndSession` intents. Heroes start each session with hero tokens equal to attending PC count. Sessions group encounters chronologically within a campaign."
- **`docs/intent-protocol.md`** — new section "Sessions" listing the five new intents and the `no_active_session` precondition on `StartEncounter`.
- **`docs/phases.md`** — Phase 2 Epic 2E shipping note (added when the implementation lands).

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Existing campaigns currently mid-encounter break when 2E ships (StartEncounter starts rejecting on null currentSessionId) | The Drizzle migration runs cleanly because no encounter is mid-flight at deploy time (we control deploys). Any active encounter at the time of deploy completes normally via the in-memory DO state — the validation only fires on *new* StartEncounter intents. Worst case: director sees "Start a session first" banner on next encounter and clicks one button. |
| Director forgets to End Session before walking away from the table | No data integrity issue — sessions just stay open indefinitely. The next StartSession is blocked by `session_already_active`. UI nudge: campaign list shows a "Session active for 4 days — end it?" warning after 24h. Out of scope for 2E; ship the basic warning in a follow-up. |
| Hero token spend with `participantId` that's not in the encounter (e.g. player not currently in combat) | Reducer accepts spend against any approved character of the campaign (validates participantId references a real attending character; not encounter-participant-required). `regain_stamina` requires the character to have a participant entry in the active encounter to apply heal; reducer rejects with `participant_not_in_encounter` if not. Surge spends work on a participant regardless. |
| Phase 3's character-sharing model treats sessions as already-existing | Pre-baked into the design. The `attendingCharacterIds` shape is forward-compatible with `{kind, id}` entity tuples; the migration path is a single Drizzle column add. |

## Open questions

None at design time. All scope decisions locked in brainstorming. The retroactive hero-token spend epic and the Combat-Completeness epic (2F) are separately specified.
