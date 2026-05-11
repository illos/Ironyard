---
name: Phase 1 slice 11 — combat run screen UI
description: The /sessions/:id/play screen where the table actually runs a fight. Live HP, ability cards with auto-roll, per-round undo with toast attribution, manual override on every stat. Mirrors slice 10's UI patterns and dispatches the existing engine intents.
type: spec
---

# Phase 1 slice 11 — combat run screen UI

## Goal

Wire slices 1 + 3 + 4 + 5 + 8 + 10 into the page where the table actually plays. After this slice lands, a director on an iPad and players on phones can: build an encounter (slice 10), hit "Start the fight", and run a real Draw Steel turn — see initiative, watch HP move when an ability hits, tap to apply or undo, change a stat by long-pressing it. The headline Phase 1 deliverable.

Slice 11 stops at "we can run a fight." Hooks for class-specific resources, the full PC sheet, encounter scaling, and the persistent intent-log view all live in later slices.

## Scope cut

**In:**

- New route `/sessions/:id/play`. The lobby (`/sessions/:id`) stays the session landing page; mid-fight, a "Continue in play screen →" link appears on the lobby header so a returning user can pick up where they left off.
- Two-column layout (iPad-landscape), single-column stack (phone-portrait):
  1. **Initiative panel** (left, ~320pt fixed on iPad / collapsed strip on phone): list of `participants[]` in `turnOrder`. Current turn highlighted with an amber strip + dot. Each row is a 56pt tap target showing avatar chip (M/PC), name, current/max stamina, and a compact HP bar. Tapping a row sets it as the focused participant.
  2. **Detail pane** (right, fills the rest): the focused participant. Header with name + kind badge + level (monsters). HP bar (large, 12pt tall), current/max numeric. Condition chips below the bar. Characteristics shown as a 5-cell mono row. Then ability cards.
- **Ability cards** (in the detail pane): each card has the ability name, a one-line summary (characteristic + t1/t2/t3 damage at a glance), and a primary **"Auto-roll"** button that dispatches a `RollPower` intent. After the engine resolves it (the `applied` envelope arrives), the resulting damage is auto-applied by the engine (RollPower derives ApplyDamage — already implemented in slice 3). A secondary **"Manual…"** affordance opens a small inline editor for the t1/t2/t3 outcome the director wants to apply manually (still goes through `RollPower` with `source: 'manual'` and pre-baked rolls that land at the chosen tier).
  - Target selection: a single-target picker above the cards (defaults to the first non-self participant). Slice 11 ships single-target only; multi-target abilities are a stretch and skipped if time runs out.
  - PCs (kind === 'pc') get a placeholder "No ability sheet yet — Phase 2" panel + a single generic **"Free strike"** ability so testing the loop with a PC isn't a dead end.
  - Monsters use a small in-repo stub abilities table keyed by monster id (slice 2 only ships id/name/level), with a single generic ability per monster — see `apps/web/src/data/monster-abilities.ts`. TODO so this is easy to replace when the data ingest extends to ability blocks.
