# Phase 2 — Epic 1 frontend: character wizard + interactive sheet

Design for the web client that consumes the Phase 2 Epic 1 backend: a character-creation wizard, a three-mode character sheet, the in-encounter player panel inside CombatRun, and the supporting query/mutation/static-data layer.

This is **prototype-grade** UI. Phase 5 will rebuild every surface against a stable engine and intent contract. The goal of this work is to prove that the Epic 1 backend (character schema, derivation, roster placeholders, materialization, new intents) is correct end-to-end — not to ship considered design.

## Scope

**In:**

- New static-data hooks for ancestries, careers, classes, complications, kits — same pattern as the existing `useMonsters` hook
- Character query + mutation hooks: `useCharacter`, full `useMyCharacters`, `useCreateCharacter` (extended), `useUpdateCharacter`, `useDeleteCharacter`, `useAttachCharacterToCampaign`
- Wizard at `/characters/new` and `/characters/$id/edit` (same component, two modes)
- Sheet at `/characters/$id` covering standalone + in-lobby-no-encounter modes
- `PlayerSheetPanel` mounted inside `CombatRun` for in-encounter mode
- Entry points from Home, CampaignView, and direct-link with `?code=ABCDEF`
- Respite affordance on CampaignView
- Backend addition 1: `POST /api/characters/:id/attach` — retroactively attach a standalone character to a campaign with auto-submit if data is complete
- Backend addition 2: `ownerId` field on `ParticipantSchema` (nullable; populated for PC participants at `StartEncounter` materialization) — required for `PlayerSheetPanel` to identify the viewer's own materialized participant

**Out (deferred):**

- Kit ingest + real KitStep picker — **Epic 2** (parser + `kits.json`; the step is class-conditional and renders a placeholder until then)
- Items / inventory / `CharacterAttachment` activation — **Epic 2**
- Visual regression / Playwright tests — **Phase 5**
- Per-section progress pips / completion % on the wizard stepper — **Phase 5**
- Color-pack persistence — **Phase 5** Layer 2
- IndexedDB / offline sheet — **Phase 6**
- Per-campaign custom content authoring — post-v1
- Title system runtime — rides Epic 2's CharacterAttachment work

## Decisions summary

| # | Decision | Rationale |
|---|---|---|
| 1 | KitStep is class-conditional. With empty `kits.json` in Epic 1, kit-using classes hit a "comes in Epic 2" placeholder; non-kit classes skip the step entirely | Same wizard shape works in Epic 1 and Epic 2; only the data populates differently |
| 2 | In-encounter sheet renders as `PlayerSheetPanel` inside `CombatRun`, not as a separate route | Players reference their sheet heavily in combat; one-screen context is essential. Sheet route handles only standalone + in-lobby-no-encounter modes |
| 3 | Wizard state is local React state; PUT on Save & Continue; no debounced autosave | Spec-aligned; navigation-away losing in-step edits is acceptable for prototype |
| 4 | Wizard never speaks to WebSocket. Only the final `SubmitCharacter` and any "in-lobby" affordances on the sheet use the WS | Wizard remains usable standalone (no campaign connection required) |
| 5 | Steps are jumpable via top-of-page `StepStepper`; validation surfaces only on Submit | Linear-loose UX; spec-aligned |
| 6 | New `POST /:id/attach` endpoint for retroactive standalone → campaign attach | Cleaner than overloading PUT; mirrors the one-shot flow's auto-submit behavior |
| 7 | Reuse Phase 1 `AbilityCard` inside `PlayerSheetPanel` rather than duplicate | The component already renders abilities and dispatches `RollPower`; player's view of their own participant is structurally the same as the director's view of any participant |
| 8 | No client-side derivation cache. `deriveCharacterRuntime` called on every render that needs it | Pure + cheap; React + TanStack Query memoization is enough |

## File layout

Following the existing `apps/web/src/pages/` convention. The Phase 2 Epic 1 backend spec referenced `apps/web/src/routes/...` paths which do not match this codebase — normalize to `pages/`.

