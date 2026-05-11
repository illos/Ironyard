# Phase 2 — Epic 1: Character system core

Design for the character schema, derivation, API, wizard, runtime sheet, and the seam between user-owned characters and in-encounter participants.

Phase 2 as written in `docs/phases.md` covers two cohesive but independent subsystems. This spec is **Epic 1 only** — the character core that everything in Phase 2 (and Phase 3+) depends on. Items + inventory + `CharacterAttachment` activation are **Epic 2**, scoped separately.

## Scope

**In:**
- `CharacterSchema` review and cleanup (drop the cached `characteristics` field)
- A submission-validity schema (`CompleteCharacterSchema`) layered on top of `CharacterSchema`
- A single derivation function `deriveCharacterRuntime(character, staticData)` in `packages/rules`
- API surface: `GET /characters`, `GET /characters/:id`, `POST /characters` (with optional `campaignCode`), `PUT /characters/:id`
- Invite-code flow: paste code → join campaign + set `campaignId` + auto-`SubmitCharacter` in one POST
- D1 migration: `campaign_settings TEXT` column on `campaigns` (opaque nullable blob); `xp` field on `CharacterSchema`; `partyVictories` field on `CampaignState`
- Wizard (web): linear-loose for create, fully-editable for re-entry
- Interactive character sheet with three render modes (standalone / in-lobby-no-encounter / in-encounter)
- Character ↔ Participant seam: thin roster placeholder + structural-rederive-at-`StartEncounter` + runtime-state-persists semantics
- New intents: `SwapKit`, `Respite`
- `BringCharacterIntoEncounter` semantic shift (now adds a placeholder, not a participant)
- Data ingest cleanup: parse-class subclass-label bug (Conduit, Troubadour), parse-complication 8/100 failures, smoke tests
- Doc updates (intent-protocol.md, ARCHITECTURE.md, phases.md, tech stack)

**Out (Epic 2 spec):**
- Item data ingest (treasure types from `data-md`)
- Character inventory schema
- `CharacterAttachment` activation (Phase 1 scaffold lights up here)
- Consumables, trinkets, leveled treasures, artifacts logic
- Equipped vs. carried, kit-keyword integration

