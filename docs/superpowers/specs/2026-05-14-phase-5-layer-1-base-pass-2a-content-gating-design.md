# Phase 5 Layer 1 (Base) — Pass 2a: content gating, Turn flow, role-asymmetric chrome

**Status:** Designed, awaiting plan.
**Parent:** Phase 5 — UI rebuild ([phases.md](../../phases.md#phase-5--ui-rebuild)). Pass 1 ([spec](2026-05-14-phase-5-layer-1-base-pass-1-design.md)) shipped tokens + primitives + role-aware shell on 2026-05-14.
**Successor:** Pass 2b — combat-tracker / encounter-builder deepening (drag-reorder initiative, ability-card layout polish, monster stat-block deepening, per-condition palette, motion states, encounter-builder threat-budget, embellished Mode-C chip, Mode-B nav surface, director-side gestural target-picking, minion squads). Spec'd separately after 2a ships.
**Scope notes:** brainstormed 2026-05-14 from the Pass-1 spec's Non-goals + new requirements raised by the user (content gating, player Turn-flow layout). The Korva mockup at `docs/design ref/screenshots/combat tracker.jpg` is the directional anchor for the Turn-flow / Full-sheet layout. The β decision on engine-tracked action usage (vs. client-derived) means Pass 2a contains a small but real engine change — the only engine work in an otherwise UI-only pass.

## One-line summary

Make the combat tracker role-asymmetric: directors keep the focus-anything DetailPane they have today; players see a right pane permanently locked to their own character with a **Turn flow / Full sheet** toggle, gated rails for everyone else, and tap-to-target as the new gestural target-picking gesture. Adds an engine-tracked `turnActionUsage` field + `MarkActionUsed` intent so Turn-flow sections auto-collapse as Main / Maneuver / Move are consumed. Activates the real `useIsActiveDirector` signal so the Pass-1 Mode-B chrome finally lights up.

## Goals

- Split DirectorCombat's behavior cleanly along the active-director axis: same component, two interaction surfaces driven by `isActiveDirector`.
- Replace today's PlayerSheetPanel-below-fold with a properly-scoped right-pane sheet — the player's character is the right pane when they're playing.
- Introduce a single Turn-flow layout (Main / Maneuver / Move sections with auto-collapse) that works for any focused participant: monster on the director's screen, the player's own character on the player's screen.
- Make tap-on-rail-row do what a player actually expects — set the target — instead of pretending to focus a panel they can never see.
- Land engine support for per-turn action tracking now (rather than client-derive it and revisit later), because Phase 2b will need the same field for class-δ trigger hooks ("first time per round you maneuver…").
- Tighten Malice / Victories so the value is shared but the mutation is role-gated; fix the bug that Victories isn't editable today.
- Activate the `useIsActiveDirector` signal so the Mode-B TopBar chrome from Pass 1 finally renders for directors at the table.

## Non-goals (deferred to Pass 2b or later)

- Drag-reorder of initiative / turn order; per-condition palette; ability-card layout polish; monster stat-block deepening (rails still show `L{level} · FOE`); OpenActions row affordance refinement; active-turn ring-pulse motion; encounter-builder deepening; embellished Mode-C active-character chip; Mode-B nav surface beyond `Foes` (Templates, Approvals queue, etc.).
- **Minion squads.** The user has called out that minions act as a single squad sharing one right-hand pane and one set of Main/Maneuver/Move slots; Pass 2a renders minions as individual rows (today's model), and squad collapse is Pass 2b+. The engine surface added in 2a (per-participant `turnActionUsage`) does not preclude a future squad-level usage field.
- **Director-side gestural target-picking.** Player-side tap-to-target ships in 2a; director-side gestural targeting (e.g. tap-then-tap to pick attacker → target on a monster's behalf) is Pass 2b.
- **Multi-target abilities.** Pass 2a's tap-to-target is single-target; the existing AbilityCard multi-target fallback (when the ability targets `area` / `line` / etc.) stays as-is.
- **Layer 2 / Layer 3 work** — pack-color per-row, theme picker, action effects — all unchanged from Pass 1.
- **DB persistence for the active context.** localStorage-backed in Pass 1 stays the wire; no schema migration here.

## Architecture

### Active director signal (D1)

The current `useIsActiveDirector` hook in `apps/web/src/primitives/AppShell.tsx` is a `return false` stub. Pass 2a replaces it with a real signal sourced from the WS-mirrored campaign state.

`useSessionSocket` already exposes `activeDirectorId` on its returned object (see `DirectorCombat.tsx:67`). The hook becomes:

```ts
function useIsActiveDirector(campaignId: string | null): boolean {
  const me = useMe();
  const session = useSessionSocket(campaignId);
  if (!campaignId || !me.data || !session.activeDirectorId) return false;
  return me.data.user.id === session.activeDirectorId;
}
```

`AppShell` is currently campaign-agnostic but already calls `useActiveContext()` to pull the active campaign id from localStorage; it reuses that to feed `useIsActiveDirector`. The Mode-B chrome from Pass 1 then activates without further surgery.

**Side effect for DirectorCombat:** the page already reads `activeDirectorId` from its local `useSessionSocket` call, so its role determination becomes `actor.role === 'director'` combined with `activeDirectorId === me.userId`. Today's check (`session.data.isDirector`) is the *permitted*-director bit on the membership; the active-director gate is the runtime-active-behind-the-screen bit. We need both.

**A page-level helper** `useIsActingAsDirector(campaignId)` lives in `apps/web/src/lib/active-director.ts` and centralises the rule:

```ts
export function useIsActingAsDirector(campaignId: string): boolean {
  const me = useMe();
  const { activeDirectorId } = useSessionSocket(campaignId);
  return !!me.data && !!activeDirectorId && me.data.user.id === activeDirectorId;
}
```

DirectorCombat consumes this; AppShell consumes the campaignless variant (which returns false when there is no active campaign).

### Engine: action-usage tracking

The new shape on `ParticipantSchema` (`packages/shared/src/participant.ts`):

```ts
turnActionUsage: z
  .object({
    main: z.boolean(),
    maneuver: z.boolean(),
    move: z.boolean(),
  })
  .default({ main: false, maneuver: false, move: false }),
```

Defaults to all-false; preserves backwards compatibility with serialized snapshots.

The new intent (`packages/shared/src/intents/`):

```ts
export const MarkActionUsedPayloadSchema = z.object({
  participantId: z.string().min(1),
  slot: z.enum(['main', 'maneuver', 'move']),
  used: z.boolean().default(true),
});
export type MarkActionUsedPayload = z.infer<typeof MarkActionUsedPayloadSchema>;
```

The `used: boolean` field rather than a separate `Clear*` intent keeps the inverse path symmetric: undo flips `used` to its prior value.

**Reducer changes:**

1. `applyStartTurn` (`packages/rules/src/intents/turn.ts`) — when a participant becomes the active turn-holder, reset their `turnActionUsage` to all-false. Reuses the same payload that already carries `participantId`.
2. `applyRollPower` (`packages/rules/src/intents/roll-power.ts`) — emit a derived `MarkActionUsed` based on the ability type. Mapping:
    - `ability.type === 'action'` → `slot: 'main'`
    - `ability.type === 'maneuver'` → `slot: 'maneuver'`
    - all other types (`triggered`, `free-triggered`, `villain`, `trait`) — no derived intent
3. `applyMarkActionUsed` — flip the field on the named participant. Stored in `packages/rules/src/intents/mark-action-used.ts`. Inverse is "set the field back to whatever it was before."
4. Toast description in `apps/web/src/lib/intentDescribe.ts` — `MarkActionUsed` from a Skip / Done-moving button gets a human description ("Mira skipped her main action", "Mira finished moving"); auto-emitted MarkActionUsed (causedBy a RollPower) is suppressed from the toast stack to avoid double-toasting alongside the parent roll.

**Canon question.** The "when is the action consumed" question (at dispatch vs. at resolution) is settled at *dispatch*: a player commits to using the slot when they roll, even if the roll is later undone. Undo restores both the roll and the slot state. Logged as a Q-entry in `docs/rule-questions.md` for future flagging if Draw Steel says otherwise.

### Layout: same shell, role-driven content

The page shell — SplitPane (rails on the left, DetailPane on the right) + InlineHeader on top + below-fold OpenActionsList — is identical for both roles. What differs is what the DetailPane and rails render. Concretely:

| Surface | Director (active behind screen) | Player |
|---|---|---|
| Rails: row click | focuses DetailPane on that participant | sets target for next roll |
| Rails: row content | sigil + name + role + conditions + resource pips + recoveries + stamina | sigil + name + conditions + stamina (no role, pips, recoveries) |
| Rails: row count | always full party + encounter | same |
| DetailPane: focused participant | whoever they tap | always own character (`p.ownerId === me.userId`) |
| DetailPane: layout | Turn flow / Full sheet toggle, defaults to Full sheet | same toggle, defaults to Turn flow |
| DetailPane: stamina edit buttons | always | own char only |
| DetailPane: + Condition | always | own char only |
| DetailPane: condition chip × | always | own char only |
| DetailPane: ability auto-roll / manual | always | own char only |
| InlineHeader: Malice +/– | yes | hidden (value still rendered) |
| InlineHeader: Victories +/– (new) | yes | hidden (value still rendered) |
| Below-fold OpenActionsList | yes | yes |
| Below-fold PlayerSheetPanel | **gone** — content lives in DetailPane Full sheet tab | **gone** — same |

This collapses Pass 1's "right pane is DetailPane, sheet sits below-fold" model into "the right pane IS the sheet, when it's your turn or you're focused on yourself." It also kills the duplication of having PlayerSheetPanel below-fold *and* DetailPane focused on your own row above.

### The Turn flow / Full sheet toggle

A new segmented control inside DetailPane, rendered for the focused participant regardless of viewer or participant kind. Defaults differ by role:

- Director's default: **Full sheet** (they want the at-a-glance stat block; Turn flow is for stepping through someone else's turn).
- Player's default: **Turn flow** (they're playing).

Persists on the DetailPane instance only; not stored. Tab choice is a local UI state, not a per-participant or per-user preference.

**Full sheet content** (for any participant):

- Top meta line: level, kind-derived role label (`SOLO · HUMANOID · BOSS · BRUTE`), size, speed, stability (when available)
- Stamina readout + bar + `−1 / −5 / −10 / Edit` buttons (gated per matrix above)
- Conditions row (`+ Condition` dropdown + active chips with × where gated)
- Heroic resources / surges / recoveries (PCs only — for monsters, this row collapses to nothing)
- Inventory section (PCs only — pulled out of today's PlayerSheetPanel)
- Ability list as AbilityCards (full list — Free Strike / Signature / level-1 / level-N etc.)

**Turn flow content** (for any participant):

- Same top meta + stamina + conditions header
- Then three numbered sections — Main / Maneuver / Move — rendered as a vertical list:
  - Each section has a leading numeric badge (1 / 2 / 3) and a label
  - Each is one of three states driven by `participant.turnActionUsage[slot]`:
    - **Pending (default)**: section expanded, shows the abilities that fit the slot as inline AbilityCards, with a trailing `Skip` link
    - **Active**: same as pending plus an accent border (rendered for the slot a focus-anchored heuristic picks as "next" — see below)
    - **Done**: collapsed to a single line ("`1 · Main — rolled Mind Spike`" or "`1 · Main — skipped`"), opacity-55
- The **Move** section has no inline ability cards (there are no roll-bearing Move abilities); it shows "Move — 6 squares" with a `Done moving` button. Clicking dispatches `MarkActionUsed { slot: 'move' }`.

**Which abilities go in which section** is derived from `ability.type` in the static data:

| `ability.type` | Section |
|---|---|
| `action` | Main |
| `maneuver` | Maneuver |
| `triggered` / `free-triggered` / `villain` / `trait` | not in Turn flow (visible on Full sheet only) |

**The "active section" heuristic** (which gets the accent border): the lowest-index slot whose `turnActionUsage[slot]` is still false. If all three are false, Main is active. If Main is done and Maneuver is still pending, Maneuver. Etc. Players can still scroll to and use any pending section — the marker is a visual cue, not a gate.

**Skip semantics:** clicking `Skip` on a pending section dispatches `MarkActionUsed { slot, used: true }` directly. The section transitions to Done with the label "skipped".

### Tap-to-target (player view)

A player tapping a row in the rails sets a `targetParticipantId` in DirectorCombat's local state. The targeted row gets a one-pixel accent ring (the same `border-pk` treatment the `isTurn` row gets, but at lower priority — if both apply, isTurn wins). A `TargetBanner` renders inside DetailPane's Turn flow tab above the section list:

```
→ Targeting Korva · 78/110 · Bleeding
```

`AbilityCard`'s existing dropdown target-picker stays (for director use, and as fallback when no target is selected). When a player presses `Auto-roll` on an AbilityCard and `targetParticipantId` is set, the dropdown's value is preempted by the row-tap target.

**Tap toggles.** Tapping the already-targeted row clears the target. Tapping a new row replaces the target. Player rails are otherwise read-only — no focus-DetailPane handler is bound.

**Self-targeting.** Pass 2a permits a player to tap their own row to target themselves (heals, self-conditions). The Turn flow's target banner then reads `→ Targeting yourself`.

### Spectator edge case

A player who has no `Participant` with `ownerId === me.userId` in the active encounter (rare — they're in the lobby but not in the encounter) sees:

- Rails: gated rows for every participant, all non-clickable (no own char to target *from*).
- DetailPane: empty-state — "You're not in this encounter. The director can bring you in via Encounter Builder."
- Below-fold OpenActionsList: unchanged; they can still see and claim OAs.
- InlineHeader: Malice / Victories visible (read-only); turn-control buttons hidden.

### Malice / Victories editor

InlineHeader changes:

**Malice pill** (`DirectorCombat.tsx:633-657`) — keep the +/– buttons but conditionally render them. Pseudo-code:

```tsx
{isActingAsDirector ? (
  <Pill dotClassName="bg-foe">
    <button onClick={onMaliceSpend}>−</button>
    <span>Malice <b>{malice}</b></span>
    <button onClick={onMaliceGain}>+</button>
  </Pill>
) : (
  <Pill dotClassName="bg-foe">
    <span>Malice <b>{malice}</b></span>
  </Pill>
)}
```

**Victories** — today rendered as `<Stat label="Victories" value={victories} />`. Replace with a parallel Pill-or-Stat that mirrors the Malice pattern: +/– on director's view, plain value on player's view. The plus button dispatches a new `AdjustVictories { delta: 1 }` intent; minus dispatches `{ delta: -1 }`.

The Victories intent. `victories` lives **per character** (canon § 8.1) on the `CharacterSchema` — `StartEncounter` mirrors it onto each PC participant as `participant.victories`. Pass 2a adds an `AdjustVictories` intent that:

- Payload: `{ delta: number }` (positive or negative, no clamp on the delta itself; engine clamps the result to ≥ 0)
- Applied to **every PC in the active encounter** (per canon — when the party earns a victory, all party members gain one)
- Updates each `participant.victories` in encounter state and (on EndEncounter) propagates back to `character.victories` in D1 via the existing PC-state-writeback path
- Director-only — reducer rejects the intent if `actor.userId !== state.activeDirectorId`

**Why a delta intent rather than a set:** undoing a `delta = +1` is `delta = -1`; clean inverse. A `SetVictories { value }` would need to capture pre-state for undo.

### Component changes — DetailPane decomposition

`apps/web/src/pages/combat/DetailPane.tsx` is 746 lines today. Pass 2a adds the Turn-flow / Full-sheet toggle, the role-gating, and the tap-to-target target banner — without splitting the file, it'd grow past 1000 lines. Decompose now while we're in the file:

```
apps/web/src/pages/combat/detail/
├── DetailPane.tsx              ~120 lines — shell, focus resolution, toggle state
├── DetailHeader.tsx            ~110 lines — meta line, stamina readout + edit buttons, conditions row
├── FullSheetTab.tsx            ~140 lines — role-relevant blocks (resources, recoveries, inventory, abilities)
├── TurnFlowTab.tsx             ~120 lines — Main / Maneuver / Move sections
├── TurnFlowSection.tsx         ~90 lines — single section (pending / active / done states)
├── TargetBanner.tsx            ~30 lines — player target indicator
├── ConditionPickerPopover.tsx  ~80 lines — + Condition affordance (split out of today's inline logic)
├── StaminaEditPopover.tsx      ~60 lines — Edit button popover for typing a value
└── index.ts                    re-exports
```

The existing `DetailPane.tsx` (746 lines) is replaced by this folder. Tests for the old surface migrate panel-by-panel.

`apps/web/src/pages/combat/DirectorCombat.tsx` (771 lines) is also re-organised but less aggressively:

```
apps/web/src/pages/combat/
├── DirectorCombat.tsx          ~350 lines — page shell, WS wiring, dispatch helpers
├── combat-header/
│   ├── InlineHeader.tsx        ~150 lines — extracted from DirectorCombat
│   ├── MalicePill.tsx          ~40 lines — director-or-player render
│   └── VictoriesPill.tsx       ~40 lines — director-or-player render
└── ... (PartyRail, EncounterRail, OpenActionsList — unchanged in 2a)
```

InlineHeader leaves DirectorCombat as its own file; the player/director Malice + Victories split lives in its child components.

### Component changes — rails

`PartyRail.tsx` and `EncounterRail.tsx` accept a new prop `viewerRole: 'director' | 'player'`. When `viewerRole === 'player'`:

- The `ParticipantRow` receives `role={null}` and `recoveries={null}` (the props are already optional)
- The `resource` slot renders the resource pips only for the *self* row; non-self rows pass `resource={null}`
- The row's `onSelect` handler becomes "set target" rather than "focus DetailPane"

The `ParticipantRow` primitive (`apps/web/src/primitives/ParticipantRow.tsx`) gets one new optional prop:

```ts
isTarget?: boolean;     // accent ring at lower priority than isTurn
```

When `isTarget && !isTurn`, the row renders with `shadow-[0_0_0_1px_var(--accent)]`; when `isTurn` is true, the existing pk-glow ring wins. No structural change.

`summarizeRole()` and `initials()` lift out of both rails into `apps/web/src/pages/combat/rails/rail-utils.ts` (rides-along refactor — closes E3 from the larger inventory).

### Dead-code cleanup (rides along)

`apps/web/src/pages/combat/InitiativePanel.tsx` has no callers since DirectorCombat replaced it with PartyRail + EncounterRail. Delete the file + its spec (if any). Closes E1 from the larger inventory.

### File organization

```
apps/web/src/
├── lib/active-director.ts                NEW — useIsActingAsDirector hook
├── pages/combat/
│   ├── DirectorCombat.tsx                trimmed; consumes useIsActingAsDirector
│   ├── PartyRail.tsx                     accepts viewerRole; rails-utils import
│   ├── EncounterRail.tsx                 same
│   ├── rails/rail-utils.ts               NEW — shared initials/summarizeRole
│   ├── combat-header/
│   │   ├── InlineHeader.tsx              NEW — extracted
│   │   ├── MalicePill.tsx                NEW
│   │   └── VictoriesPill.tsx             NEW
│   ├── detail/
│   │   ├── DetailPane.tsx                replaces today's DetailPane.tsx
│   │   ├── DetailHeader.tsx              NEW
│   │   ├── FullSheetTab.tsx              NEW
│   │   ├── TurnFlowTab.tsx               NEW
│   │   ├── TurnFlowSection.tsx           NEW
│   │   ├── TargetBanner.tsx              NEW
│   │   ├── ConditionPickerPopover.tsx    NEW
│   │   ├── StaminaEditPopover.tsx        NEW
│   │   └── index.ts                      NEW
│   ├── PlayerSheetPanel.tsx              DELETED — content folded into FullSheetTab
│   ├── InitiativePanel.tsx               DELETED — dead since Pass 1
│   └── (other files unchanged)
├── primitives/
│   ├── ParticipantRow.tsx                +isTarget prop
│   └── AppShell.tsx                      useIsActiveDirector now consults useSessionSocket
├── ws/useSessionSocket.ts                already exposes activeDirectorId — no change

packages/shared/src/
├── participant.ts                        +turnActionUsage field
├── intents/
│   ├── mark-action-used.ts               NEW
│   ├── adjust-victories.ts               NEW
│   └── index.ts                          re-export both

packages/rules/src/
├── intents/
│   ├── mark-action-used.ts               NEW reducer
│   ├── adjust-victories.ts               NEW reducer
│   ├── turn.ts                           applyStartTurn resets turnActionUsage
│   └── roll-power.ts                     emits derived MarkActionUsed
├── reducer.ts                            adds the two new dispatch cases

apps/web/src/lib/intentDescribe.ts        describes MarkActionUsed + AdjustVictories
```

### Trust model

Both new intents are role-gated in the reducer:

- `AdjustVictories` — rejected unless `actor.userId === state.activeDirectorId`.
- `MarkActionUsed` — accepted from the participant's owner (`participantId`'s `ownerId === actor.userId`) or the active director. Auto-emitted derived intents from `RollPower` inherit the parent intent's actor and pass trivially.

## Constraints and risks

- **PlayerSheetPanel deletion is structural, not behavioral.** The 548-line file dies but every block it renders (heroic resources, recoveries, inventory, abilities) finds a home in FullSheetTab. Risk: subtle layout regression in the sheet sections — mitigate by porting block-by-block and visually diffing the FullSheetTab against the old below-fold render in a side-by-side dev session before deleting the old file.
- **DetailPane decomposition is the largest single change.** 746 lines split across 9 files. Sequence: extract files first (no behavior change, all green), then layer Turn-flow + role-gating + target banner on top of the new boundaries. Tests for the existing surface (`OpenActionsList.spec.tsx`, `RespiteConfirm.spec.tsx`) should pass unchanged since they don't touch DetailPane.
- **Action-usage state introduces a per-turn lifecycle the engine hasn't had before.** Test matrix: StartTurn resets; RollPower auto-marks; Skip dispatches directly; Undo of RollPower clears the slot; Undo of Skip clears the slot; EndTurn doesn't (we want the "done" indicator to persist into between-turn breaks for the toast). Plus negative-path: rolling a `triggered` ability does *not* mark any slot.
- **The active-director signal can be transiently null** during initial WS connect. `useIsActingAsDirector` returns false during that window; consumers (Malice / Victories edit buttons, target-vs-focus row handler) treat false as "render the safer-narrower variant." A flash of player-view chrome on a director's screen during connect is preferable to the inverse.
- **Tap-to-target conflicts with tap-to-focus** when a director who *also* owns a PC in the encounter loads the page. Resolution: tap behavior is purely role-driven (active director → focus; player → target). A director who owns a PC and wants to set a target uses the AbilityCard dropdown, same as today. This is consistent with how the director handles monster targeting too.
- **Victories propagation.** `AdjustVictories` updates every PC participant's `victories` in encounter state but the canonical value is on the D1 `characters` row. The Epic 2D writeback path already handles `currentStamina` + `recoveriesUsed` on EndEncounter; we extend it to also write back `victories`. Risk: directors who Adjust + EndEncounter mid-session expect the change to persist — verify the writeback fires on every EndEncounter, not just the encounter-completed branch.
- **The minion-squad caveat is a known limitation, not a bug.** A director who runs 12 minions today sees 12 individual rows and runs 12 individual turn slots. Pass 2a doesn't make this better; it doesn't make it worse either. The Turn-flow design composes cleanly with a future squad row (one Turn flow shared across squad members) once Pass 2b builds that.
- **`AdjustVictories` is one intent, applied to all PCs.** Reducer iterates `state.participants.filter(p => p.kind === 'pc')` and bumps each. Undo restores all of them at once. Edge case: a PC who left the lobby mid-encounter (uncommon but possible via Phase 3 lending revocations later) — Pass 2a uses the live participant list at apply-time; we don't reconcile against the original character list.

## Acceptance

Pass 2a is done when:

1. A player loading `/campaigns/$id/play` with an active encounter sees the rails on the left (gated to name + stamina + conditions for everyone, with their own row marked self), the right pane locked to their own character defaulting to Turn flow, and no PlayerSheetPanel below-fold.
2. The director sees the same SplitPane layout with the full DetailPane (Full-sheet default) and the rails showing role + pips + recoveries + stamina for every participant.
3. Tapping a row in player view sets that participant as the target; the AbilityCard's `Auto-roll` honours it. Tapping again clears it.
4. Rolling an `action`-type ability auto-collapses the Main section in the Turn flow; rolling a `maneuver`-type collapses the Maneuver section; rolling `triggered` / `free-triggered` / `villain` / `trait` leaves both pending.
5. The `Skip` button on a Turn-flow section marks that slot used; `Done moving` marks the Move slot. Undo of a roll un-collapses its section; undo of a Skip un-collapses its section.
6. `StartTurn` for a participant resets their `turnActionUsage` to all-false. Round 1 starts with everyone's slots cleared.
7. Malice +/– buttons render only for the active director; the readout is visible to all. Victories has a parallel +/– pair (director only) that dispatches `AdjustVictories { delta: ±1 }`; the readout is visible to all.
8. `AdjustVictories` updates every PC participant's `victories` by the same delta; EndEncounter writes the post-encounter value back to `character.victories` in D1. A player who reloads sees the new total.
9. `useIsActiveDirector` returns true iff `me.userId === activeDirectorId`. The Mode-B TopBar chrome from Pass 1 activates accordingly.
10. The InitiativePanel + PlayerSheetPanel + DetailPane files are removed from `pages/combat/`; the new `detail/` and `combat-header/` directories replace them.
11. `pnpm test`, `pnpm typecheck`, `pnpm lint` clean repo-wide. Two new reducer test suites — `mark-action-used.spec.ts` and `adjust-victories.spec.ts` — cover the apply + inverse + role-gate paths.
12. Spot-check screenshots at iPad-portrait (810 × 1080) and iPhone-portrait (390 × 844) for both `/campaigns/$id/play` views (director and player) confirm the layout holds.

## Out-of-scope confirmations

- No pack-color per-row tinting (Layer 2).
- No drag-reorder, no gestural director-side targeting, no monster stat-block deepening (Pass 2b).
- No minion squad rendering (Pass 2b+).
- No new EncounterBuilder work (Pass 2b).
- No DB migration for active-character persistence (Pass 1.5 / later).

## PS — post-shipping fixes

After the 40-task plan landed and the dev server came up, eye-testing surfaced gaps that weren't visible at design time. Each is a small change layered on top of the Pass-2a plan. Capturing them here so the spec stays a complete record of what shipped.

### 1. Pre-Pass-2a encounters crashed TurnFlowTab on `usage.main`

**Symptom.** Loading `/campaigns/$id/play` on an encounter that was started before Task 1 added the `turnActionUsage` field threw `TypeError: Cannot read properties of undefined (reading 'main')` from `TurnFlowTab.tsx:67`. The WS mirror builds participant snapshots without running them through `ParticipantSchema.parse`, so the new field's `.default()` never fired and the field was genuinely undefined on the mirror-side participant.

**Fix** ([`907ddc5`](../../..)). `TurnFlowTab` derives `usage` with a fallback: `focused.turnActionUsage ?? { main: false, maneuver: false, move: false }`. The same defensive default later got applied in the WS mirror's `MarkActionUsed` handler (PS #4 below).

### 2. Spend/Gain/SetStamina/Malice toasts leaked user-ids instead of names

**Symptom.** The toast stack rendered `"01KRH2K8N2AV1EN2ZK13N9DQFB dispatched SpendRecovery"` — `intentDescribe.ts`'s default branch was `${intent.actor.userId} dispatched ${intent.type}`, and many intents (SpendRecovery, SpendResource, GainResource, SpendSurge, SetStamina, ApplyHeal, GainMalice, SpendMalice) didn't have explicit cases.

**Fix** ([`78cf8ab`](../../..)). Added per-intent describe cases that resolve `participantId` → participant name via `nameOf()`, with friendly verb framing (`"Mira spent a recovery"`, `"Director gained 2 Malice"`). The default branch dropped the userId entirely and now reads `"Dispatched <Type>"`.

### 3. RollPower toasts rendered synthetic `abilityId` instead of ability name

**Symptom.** `"Sir John rolls pc:01KRH2KRB7YZT4B3BWZQHDPK2M:mind-game-5-focus vs Ajax the Invincible (auto)"` — `RollPowerPayloadSchema` carries `abilityId` (constructed as `${attackerIdBase}:${slug}`) but not the human-readable name; the toast had nothing better to render.

**Fix** ([`974183a`](../../..)). Bumped the schema with an optional `abilityName` field (same back-compat pattern as Task 5's `abilityType`), DirectorCombat's `dispatchRoll` now passes `args.ability.name`, and `intentDescribe` prefers `abilityName` over `abilityId` for both `RollPower` and parented `ApplyDamage` toasts. Toast now reads `"Sir John rolls Mind Game vs Ajax the Invincible (auto)"`.

### 4. Victories +/- didn't live-update; display summed across heroes; styled as a plain Stat

**Symptom.** Three issues bundled: (a) Director clicks +/- on Victories, the readout didn't change until a snapshot envelope arrived later (the WS mirror's `reflect()` had no case for `AdjustVictories` or `MarkActionUsed`); (b) the display was `heroes.reduce((sum, p) => sum + (p.victories ?? 0), 0)`, so a party-wide +1 looked like +3 for a 3-PC party; (c) `VictoriesPill` rendered as a plain `<Stat>`, asymmetric with `MalicePill`'s pill+dot styling.

**Fix** ([`5005fd0`](../../..)). (a) Added `AdjustVictories` and `MarkActionUsed` cases to `reflect()` so optimistic updates land on the screen immediately. (b) Changed the display derivation to `heroes[0]?.victories ?? 0` — per canon § 8.1 victories bump in lockstep across the party so any one hero's value is canonical. (c) New `--victory: oklch(0.82 0.17 85)` gold token; VictoriesPill now uses the same `<Pill dotClassName="bg-victory">` shape as MalicePill with editable-gated +/- buttons.

### 5. Active-turn ring was static; no motion signal for whose turn it is

**Symptom.** Pass 1 left motion deferred, and the Pass-2a-plan's TurnFlowSection / ParticipantRow shipped with a static `border-pk` ring on the active row. At the table that's easy to miss while watching the dice.

**Fix** ([`843b743`](../../..)). New `@keyframes ironyard-turn-pulse` in `styles.css` breathes a 0→6px outer accent glow on the existing pk-inset ring over `--motion-pulse` (2.2s) ease-in-out. `ParticipantRow.turnClass` now applies `.turn-pulse` instead of a static shadow utility. `prefers-reduced-motion` disables the loop.

### 6. Director auto-locked to their own PC after the active-director signal resolved

**Symptom.** When the director owned a PC in the encounter, the right pane defaulted to that PC and tapping a monster row sometimes didn't switch focus. Caused by the lock-to-self `useEffect` firing transiently during the `useCampaign` HTTP fetch — `isActingAsDirector` reads `false` until the cache resolves, `viewerRole` is briefly `'player'`, the effect sets `selectedId` to `selfParticipantId`, then `viewerRole` flips to `'director'` but the effect's dep change doesn't undo the lock.

**Fix** ([`4afbe1c`](../../..)). Replaced the `useEffect` with a pure render-time derivation: `effectiveSelectedId = viewerRole === 'player' && selfParticipantId ? selfParticipantId : selectedId`. Player view is locked render-side (can't leak into `setState`); director view reads bare `selectedId` and stays fully responsive to taps. Rails' `selectedParticipantId` + DetailPane's `focused` lookup both consume `effectiveSelectedId`.

### 7. Combat tracker needed full viewport — global TopBar took chrome height the page wanted

**Symptom.** `/campaigns/$id/play` rendered the global TopBar above the page-owned InlineHeader (two stacked headers) and the SplitPane used `min-h-[calc(100vh-3rem)]`, leaving the panes as a single scrollable block that competed with the below-fold `<OpenActionsList>` for viewport height. The user wanted exactly two pinned-height columns under InlineHeader.

**Fix** ([`38af810`](../../..)). Three changes bundled:
- AppShell gained `FULL_VIEWPORT_PATTERNS` (regex list) and hides the global TopBar when `location.pathname` matches `/campaigns/$id/play`.
- DirectorCombat's live-encounter `<main>` switched from `min-h-screen` to `h-screen flex flex-col`; SplitPane uses `flex-1 min-h-0 p-3.5`; each pane scrolls independently inside its column.
- `OpenActionsList` moved from the killed below-fold into the **top of the right pane**, gated on `openActions.length > 0` so an empty queue collapses entirely and the DetailPane gets the full column height.

### 8. No Skip-turn affordance; no End-turn signal when all 3 slots are done

**Symptom.** Players who skipped Main / Maneuver / Move individually ended up staring at three "done" rows with no next-step indicator. There was no way to fast-forward (skip the whole turn) for a player who'd already moved their figure on the table and just wanted to pass.

**Fix** ([`2fd3a7d`](../../..)). TurnFlowTab gained two new affordances, both gated on `isActiveTurn`:
- **Skip turn** — trailing mono-uppercase ghost button at the top, visible while any slot is pending. Marks every remaining slot used and immediately dispatches `EndTurn` in one click.
- **End-turn CTA** — when all three slots are `used` (rolled / skipped individually / Skip-turn'd), an accent-bordered "Turn complete" callout appears at the bottom with a filled End-turn button.

Plumbed via two new optional `DetailPaneProps`: `isActiveTurn` (true when `activeEncounter.activeParticipantId === focused.id`) and `onEndTurn` (wired to DirectorCombat's existing `handleEndTurn` dispatcher). Works for any focused active-turn participant — director driving a monster's turn gets the same affordance.

### 9. Player had no persistent End-turn affordance + no whose-turn signal in the chrome

**Symptom.** Players could only end their turn from the TurnFlowTab end-of-turn callout (PS #8), which requires every slot to be marked done first. No way to end a turn early without firing the Skip-turn flow. And on someone else's turn, the player had no at-a-glance signal of who was up — they had to scan the rails.

**Fix** ([`700157c`](../../..)). InlineHeader's trailing slot (where the director's End-turn button lives) now renders for non-director viewers too:
- **Their turn** → primary **End turn** button (same dispatch path as director's).
- **Anyone else's turn** → mono-uppercase **`KORVA's turn`** readout.

Two new `InlineHeaderProps`: `isPlayerActiveTurn` + `activeParticipantName`, threaded from DirectorCombat (and null-defaulted on the empty / pre-round header instances).

### Maintenance note

Future post-shipping fixes to Pass 2a layer the same way: append a numbered entry to this PS section with a one-line symptom, a one-paragraph fix, and the relevant commit SHA. Once a follow-up entry has shipped *and* been verified in real use, leave it in place — the doc is the historical record, not a TODO list.