```
apps/web/src/
├── api/
│   ├── queries.ts          # extend: useCharacter(id), full useMyCharacters returning CharacterResponse[]
│   ├── mutations.ts        # extend useCreateCharacter; add useUpdateCharacter, useDeleteCharacter, useAttachCharacterToCampaign
│   └── static-data.ts      # NEW — useAncestries, useCareers, useClasses, useComplications, useKits (parse against shared schemas, same pattern as useMonsters)
├── pages/
│   ├── characters/
│   │   ├── Wizard.tsx                  # outer shell, controlled draft, step routing, PUT on transition, Submit-via-WS
│   │   ├── Sheet.tsx                   # standalone + in-lobby modes; in-encounter shows a "Go to play screen →" banner
│   │   ├── steps/
│   │   │   ├── NameDetailsStep.tsx
│   │   │   ├── AncestryStep.tsx
│   │   │   ├── CultureStep.tsx
│   │   │   ├── CareerStep.tsx
│   │   │   ├── ClassStep.tsx           # characteristic array + subclass + level picks inline (most complex step)
│   │   │   ├── ComplicationStep.tsx
│   │   │   ├── KitStep.tsx             # class-conditional; empty-state in Epic 1
│   │   │   └── ReviewStep.tsx          # renders deriveCharacterRuntime output + Submit
│   │   └── parts/
│   │       ├── StepStepper.tsx         # horizontal step indicator, tappable to jump
│   │       ├── RuntimeReadout.tsx      # shared between Sheet + ReviewStep — renders CharacterRuntime
│   │       └── AttachToCampaign.tsx    # 6-char code input rendered in Sheet's standalone mode
│   └── combat/
│       └── PlayerSheetPanel.tsx        # NEW — in-encounter sheet, mounted by CombatRun when viewer owns a materialized PC
└── router.tsx              # register /characters/new, /characters/$id, /characters/$id/edit
```

`CombatRun.tsx` grows minimally — adds a conditional `<PlayerSheetPanel participantId={...} />` block alongside its existing layout. The DetailPane stays unchanged as the director / observer view.

## Data flow & state ownership

| Stage | Source of truth | Read by |
|---|---|---|
| Wizard draft | local `useState<Character>` in `Wizard.tsx` | Step children (via `draft` prop), `ReviewStep` |
| Submitted (D1) | `characters.data` row (canonical blob), `campaign_characters.status` | TanStack Query cache keys: `['character', id]`, `['my-characters']`, `['campaign-characters', campaignId, status]` |
| In lobby, no encounter | Character blob + `CampaignState.participants` placeholder `{kind:'pc', characterId, ownerId, position}` | Sheet (in-lobby mode), CampaignView roster |
| In encounter (post-`StartEncounter`) | Materialized `Participant{}` in `CampaignState.participants` for runtime fields; `characters.data` blob still authoritative for structural state | PlayerSheetPanel reads `state.participants.find(p => p.kind !== 'pc' && p.ownerId === me.id)` |
| Between encounters | Participant stays in roster — `currentStamina`, `recoveries.current` preserved | Same as in-encounter; sheet flips back to in-lobby UI surface |

**Two implications:**

1. **No client-side derivation cache.** `RuntimeReadout` calls `deriveCharacterRuntime(draft, staticData)` synchronously on every render. Cheap and pure.
2. **The wizard does not open a WebSocket.** Only the final Submit and the in-lobby sheet affordances (SwapKit) dispatch over WS via `useSessionSocket`. The wizard PUTs to HTTP exclusively.

## Wizard mechanics

### Step contract

Every step is a pure function:

```ts
type StepProps = {
  draft: Character;
  staticData: StaticDataBundle;  // { ancestries, careers, classes, kits } maps
  onPatch: (patch: Partial<Character>) => void;
};
```

The wizard shell owns `draft` and the PUT lifecycle. Each step renders UI from `draft + staticData` and calls `onPatch` on user input.

### Step list and order