**Out (entirely / deferred):**
- Per-campaign custom content authoring UI (homebrew editor is post-v1; `campaign_settings` ships as opaque blob and stays no-op in Phase 2)
- IndexedDB / offline-first / local intent queue (cut from v1)
- Title system runtime (rides Epic 2's `CharacterAttachment` machinery)

## Decisions summary

| # | Decision | Rationale |
|---|---|---|
| 1 | Campaign customization via Option C — character carries optional `campaignId`; `campaign_settings` is opaque, nullable, deferred-content | "Characters are user-owned" stays clean; validation at submit time, not creation time |
| 2 | Derivation lives in `packages/rules` (`deriveCharacterRuntime`); no cached resolved values on the character | Rules live in `packages/rules` already; cache-on-write duplicates engine logic into the wizard |
| 3 | D1 is the only persistence; no IndexedDB / offline support in v1 | 99% of play happens with a connection; offline adds significant complexity for rare benefit |
| 4 | `CharacterSchema` stays draft-tolerant; `CompleteCharacterSchema` is the submission gate | Drafts are real; submission validity is a separate concern |
| 5 | Character ↔ Participant: Option β with refinement — structural re-derive at `StartEncounter`, runtime state persists between encounters in the lobby session | Level-ups between encounters propagate automatically; recoveries economy stays correct (canon §2.13) |
| 6 | Wizard fully editable post-creation; no auto-re-approval on structural edits | Friend-group trust model (CLAUDE.md) |
| 7 | Kit swap is a runtime intent (`SwapKit`), not a wizard-only edit | Kits change per-respite in Draw Steel; sheet should expose it |
| 8 | `Respite` is a real intent (not a UX wrapper) | Auditable single log entry for a canon-meaningful event |
| 9 | Party-shared victories on `CampaignState`; per-character `xp` on the character blob; respite converts at 1:1 (confirmed against printed rulebook) | Matches Draw Steel canon |
| 10 | Wizard step order follows Draw Steel canonical sequence: ancestry → culture → career → class (incl. characteristic array, subclass, level picks) → complication → kit → details | Compendium order, also what the handoff schema implies |

## Data model

### `CharacterSchema` (in `packages/shared/src/character.ts`)

Already mostly scaffolded by handoff. Changes:

- **Drop `characteristics`** (the cached resolved field). It becomes a pure output of `deriveCharacterRuntime`.
- **Keep `characteristicArray`** as the raw user pick. The derivation function reads `classId` + `characteristicArray` and produces a `Characteristics` map at render time.
- **Add `xp: z.number().int().min(0).default(0)`**.
- `campaignId: z.string().nullable().default(null)` is already there. Keep.

`CharacterSchema` remains draft-tolerant: every field nullable or defaulted. A partially-built character is `CharacterSchema`-valid.

### `CompleteCharacterSchema` (new, same file)

Layered on top of `CharacterSchema` via `.refine()`s. Validation rules for a "ready to submit" character:

- `ancestryId !== null`
- `culture.environment / organization / upbringing` all set; one skill picked per aspect; one language picked
- `careerId !== null`; `careerChoices.skills.length` matches the career's skill count; `careerChoices.languages.length` matches `languageCount`; `careerChoices.incitingIncidentId !== null`; `careerChoices.perkId !== null` if the career grants one
- `classId !== null`; `characteristicArray !== null`; `subclassId !== null` if the class has subclasses
- `levelChoices` populated for every level from 1 through `level`, with required picks satisfied
- `kitId !== null` if the class uses a kit
- `name` non-empty (lives on the row column, but enforced here for the wizard's "submit" enable state)

`CompleteCharacterSchema` is consumed by:
- The wizard's "Submit" button enable state
- The API's `POST /characters` handler when `campaignCode` is present
- The reducer's `applySubmitCharacter` authority check

### Participant changes

`ParticipantSchema` (in `packages/shared/src/participant.ts`) is already in good shape from Phase 1. No structural changes — the runtime fields it already carries (`currentStamina`, `recoveries`, `heroicResources`, `extras`, `surges`, `conditions`) are what the materialization step at `StartEncounter` populates from the derived character runtime.

Material change is in the **roster representation**, not the participant shape: see "Character ↔ Participant seam" below.

### `CampaignState` changes (in `packages/rules/src/types.ts`)

- **Add `partyVictories: number`** — accumulates during encounters; drained by `Respite` to per-character XP.
- **Roster shape**: `participants` becomes a discriminated union of `{ kind: 'pc', characterId, ownerId, position }` (placeholder) and `Participant` (monsters always; PCs only while an encounter is active). See seam section.

### D1 schema changes

```sql
-- campaign_settings: opaque, nullable. Phase 2 ships the column; the
-- enrichment logic on the wizard is a no-op while the column is null.
ALTER TABLE campaigns ADD COLUMN campaign_settings TEXT;
```

No new tables. Character XP and party victories live inside existing JSON blobs (`characters.data` and `campaign_snapshots.state` respectively).

## Derivation

```ts
// packages/rules/src/derive-character-runtime.ts
export type CharacterRuntime = {
  characteristics: Characteristics;
  maxStamina: number;
  recoveriesMax: number;
  recoveryValue: number;        // typically floor(maxStamina / 3), class can override
  heroicResource: { name: ResourceName; max?: number; floor: number };
  abilities: AbilityRef[];      // signature + chosen heroic + free strike + class triggered
  skills: string[];             // flattened from culture + career + level choices
  languages: string[];          // flattened from culture + career
  immunities: TypedResistance[];
  weaknesses: TypedResistance[];
  speed: number;
  size: string;
  stability: number;
  freeStrikeDamage: number;
};

export function deriveCharacterRuntime(
  character: Character,
  staticData: StaticDataBundle,
): CharacterRuntime;
```

`StaticDataBundle` is the in-memory shape of the bundled JSON files (`classes.json`, `ancestries.json`, `careers.json`, etc.). Already loaded in the web client; needs to be loaded into the DO at cold start (similar to `monsters.json` already is — extend `apps/api/src/data/index.ts`).

**Canon gating.** Derivation does not auto-apply effects beyond what's in `canon-status.generated.ts` as `verified`. For Phase 2 v1, we expect to gate on a small set of slugs: `character-derivation.max-stamina`, `character-derivation.recoveries`, `character-derivation.recovery-value`, `character-derivation.characteristics`. Add these to `docs/rules-canon.md` and run `pnpm canon:gen` before the reducer relies on them. Effects not yet verified fall back to manual override on the sheet (with the raw text shown).

**Called by:**
- Web sheet renderer (every render)
- `applyBringCharacterIntoEncounter` reducer (no — placeholder, doesn't materialize)
- `applyStartEncounter` reducer (yes — materializes participants from placeholders)
- `applyRespite` reducer (uses `recoveriesMax` for refill)
- `applySwapKit` reducer (no state change beyond `kitId`; next StartEncounter picks up)

## API surface

All routes in `apps/api/src/routes/characters.ts` (new file).

| Method | Path | Body | Returns |
|---|---|---|---|
| `GET` | `/characters` | — | `CharacterResponse[]` (owned by current user) |
| `GET` | `/characters/:id` | — | `CharacterResponse` (must be owned by current user, or visible to current user as campaign-shared) |
| `POST` | `/characters` | `CreateCharacterRequest` (`{ name, campaignCode?, data? }`) | `CharacterResponse` |
| `PUT` | `/characters/:id` | `UpdateCharacterRequest` (`{ name?, data? }`) | `CharacterResponse` |
| `DELETE` | `/characters/:id` | — | `{ ok: true }` |

Most schemas are already drafted in handoff (`CreateCharacterRequestSchema`, `UpdateCharacterRequestSchema`, `CharacterResponseSchema` in `packages/shared/src/character.ts`). One change: `CreateCharacterRequestSchema` needs to gain an optional `data: CharacterSchema.optional()` field so the one-shot flow can pass a complete character in the same POST that joins the campaign.

```ts
// updated shape
export const CreateCharacterRequestSchema = z.object({
  name: z.string().min(1).max(80),
  campaignCode: z.string().length(6).optional(),
  data: CharacterSchema.optional(),    // NEW — enables one-shot create+submit
});
```

### `POST /characters` flow (supports both draft and one-shot)

```
1. Resolve campaign if campaignCode present:
   a. Look up campaign by invite_code; 404 if not found.
   b. Insert campaign_memberships row if not present (idempotent).
   c. Determine campaignId for the character row.
2. INSERT INTO characters (id, owner_id, name, data, ...) with data.campaignId
   set to the resolved campaign id (or null if no code; default-empty data if
   body.data omitted).
3. Atomic auto-submit, only if ALL of:
   - body.campaignCode present
   - body.data present
   - CompleteCharacterSchema.safeParse(body.data).success === true
   then dispatch SubmitCharacter via the campaign's LobbyDO. This writes the
   campaign_characters row (status='pending') and lands in the intent log for
   attribution.
4. Return CharacterResponse.
```

**Without `campaignCode`:** plain insert, character has `campaignId: null`, no membership change, no submission.

**With `campaignCode` but without complete `data`:** plain insert with `campaignId` set, membership joined; no submission. The character is now a draft attached to the campaign.

**With `campaignCode` and complete `data`:** create + join + submit, all in one handler.

**Validation timing recap.** Two flows are supported:

- **Draft-then-submit (typical):** wizard does an initial `POST /characters {name, campaignCode}` (or omits the code for a standalone character), then `PUT` on each step. When the player clicks "Submit," the web dispatches `SubmitCharacter` over the WS. Submission gate is `CompleteCharacterSchema` enforced by both the wizard's button enable state and the `applySubmitCharacter` reducer authority check.
- **One-shot (escape hatch):** wizard holds all state in memory; player clicks "Finish" at the end; web does a single `POST /characters {name, campaignCode, data: completeBlob}`. Handler creates + joins + submits atomically. Useful when the player is rebuilding a paper character and doesn't want to round-trip per step.

In practice the web defaults to the draft flow because it preserves work across navigations. The one-shot flow exists because Option C's schema asks for it, and it's cheap.

### Authorization

- All routes require an authenticated session.
- `GET /characters` returns characters where `owner_id = currentUser.id`.
- `GET /characters/:id` allows owner; also allows members of `character.campaignId` if set (so director and tablemates can see).
- `PUT /characters/:id` and `DELETE /characters/:id` require owner.
- `POST /characters` allows any authenticated user.

## Wizard

Lives in `apps/web/src/routes/characters/new.tsx` and `apps/web/src/routes/characters/$id/edit.tsx` (same component, different mode based on URL).

### Step structure

Linear-loose. Steps in Draw Steel canonical order:

0. **Entry** — the route is `/characters/new` (no character id yet) or `/characters/new?code=ABCDEF` (pre-fills the campaign code). On step-1 save, the wizard POSTs to create the row and (if a code was provided) joins the campaign and sets `campaignId`. Subsequent saves are PUTs.
1. **Name + details** (name + pronouns/hair/eyes/etc., all optional except name; campaign code field visible here, editable, persisted into the character's `campaignId` on save)
2. **Ancestry** (pick from `ancestries.json`; ancestry traits sub-picks)
3. **Culture** (environment / organization / upbringing; one skill per aspect; one language)
4. **Career** (pick career; skills/languages/inciting incident/perk sub-picks)
5. **Class** (pick class → characteristic array → subclass → per-level picks)
6. **Complication** (optional; skip allowed)
7. **Kit** (pick from class-compatible kits in `kits.json`; conditional on class)
8. **Review + submit** (renders `deriveCharacterRuntime` output; "Submit" button enabled iff `CompleteCharacterSchema` passes; submit dispatches `SubmitCharacter` over the WS if the player has a `campaignId` set)

Each step shows a "Save & Continue" button (PUTs to D1 then advances) and a "Back" button. Steps are non-linear in practice — the sidebar (or stepper) lets the player jump to any step. Validation errors on a step are warnings, not gates; only the final "Submit" requires `CompleteCharacterSchema` to pass.

### Autosave

PUT on step transition. No timer-based debounced save inside a step — the user explicitly clicks "Save & Continue" to commit. If they navigate away mid-step, the in-memory edits are lost; this is acceptable for v1 prototype-grade UX.

### Re-entry / level-up

Same wizard, opened on an existing character. Player can change any step. No prior-step locking. Level-up specifically: the player edits `level` (in step 1 or on the review screen) and the wizard surfaces the additional `levelChoices` entries that need filling. Submit-state recalculates against `CompleteCharacterSchema`.

Post-approval edits: still allowed. Save → PUT → D1. No re-approval trigger. The director can spot-check via the campaign UI if they want; the trust model carries the rest.

## Sheet

Lives in `apps/web/src/routes/characters/$id/index.tsx`. Three render modes determined by ambient state:

| Mode | Trigger | Affordances |
|---|---|---|
| **Standalone** | Route hit without active lobby connection, or character not in any lobby roster | Read-only structural display; runtime values shown as max defaults from `deriveCharacterRuntime`; "Edit" → wizard; inline narrative-edit fields (name, pronouns, details) |
| **In-lobby, no encounter** | Character in a lobby roster, no encounter active | All of Standalone + "Swap Kit" affordance (dispatches `SwapKit`); narrative inline edit still available |
| **In-encounter** | Character materialized as a participant in an active encounter | Runtime state from the participant (currentStamina, currentRecoveries, current heroic resource, conditions); ability cards dispatch `RollPower`; "Spend Recovery" dispatches `SpendRecovery`; resource controls dispatch `SpendResource` / `GainResource`; self-conditions via `SetCondition`; no structural edits surfaced |

Same component, mode-aware rendering. Dispatching in-encounter goes over the existing WebSocket; standalone has no dispatch surface.

## Character ↔ Participant seam

This is the load-bearing piece. Recap of the model:

**Roster representation.** The `CampaignState.participants` array contains:
- For monsters: `Participant` (full Phase 1 snapshot at `AddMonster` time).
- For PCs: `{ kind: 'pc', characterId, ownerId, position }` (placeholder) **OR** a full `Participant` (materialized, only while an encounter is active).

**`BringCharacterIntoEncounter` (intent semantic shift).** No longer materializes. Adds a placeholder to the roster. Reducer authority check stays the same (active director gated).

**`StartEncounter` (reducer change).** For each PC placeholder in the roster, the DO:
1. Loads the character blob from D1 (or from a stamped payload — see DO stamping below).
2. Calls `deriveCharacterRuntime(character, staticData)`.
3. Constructs a fresh `Participant` from the runtime + the existing runtime state (if this is a subsequent encounter in the same lobby — see below).

DO stamping pattern (per `docs/intent-protocol.md § DO stamping pattern`): `StartEncounter`'s handler loads each pending PC character blob from D1 before calling the reducer, and stamps them onto the intent payload. The reducer stays pure.

**Between-encounter persistence.** When `EndEncounter` fires, PC participants are *not* converted back to placeholders. They stay in the roster as full `Participant`s with their current runtime state preserved. The participant's `conditions` array is wiped (slice-5/6 logic), `surges` reset to 0, heroic resources reset to floor (slice-7 logic) — but `currentStamina` and `recoveries.current` carry over. This way `SpendRecovery` between encounters works on a live participant with the right pool.

The next `StartEncounter` does **structural re-derivation only**: it overwrites characteristics, max stamina, recoveries.max, abilities list, kit-derived stats, etc., but preserves the runtime fields the participant has accumulated (`currentStamina`, `recoveries.current`). XP lives on the character blob, not the participant, so it's untouched by encounter boundaries.

Edge case: if a PC's `maxStamina` *drops* on re-derive (e.g. they got demoted somehow), clamp `currentStamina` to the new max. If `recoveries.max` drops, clamp `recoveries.current`.

**Monsters keep Phase 1 semantics** (snapshot at `AddMonster`, never re-derive). The asymmetry is intentional — monsters are ephemeral and director-controlled; PCs are persistent and player-edited.

## New intents

### `SwapKit`

```ts
// packages/shared/src/intents/swap-kit.ts
export const SwapKitPayloadSchema = z.object({
  characterId: z.string().min(1),
  newKitId: z.string().min(1),
});
```

- Dispatcher: the character owner OR the active director.
- Authority gate: rejected if `state.encounter !== null` (no kit swaps mid-encounter).
- Reducer effect: side-effect intent — mutates `characters.data.kitId` in D1, returns unchanged `CampaignState`.
- Log: yes, attributed.
- Next `StartEncounter` re-derives with the new kit.
- Pattern: same as `SubmitCharacter` (side-effect intent — D1 mutation, no `CampaignState` change).

### `Respite`

```ts
// packages/shared/src/intents/respite.ts
export const RespitePayloadSchema = z.object({}).strict();
```

- Dispatcher: any campaign member (table-level group decision; lobby director typically clicks it).
- Authority gate: rejected if `state.encounter !== null` (respites happen outside encounters).
- Reducer effect (hybrid — state-mutating AND D1 side-effect):
  - For each `Participant` in the roster with `kind: 'pc'` and `recoveries.max > 0`: set `recoveries.current = recoveries.max`. (`CampaignState` mutation.)
  - Read `state.partyVictories`; for each PC participant, dispatch a side-effect to increment that character's `data.xp` by `state.partyVictories`. Drain `state.partyVictories = 0`. (D1 side-effect + state mutation.)
- Log: yes, attributed. Single log entry summarizes "Respite: refilled recoveries for 4 heroes; converted 3 victories → 3 XP each."

**Hybrid intent pattern.** `Respite` is the first intent that both mutates `CampaignState` AND writes to D1 outside `campaign_snapshots`. The intent-protocol doc currently treats these as two disjoint categories (state-mutating vs. side-effect). Doc update: a third category, "hybrid," with `Respite` as the canonical example. Behavior:
- Authority and validation happen in the reducer as usual.
- The DO performs the D1 side-effect inside the same serialized op as the state mutation, after the reducer succeeds.
- Not undoable (the side-effect side cannot be rolled back); the Undo path silently skips hybrid intents the same way it does pure side-effects.

## Build work (handoff cleanup)

Discrete tasks to clear before this spec's main work begins:

1. **`parse-class.ts` subclass-label bug.** Conduit and Troubadour still fail after `ad56537`. Inspect their markdown for the subclass-section heading pattern; the regex needs to tolerate the third variant. Verify with `pnpm build:data` — all 9 classes parse clean.
2. **`parse-complication.ts` failures.** 8 of 100 fail with "missing Benefit field." Inspect at minimum `Advanced Studies.md`, `Feytouched.md`, `Shared Spirit.md`. Make the parser tolerate the additional markdown variants.
3. **Smoke tests.** Add `packages/data/tests/parse-ancestry.spec.ts`, `parse-career.spec.ts`, `parse-complication.spec.ts`, `parse-class.spec.ts` — at minimum one fixture each, following `parse-monster.spec.ts`'s pattern.
4. **`CharacterSchema` consistency review.** Drop the `characteristics` field. Confirm `SubmitCharacterPayloadSchema` (in `packages/shared/src/intents/submit-character.ts`) and the `campaign_characters` D1 row align with `CharacterResponseSchema`. Reconcile any drift.

## Doc updates

- **`docs/ARCHITECTURE.md`:** remove the "IndexedDB (Dexie)" arrow in the system diagram and the "Local-first: intents queue in IndexedDB if the WS is down" bullet. Remove Dexie from the tech-stack table.
- **`docs/phases.md`:** remove "Local-first: characters cached in IndexedDB so the iPad keeps working when wifi flakes" from Phase 2.
- **`docs/intent-protocol.md`:**
  - Update `BringCharacterIntoEncounter` description: now adds a roster placeholder; materialization happens at `StartEncounter`.
  - Add `SwapKit` to the campaign-character-lifecycle subsection (or a new "character-runtime" subsection).
  - Add `Respite` to combat-lifecycle. Note: hybrid intent.
  - Add a third subsection "Hybrid intents" under or near "Side-effect intent pattern" describing the pattern with `Respite` as the canonical example.
  - Update DO stamping table: add `StartEncounter` (now stamps PC character blobs from D1).
- **`docs/rules-canon.md`:** add entries for the derivation slugs (`character-derivation.max-stamina`, etc.). Each needs a source check + manual user review pass to flip to ✅ per the two-gate workflow.
- **`docs/data-pipeline.md`:** add `kits.json` to the output list if not present; document the `campaign_settings` column as opaque/nullable/deferred.

## Testing strategy

| Package | Tests |
|---|---|
| `packages/data` | Parser smoke tests for ancestry, career, complication, class (per build-work item 3) |
| `packages/shared` | `CompleteCharacterSchema` refinement tests (one fixture each: empty draft → reject; complete → pass; one missing required field → reject with correct error code per field) |
| `packages/rules` | `deriveCharacterRuntime` against a small set of fixtures (1 fighter L1, 1 talent L3, 1 conduit L5) checking canon-gated outputs; `applySwapKit` (mutates D1, leaves state); `applyRespite` (refills recoveries, drains victories, increments XP); `applyStartEncounter` with PC placeholders (materializes correctly, picks up runtime state on subsequent encounter) |
| `apps/api` | Route tests for `POST /characters` with and without `campaignCode`; auth checks for GET/PUT/DELETE |
| `apps/web` | Wizard step-transition autosave, submit-button enable state, sheet render modes (snapshot via Playwright or RTL) |

iPad-portrait + iPhone-portrait screenshot review on the wizard and sheet before claiming the spec complete.

## Acceptance

A player who has never used Ironyard can, in one session:

1. Sign up, get a campaign invite code from the director.
2. Open `/characters/new`, paste the invite code on the first step.
3. Walk the wizard through ancestry → culture → career → class (with characteristic array, subclass, level picks) → complication → kit → review.
4. Click "Submit." The character is created in D1, joined to the campaign, and appears in the director's pending queue.
5. Director approves.
6. Director runs `StartEncounter`. The PC participant materializes with correct max stamina, recoveries, abilities, and characteristic-derived attack bonuses.
7. Player rolls abilities from their phone via the sheet; takes damage; spends a recovery to heal.
8. Encounter ends. Player's currentStamina and recoveries.current carry into the next encounter.
9. Party clicks "Respite" from the lobby UI. Recoveries refill; victories convert to XP at 1:1.
10. Player levels up in the wizard. Next `StartEncounter` picks up the new max stamina automatically.

No paper, no rulebook open, no separate spreadsheet.

## Open detail

None blocking. Respite victory→XP rate confirmed at 1:1.