- **Toast attribution** for the most recent applied intent (top-right, 6s auto-dismiss, stackable up to 3): "Sarah → Goblin 3 took 14 fire — Ash bolt hit." with an **Undo** button. Toast text is derived from the intent type + payload + the participant snapshot at apply time (we hold a tiny intent-log mirror in `useSessionSocket`). Undo button on a toast dispatches `Undo { intentId }` against the root intent (the `RollPower`, not the derived `ApplyDamage`).
- **Undo button** in the page header: dispatches `Undo` for the most recent dispatchable intent (== the latest non-voided non-derived intent in the current round). Disabled when (a) the round-boundary rule means no undoable intent exists, or (b) the WS isn't open.
- **End Turn button** in the header: dispatches `EndTurn`. The reducer advances `activeParticipantId` to the next entry in `turnOrder`. If we fall off the end, the header surfaces an **End Round** button instead.
- **Manual override on every stat**: long-press (500ms) or right-click on a stamina number or condition chip opens a Radix-style popover (we don't have Radix installed yet — use a plain conditional render + click-outside) with the appropriate edit form. We don't have a generic `SetStat` intent in the engine surface today; the closest fits are:
  - Stamina edit → dispatch a manual `RollPower` configured so its derived ApplyDamage delivers exactly (current − desired) damage, OR — cleaner — dispatch a direct `ApplyDamage` with `source: 'manual'`. **This won't fly: ApplyDamage is server-only per `session-do.ts`.** Punt: surface in the return summary that the engine needs a `SetStat` (or non-server-only-flagged ApplyDamage / Heal) intent for slice 11 to deliver "long-press to edit HP" cleanly. Until then, the long-press affordance on HP is wired but shows an "Edit not yet supported — use the manual-roll affordance" hint and a link to the spec note. The manual-roll affordance on each ability card *does* land manually-typed damage by letting the director enter a final amount and dispatching a `RollPower` whose `ladder` is pre-filled to deliver that amount on the rolled tier.
  - Condition add → dispatch `SetCondition` with `source: { kind: 'effect', id: 'manual-override' }` and a duration picker (defaults to EoT).
  - Condition remove → dispatch `RemoveCondition`.

**Out:**

- Initiative reorder UI (no drag-handles via dnd-kit; the order is whatever slice 10 produced via insertion). Surface in the summary.
- Multi-target ability rolls (single-target only this slice).
- Encounter scaling by victories (data layer not extended yet).
- Full PC sheet (Phase 2).
- Persistent toast history / intent log view (separate slice).
- Animation polish beyond Tailwind's built-in transitions.
- Server-side dice rolling (still client-side per Phase 1; trust model says it's fine).
- A real Radix popover — plain conditional + click-outside is enough; Radix lands when we need a real menu primitive.

## Files to add / modify

**New:**

- `apps/web/src/pages/CombatRun.tsx` — the page component, ~400 LOC. Top-level orchestrator: reads `useSessionSocket`, splits into `<InitiativePanel>`, `<DetailPane>`, `<ToastStack>`, `<HeaderControls>`.
- `apps/web/src/pages/combat/InitiativePanel.tsx` — the left strip.
- `apps/web/src/pages/combat/DetailPane.tsx` — the right pane.
- `apps/web/src/pages/combat/AbilityCard.tsx` — single ability card with auto-roll + manual override.
- `apps/web/src/pages/combat/ConditionChip.tsx` — chip + remove menu.
- `apps/web/src/pages/combat/ToastStack.tsx` — the bottom-right toast area with Undo.
- `apps/web/src/pages/combat/HpBar.tsx` — the reusable HP bar.
- `apps/web/src/data/monster-abilities.ts` — the stub abilities table. One generic ability per monster level tier, keyed by level. Generic free strike for PCs.
- `apps/web/src/lib/longPress.ts` — tiny `useLongPress(ms, onLongPress)` hook (no deps).
- `apps/web/src/lib/intentDescribe.ts` — derives toast text from `(intent, participantsBefore, participantsAfter)`.
- `apps/web/src/lib/rollDice.ts` — 2d10 client-side roller. Pure; deterministic via injected RNG to make testing painless. (Future: server-side replacement; today it's `Math.random()` per CLAUDE.md trust model.)

**Modify:**

- `apps/web/src/router.tsx` — add the `/sessions/$id/play` route → `CombatRun`.
- `apps/web/src/pages/SessionView.tsx` — add a "Continue in play screen →" link when `activeEncounter && currentRound !== null`.
- `apps/web/src/pages/EncounterBuilder.tsx` — change the "Start the fight" navigate target from `/sessions/$id` to `/sessions/$id/play`.
- `apps/web/src/ws/useSessionSocket.ts` — extend the mini-mirror reducer to ALSO reflect: `StartRound` → set `currentRound: 1` and `activeParticipantId: turnOrder[0]`; `EndTurn` → advance `activeParticipantId`; `EndRound` → null both; `StartTurn` → set `activeParticipantId`; `ApplyDamage` → mutate participant stamina; `SetCondition` / `RemoveCondition` → mutate `conditions[]`; `snapshot` envelope → replace full mirror state. Also track a tiny intent log so the toast stack can derive attribution + the Undo button knows what to target. Keep the mirror under ~120 lines, clearly comment that the real client reducer is a later slice's lane.

**No changes to:**

- `packages/rules/**`, `packages/shared/**`, `packages/data/**`, `apps/api/**`. Per the brief.

## Key UX details

- **iPad-landscape (1180×810) is the primary form factor.** Left rail is 320pt; detail pane fills the rest. On `lg:` and below collapse to a single column with the initiative panel as a horizontally-scrolling strip at the top.
- **Touch targets are 44pt minimum** for every interactive element (Tailwind `min-h-11 min-w-11`). Ability "Auto-roll" buttons are 56pt for finger-fat-friendliness during play.
- **No hover-only affordances.** The long-press menu and the Manual… secondary action are both reachable via tap (long-press on touch, right-click on desktop, also a small `⋯` button visible at all times for accessibility).
- **HP bar colour ramp**: emerald above 50%, amber 25–50%, rose below 25%. Background `neutral-800`. The bar inside uses a CSS transition for smoothness when an applied intent moves it.
- **Active-turn highlight** in the initiative panel: amber 2pt left border + an amber dot next to the name. The amber accent is reserved for "this is what's happening right now" — used nowhere else, so it pops.
- **Condition chips**: muted backgrounds keyed off the condition type — Bleeding rose-900/40, Dazed indigo-900/40, Frightened violet-900/40, Grabbed amber-900/40, Prone stone-800, Restrained orange-900/40, Slowed sky-900/40, Taunted fuchsia-900/40, Weakened slate-800. Each chip is a `⋯` long-press → "Remove".
- **Toasts**: bottom-right on iPad, top of screen on phone (so they don't fight with thumb-zone controls). Each toast is `neutral-900` with a 1pt rose-500 left border, name in white, the action recap in neutral-300, the Undo button on the right at 44pt min. Slides in with a quick translate-y; auto-dismisses after 6s. Max 3 visible, FIFO; older ones drop off.
- **Empty / mid-fight states**: if `activeEncounter === null`, show "No encounter yet — go to the [Build encounter] page." If `activeEncounter && currentRound === null` (encounter built but never started), show "Round not started" with a Start Round button (dispatches `StartRound`).
- **Connection status badge** in the header (same colour scheme as slice 10).

## Wire flow

Auto-roll-and-apply (the headline path):

```
1. Director (or player attacking) taps "Auto-roll" on an ability card targeting Goblin 3.
2. Client builds the RollPower payload:
   {
     abilityId: ability.id,
     attackerId: focused.id,
     targetIds: [target.id],
     characteristic: ability.characteristic,
     edges: 0, banes: 0,
     rolls: { d10: [rollD10(), rollD10()] },  // client-side rolls per trust model
     ladder: ability.ladder,                  // baked from monster-abilities.ts
   }
3. Dispatch via useSessionSocket.dispatch (buildIntent envelope, source: 'manual').
4. WS round-trip:
   - DO validates, runs applyIntent.
   - applyIntent emits derived ApplyDamage; DO recursively applies it.
   - DO broadcasts `applied` for the RollPower, then `applied` for the ApplyDamage.
5. Client's mini-reducer processes both envelopes:
   - RollPower advances seq (no state change to participants).
   - ApplyDamage mutates target.currentStamina.
6. ToastStack pushes a toast with attribution derived from the parent RollPower intent
   ("Sarah → Goblin 3 took 14 fire — Ash bolt hit"). The toast's Undo button calls
   `dispatch(Undo { intentId: parentRollPower.id })`. The DO voids the parent + derived
   chain and broadcasts a `snapshot`; the mirror reducer replaces state from that snapshot.
```

Manual outcome on an ability card:

```
1. Director taps "Manual…", enters tier (1/2/3) or types a damage amount.
2. Client builds a RollPower with rolls pre-rigged to land at the chosen tier
   (e.g. [10, 10] for tier 3, [5, 5] for tier 2, [1, 1] for tier 1) and ladder
   pre-baked. source stays 'manual'.
3. Rest of the flow is identical to auto-roll above. The toast says "manual"
   in the attribution so the table knows the engine didn't roll it.
```

End turn:

```
1. Director taps "End Turn" in the header.
2. Dispatch EndTurn {} — DO advances activeParticipantId in state.
3. Mirror reducer reflects, the initiative panel re-highlights the next participant.
4. If we fall off the end of turnOrder, the header switches "End Turn" to "End Round".
```

Undo (header button):

```
1. Director taps Undo.
2. Client looks up its mirror's latest undoable intent id (last non-voided
   non-derived intent since the latest EndRound) and dispatches Undo { intentId }.
3. DO voids the chain, broadcasts a snapshot; mirror replaces state.
4. Toast: "Undid: <attribution>".
```

## Constraints for the agent

- **Touch only `apps/web`.** No changes to `packages/rules`, `packages/shared`, `packages/data`, or `apps/api`. (The spec calls out the SetStat gap; the implementation must NOT silently add an intent. Surface it in the return summary.)
- Reuse existing patterns: TanStack Query hooks in `apps/web/src/api/`, `useSessionSocket` for the WS, `buildIntent` from `api/dispatch.ts`, dark Tailwind theme.
- **No new dependencies.** No Radix, no dnd-kit, no toast library. Hand-rolled is fine and avoids dragging in a heavy dep just for slice 11.
- Don't write `Math.random()` outside `apps/web/src/lib/rollDice.ts` — the trust-model note says "swapping to server-side dice rolling later is just changing where Math.random() is called", so it lives in exactly one place.
- TypeScript strict; no `any` without an explicit `// biome-ignore` and a justification comment.
- Zod parse at boundaries (we receive `applied` envelopes already parsed by `useSessionSocket`; payloads coming off the wire still need narrowing when the mirror reducer reads `intent.payload`).
- Verify with:
  - `pnpm typecheck` (repo-wide)
  - `pnpm lint`
  - `pnpm --filter @ironyard/web build`
  - `pnpm -r test` (no new vitest tests this slice; the existing rules-package suite must still pass since slice 11 doesn't touch packages/rules)
  - Take screenshots at iPad-landscape (1180×810), iPad-portrait (810×1080), iPhone-portrait (390×844) IF puppeteer/playwright is installed; otherwise document manual reproduction in the return summary. **Do not install a heavy dep just for screenshots.**

## Acceptance

After this branch is merged the user can:

1. Sign in, create a session, /build, add a couple of monsters + a quick-PC, hit Start the fight → land on `/sessions/:id/play`.
2. See initiative on the left, the active participant highlighted, their detail on the right.
3. Tap the goblin in initiative → its detail loads.
4. Tap "Auto-roll" on its only ability targeting the PC → HP moves, toast attributes the hit.
5. Tap Undo on the toast → HP restores, toast says "Undid: …".
6. Tap End Turn → next participant highlights.
7. Long-press a condition chip → menu shows "Remove" → tap → condition disappears.
8. Long-press an HP number → menu shows the "edit not yet supported" hint linking to the spec gap.
9. Reload mid-fight → the page rehydrates from the DO's snapshot-or-replay, same view as before.

## Expected output (return summary)

1. Worktree branch name + spec path.
2. Files added/modified, one-line each.
3. Raw output of typecheck, lint, build, test.
4. Screenshot status (taken / where stored / skipped because no headless browser).
5. Anything punted from the "In" list — explicitly the SetStat gap, the initiative reorder, the multi-target ability rolls.
6. Any deviation from the brief, with reasoning.