| # | Step | Required for submit? | Notes |
|---|---|---|---|
| 0 | NameDetailsStep | name yes; details no | `?code=ABCDEF` query pre-fills + locks the campaign code field; first save POSTs the row and joins membership |
| 1 | AncestryStep | yes | Ancestry pick + trait sub-picks |
| 2 | CultureStep | yes | Environment / organization / upbringing enums + one skill per aspect + one language |
| 3 | CareerStep | yes | Career + skills/languages picks + inciting incident + perk (if granted) |
| 4 | ClassStep | yes | Class → characteristic array → subclass → per-level picks, collapsed into one step with sub-sections |
| 5 | ComplicationStep | no | Skip allowed |
| 6 | KitStep | conditional | Shown only if the selected class uses a kit. In Epic 1 renders a "Kit picker comes in Epic 2" placeholder when `kits.json` is empty |
| 7 | ReviewStep | — | Renders `deriveCharacterRuntime(draft, staticData)` output; Submit button enabled iff `CompleteCharacterSchema.safeParse(draft).success` |

### Navigation and persistence

- `StepStepper` at top of the wizard renders all visible steps as tappable chips. Active step highlighted, visited steps marked.
- Bottom of each step: Back button + Save & Continue button.
- Tapping a step chip = save the current draft (PUT) + jump.
- **Step 0 first save** → POST `/api/characters` with `{name, campaignCode?, data}` (creates row, joins membership if code, returns id).
- **All subsequent saves** → PUT `/api/characters/:id` with `{name, data: draft}`.
- **No debounce, no autosave timer.** Navigation away mid-step loses unsaved edits — acceptable for prototype.
- Standalone characters (no campaignCode) → wizard creates the row with `campaignId: null`; ReviewStep shows "Done" (returns to sheet) instead of "Submit."

### Submit

- Submit button disabled until `CompleteCharacterSchema.safeParse(draft).success === true`.
- Tooltip / inline hint surfaces the first failing refinement message.
- On click: dispatches `SubmitCharacter` intent through `useSessionSocket(campaignId)`. The WS connection is opened lazily when the wizard reaches ReviewStep on a character that has a `campaignId`.
- On dispatch success: query invalidation for `['campaign-characters', campaignId, ...]`, then navigate to `/characters/$id` (sheet).

### Re-entry / level-up

- `/characters/$id/edit` mounts the same `Wizard` component with `useCharacter(id)` as the initial draft.
- No prior-step locking. All fields editable.
- Level-up flow: editing `level` (in NameDetailsStep or surfaced inline in ClassStep) reveals additional `levelChoices` entries that need filling. Submit-state recomputes against `CompleteCharacterSchema`.
- Post-approval edits remain allowed — no re-approval trigger (friend-group trust per CLAUDE.md).

## Sheet (standalone + in-lobby modes)

`Sheet.tsx` at `/characters/$id` handles two of the three modes:

| Trigger | Mode | Affordances |
|---|---|---|
| Character not in any campaign (`data.campaignId === null`) | **Standalone** | Read-only structural display, `RuntimeReadout` with max-default runtime, inline narrative-edit fields, "Edit" → wizard, `<AttachToCampaign>` (6-char code input → POST `/:id/attach`) |
| Character in a campaign + lobby WS active + `state.encounter === null` | **In-lobby-no-encounter** | All of Standalone (minus AttachToCampaign), plus "Swap Kit" dispatch via WS |
| Character in a campaign + encounter active | **Banner** | "Your sheet is live in combat" + link to `/campaigns/$id/play`; the actual interactive sheet lives in `PlayerSheetPanel` inside `CombatRun` |

**Mode resolution.** `Sheet` mounts `useCharacter(id)`. If `character.data.campaignId` is set, it opens `useSessionSocket(character.data.campaignId)` and inspects `state.encounter` to choose between in-lobby and banner. Otherwise it stays standalone.

**Inline narrative edits** (name, pronouns, hair/eyes/etc.) PUT directly to `/api/characters/:id` on blur. These never trigger re-approval — friend-group trust.

**Swap Kit affordance** (in-lobby mode only). Opens a kit-picker modal listing class-compatible kits. In Epic 1 the picker is empty (kit data ships in Epic 2); the modal renders a "Kits come in Epic 2" placeholder. Dispatching `SwapKit` works structurally — clicking confirm with an empty selection is no-op.

## PlayerSheetPanel (in-encounter mode)

Lives in `apps/web/src/pages/combat/PlayerSheetPanel.tsx`. Conditionally mounted by `CombatRun.tsx` whenever the viewer owns at least one materialized PC participant in the current encounter.

### Lookup

```ts
const myParticipant = state.participants.find(
  (p): p is Participant => p.kind === 'pc' && p.ownerId === me.id,
);
```

The `RosterEntry` type is `Participant | PcPlaceholder`. The cleanly-discriminated kinds are: `'pc'` and `'monster'` on materialized `Participant`s, and `'pc-placeholder'` on un-materialized placeholders. The lookup above filters out placeholders (which carry `ownerId` already on the placeholder shape) and matches a materialized PC by the viewer's user id.

**Required schema change.** `ParticipantSchema` currently has no `ownerId` field — this lookup needs one. Add `ownerId: z.string().nullable().default(null)` to `ParticipantSchema` in `packages/shared/src/participant.ts`. Update `applyStartEncounter` materialization (`packages/rules/src/intents/start-encounter.ts`) to populate `ownerId` from the placeholder's `ownerId` when constructing the materialized Participant. Monsters keep `ownerId: null`.

If `myParticipant` is undefined — viewer is in the encounter but their character isn't in the roster, or hasn't been materialized — render an empty state: *"Your character isn't in this encounter yet."* Better than rendering nothing.

### Layout inside CombatRun

CombatRun splits horizontally when `myParticipant` exists: existing combat tracker (initiative + DetailPane) on the left/top, PlayerSheetPanel on the right/bottom. iPad-portrait stacking acceptable. Director and observers see CombatRun unchanged.

### Rendered content

- **Header**: name, class, level, current/max stamina, recoveries remaining
- **Conditions strip**: existing `ConditionChip` components — self-set / cleared via `SetCondition` dispatch
- **Resource panel**: heroic resource current/max, +/- controls dispatching `SpendResource` / `GainResource`
- **Recovery button**: dispatches `SpendRecovery`
- **Ability cards**: reuse Phase 1 `AbilityCard` — already dispatches `RollPower`
- **Free strike**: surfaced as an ability card variant

### Cross-cutting affordance summary

| Action | Surface | Intent |
|---|---|---|
| Roll an ability | PlayerSheetPanel ability card | `RollPower` |
| Spend a recovery | PlayerSheetPanel | `SpendRecovery` |
| Spend / gain heroic resource | PlayerSheetPanel | `SpendResource` / `GainResource` |
| Self-apply / clear condition | PlayerSheetPanel | `SetCondition` |
| Swap kit | Sheet (in-lobby-no-encounter only) | `SwapKit` |
| Respite | CampaignView (no-encounter, any member) | `Respite` |

## Routes & entry points

### New routes (registered in `router.tsx`)

```
/characters/new         → Wizard (create mode); ?code=ABCDEF pre-fills the code field
/characters/$id/edit    → Wizard (edit mode); loads via useCharacter(id)
/characters/$id         → Sheet (mode chosen by ambient state)
```

### Entry points

| Surface | Affordance | Result |
|---|---|---|
| Home (`/`) | "+ New character" button alongside the existing "Your characters" list | `/characters/new` |
| Home, "Your characters" list rows | Tap a row | `/characters/$id` (sheet) |
| CampaignView, for non-director campaign members | "Submit a character for this campaign" button | `/characters/new?code={inviteCode}` |
| CampaignView roster rows | Tap a roster character row | `/characters/$id` |
| Sheet (standalone) | `<AttachToCampaign>` form | POST `/:id/attach`; mode flips to in-lobby on success |
| Direct link | `/characters/new?code=ABCDEF` | Wizard starts at step 0 with code pre-filled |

### Respite UI

CampaignView gains a "Respite" button visible to all members when `state.encounter === null` and at least one PC is in the roster. Dispatches `Respite` intent. Single-button confirmation; no modal required for prototype.

## Backend addition: `POST /api/characters/:id/attach`

Retroactive standalone → campaign attach. Lives in `apps/api/src/routes/characters.ts` alongside the existing handlers.

**Request body:** `{ campaignCode: string }` (length 6).

**Behavior:**

1. Owner check (403 if requester is not the character's owner).
2. Look up campaign by invite code (404 if not found).
3. Idempotently insert `campaign_memberships` row for the owner.
4. Mutate `characters.data.campaignId` to the resolved campaign id (D1 update — re-parse + re-serialize the blob).
5. **Auto-submit on complete data:** if `CompleteCharacterSchema.safeParse(parsed.data).success === true`, dispatch `SubmitCharacter` over the campaign's LobbyDO. Mirrors the one-shot flow in `POST /characters`.
6. Return `CharacterResponse`.

**Authorization:** owner of the character; the campaign code is the join credential (membership is created in-flight, same as join-by-code on `POST /campaigns/join`).

## Testing strategy

### New backend tests

| File | Test |
|---|---|
| `apps/api/tests/characters.spec.ts` | `POST /:id/attach` — happy path, 404 invalid code, 403 non-owner, idempotent membership, auto-submit-on-complete-data |
| `packages/rules/tests/start-encounter.spec.ts` | Extend: materialized PC participant carries `ownerId` matching the placeholder; monsters carry `ownerId: null` |

### Frontend tests (vitest + RTL, no Playwright)

| File | Test |
|---|---|
| `Wizard` step-transition | PUT fires with full draft on Save & Continue; Back retains values |
| `Wizard` submit gate | Submit disabled until `CompleteCharacterSchema.safeParse(draft).success`; click dispatches `SubmitCharacter` and navigates to sheet |
| `Sheet` mode resolution | Standalone vs in-lobby vs encounter-banner pickers respond correctly to ambient state |
| `PlayerSheetPanel` participant lookup | Mounts when viewer owns a materialized PC; empty state otherwise |
| `AttachToCampaign` mutation | Calls the new endpoint; query cache invalidates; sheet mode flips |

### Manual verification (the spec's 10-step acceptance journey)

End-to-end walk in dev with two browser sessions (director + player):

1. Player signs up.
2. Player hits `/characters/new?code=ABCDEF`.
3. Player walks the wizard: ancestry → culture → career → class (array + subclass + level picks) → complication → (kit conditionally) → review.
4. Player clicks Submit → character lands in director's pending queue.
5. Director approves.
6. Director runs `BringCharacterIntoEncounter` → placeholder added to roster.
7. Director runs `StartEncounter` → placeholder materializes via derivation.
8. Player rolls abilities from `PlayerSheetPanel`; takes damage; spends a recovery.
9. Director runs `EndEncounter`. Player's currentStamina + recoveries.current persist.
10. Any member clicks Respite → recoveries refill; partyVictories → per-character XP at 1:1.

No console errors, no broken intent dispatches, no zombie WebSocket connections.

## Forward-looking notes (recorded for Phase 5)

- **Wizard stepper completion %.** Phase 5 needs per-section progress pips based on the % of required values completed in each top-level section. The data shape is derivable from `CompleteCharacterSchema` refinement paths grouped by step. Epic 1's binary "visited / not-visited" stepper is intentional placeholder UX.
- **Sheet in-encounter mode** is the highest-traffic surface in the entire app. Budget the most Phase 5 Layer 1 design effort here.
- **PlayerSheetPanel ↔ DetailPane convergence.** Post-Phase-5 these are likely the same component family — the director's view of a participant and a player's view of their own participant share ~70% of the affordances. Worth treating as one design problem during the rebuild.
- **Color-pack on the character entity.** Phase 5 Layer 2 will add this. Punting the schema field for now — adding it before there's UI to set it is dead code.

## Acceptance

Phase 2 Epic 1 backend is end-to-end exercisable by a real user from a browser:

- A player can build a character via the wizard end-to-end, with or without a campaign code, and either submit it to a director or keep it standalone.
- A standalone character can be attached to a campaign retroactively, auto-submitting if it's already complete.
- The director can approve a submitted character and bring it into an encounter; the player can operate that character (roll abilities, spend recoveries, manage conditions, manage heroic resource) from `PlayerSheetPanel` inside CombatRun.
- Between encounters, runtime state persists. Respite refills recoveries and converts party victories to XP.
- Kit-using classes show a "Kit comes in Epic 2" placeholder in the wizard; non-kit classes skip the step entirely.
- No console errors in dev or production; all 622 existing tests still green; new tests above ship as part of the work.

## Open detail

None.
