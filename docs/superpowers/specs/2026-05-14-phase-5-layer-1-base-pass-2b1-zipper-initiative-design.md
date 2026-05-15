# Phase 5 Layer 1 (Base) — Pass 2b1: zipper initiative

**Status:** Designed, awaiting plan.
**Parent:** Phase 5 — UI rebuild ([phases.md](../../phases.md#phase-5--ui-rebuild)). Pass 1 ([spec](2026-05-14-phase-5-layer-1-base-pass-1-design.md)) shipped tokens + primitives + role-aware shell on 2026-05-14. Pass 2a ([spec](2026-05-14-phase-5-layer-1-base-pass-2a-content-gating-design.md)) shipped content gating + Turn flow + role-asymmetric chrome the same day.
**Successor:** Pass 2b2 — combat-tracker / encounter-builder UI deepening (ability-card layout polish, monster stat-block deepening on rails, OpenActions row affordances, per-condition palette, encounter-builder threat-budget, embellished Mode-C chip, Mode-B nav surface, director-side gestural target-picking). Spec'd separately after 2b1 ships.
**Scope notes:** brainstormed 2026-05-14 from the user's redirect on Pass-2b's inventory item B1 — drag-reorder of initiative is **not** the right call for a Draw Steel app; the system uses zipper initiative (canon § 4.1). Pass 2b1 implements zipper initiative correctly across the engine and the run-screen UI, replacing the prototype-grade flat `turnOrder: string[]` model that the engine has shipped with since Phase 1. The remainder of Pass 2b's inventory (B3–B6, C1–C3, D2–D3) is deferred to Pass 2b2.

## One-line summary

Replace the engine's flat `turnOrder: string[]` initiative model with the canon zipper-initiative state machine: a `RollInitiative` banner at encounter start decides the first side via d10 (or manual override), sides alternate picking who acts next (heroes self-elect via "I'll go now"; the active director picks foes one at a time), and the winning side stays the first-picker every round. Pre-existing encounters lazy-migrate by re-rolling once when reopened.

## Goals

- Implement canon § 4.1 round structure end-to-end in the engine: first-side roll, side alternation, run-out rule, per-round first-side persistence.
- Introduce a light `surprised` flag on participants that drives the first-side auto-pick rule (one side fully surprised → that side's opponent acts first; skip the d10). Auto-cleared at `EndRound` for round 1 per canon. The roll-side and triggered-action-blocking effects of surprise are deferred to the Phase 2b umbrella where the rest of `RollPower` edge/bane stacking lives.
- Ship the Roll-Initiative banner as a left-pane overlay over the rails on encounter start. Anyone can press the roll button; the active director additionally has surprise-marking row taps and a manual side-pick override. The d10 reveal animates inline; resolution stamps `firstSide` and dismisses.
- Light up the picking-phase chrome between turns: InlineHeader's trailing slot shows whose pick window is open; PartyRail surfaces a primary "I'll go now" button on each PC owner's own unacted row; EncounterRail surfaces a tap-target on each unacted foe row for the active director. Acted rows render dimmed with an `ACTED` tag until round end.
- Migrate `EndTurn` from "advance to next index in `turnOrder`" to "clear active turn and let the next pick happen explicitly," and derive `currentPickingSide` from `actedThisRound` + side membership (canon's run-out rule is a pure derivation).
- Remove `SetInitiative` + its reducer + its `turnOrder` writes. The flat-list model is gone.
- Make the change forward-compatible with the future minion-squads epic (a new Phase 2b umbrella entry, 2b.11) — the side-aware picker model composes cleanly with a future "pick the whole squad, all members act consecutively" gesture without revisiting 2b1's state shape.

## Non-goals (deferred to Pass 2b2 or the Phase 2b umbrella)

- **Director-side initiative groups (canon § 8.6).** The encounter builder still has no group concept; director picks one foe at a time in 2b1. The "members of a squad act consecutively" canon semantic is **not** implemented here — that's the new **2b.11 minion squads** sub-epic in the Phase 2b umbrella. 2b1's state shape composes with squads when they land; no schema rework will be needed.
- **Roll-side surprise effects.** The "ability rolls against surprised gain an edge" and "surprised creatures can't take triggered actions" parts of canon § 4.1 are roll-pipeline / action-economy-gate work that belongs in the Phase 2b umbrella alongside the rest of `RollPower` edge/bane stacking and the action-economy state machine (§ 4.10). 2b1 stops at the flag + the first-side auto-pick rule. The flag is read but its consequences aren't wired.
- **Pass 2b2 inventory.** Ability-card layout polish (B3), monster stat-block deepening on rails (B4), OpenActions row affordance refinement (B5), per-condition palette (B6), encounter-builder previews / threat-budget / filtering (C1–C3), Mode-C chip embellishment (D2), Mode-B nav surface beyond `Foes` (D3), director-side gestural target-picking. All defer to Pass 2b2's separate spec.
- **Layer 2 / Layer 3 work.** Pack-color per-row, theme picker, action effects — unchanged from Pass 1.
- **DB persistence for the active context.** localStorage-backed in Pass 1 stays the wire.
- **Drag-reorder of initiative.** Listed as B1 in Pass 1's Non-goals (deferred to Pass 2). This spec replaces it with zipper initiative entirely; B1 is removed from the Pass 2b inventory rather than implemented.

## Architecture

### Engine: state shape

`EncounterPhase` (`packages/rules/src/types.ts`) becomes:

```ts
type EncounterPhase = {
  id: string;
  currentRound: number | null;
  // Zipper initiative — replaces today's flat `turnOrder: string[]`.
  firstSide: 'heroes' | 'foes' | null;           // null until RollInitiative fires
  currentPickingSide: 'heroes' | 'foes' | null;  // who picks next; null between rounds
  actedThisRound: string[];                       // participant ids who have acted this round
  activeParticipantId: string | null;             // unchanged semantics
  turnState: Record<string, TurnState>;
  malice: MaliceState;
  // `turnOrder` REMOVED
};
```

`Participant` (`packages/shared/src/participant.ts`) gains:

```ts
surprised: z.boolean().default(false),
```

Default false; cleared by `applyEndRound` for round 1 (canon: surprise lasts until end of round 1).

### Engine: new intents

`RollInitiative` (`packages/shared/src/intents/roll-initiative.ts`). Single-payload shape. The dispatcher handles all client-side decision-making (d10 roll → chooser UI → manual override) and sends one final intent carrying the chosen winner. The d10 value is informational only:

```ts
export const RollInitiativePayloadSchema = z.object({
  winner: z.enum(['heroes', 'foes']),
  surprised: z.array(z.string().min(1)).default([]),
  rolledD10: z.number().int().min(1).max(10).optional(),  // log-only metadata
}).strict();
```

Reducer (`packages/rules/src/intents/roll-initiative.ts`):

1. Rejects if no active encounter, or if `encounter.firstSide !== null` (idempotent guard — can't re-roll once decided).
2. Validates every id in `surprised: string[]` exists in the roster.
3. Validates the surprise auto-pick rule. Compute "fully surprised side" against the post-stamp surprised set: if one side is fully surprised (every participant on that side will carry `surprised: true` after this intent applies) and the other side has at least one un-surprised participant, then `winner` MUST equal the un-surprised side; otherwise the intent is rejected with `surprise_override_mismatch`. The dispatcher (overlay) computes this prediction in advance and only sends a `winner` consistent with the rule, so well-behaved clients never trip this guard — it exists to prevent a hand-crafted payload from skipping a canon rule.
4. Stamps `surprised = true` on each named participant.
5. Sets `firstSide = winner`, `currentPickingSide = winner`, `actedThisRound = []`. Does not touch `currentRound` (the encounter's first `StartRound` happens separately, same as today).
6. Emits a log entry with the d10 value (when present) and the resolution reason (manual / surprise auto-pick / d10).

`PickNextActor` (`packages/shared/src/intents/pick-next-actor.ts`):

```ts
export const PickNextActorPayloadSchema = z.object({
  participantId: z.string().min(1),
}).strict();
```

Reducer (`packages/rules/src/intents/pick-next-actor.ts`):

1. Rejects if no active encounter, or `currentRound === null`, or `firstSide === null`.
2. Rejects if `activeParticipantId !== null` (a turn is already in progress).
3. Rejects if `participantId` is in `actedThisRound`.
4. Rejects if the participant's side does not equal `currentPickingSide`.
5. Trust check (matches canon-trust + active-director-override):
   - For a hero pick: actor.userId === participant.ownerId (PC owner) **OR** actor.userId === state.activeDirectorId.
   - For a foe pick: actor.userId === state.activeDirectorId.
6. Appends `participantId` to `actedThisRound`, emits a derived `StartTurn` intent threading the optional d3 through (see below).

Heroic-resource d3 threading. Today's `StartTurn` payload optionally carries `rolls.d3` for d3-gain classes (Conduit, Fury, Shadow, Talent, Troubadour). Since `PickNextActor` is now the entry point that triggers `StartTurn`, it threads the d3 through. The final shape is:

```ts
export const PickNextActorPayloadSchema = z.object({
  participantId: z.string().min(1),
  rolls: z.object({ d3: z.number().int().min(1).max(3) }).optional(),
}).strict();
```

The dispatcher inspects the picked participant's heroic-resource shape and pre-rolls the d3 only when required; the engine forwards `rolls` onto the derived `StartTurn` intent. Mismatched payloads (flat-gain class with `rolls.d3` supplied, or d3-gain class without) are rejected on the derived `StartTurn` with the existing error path — no new validation surface needed.

`MarkSurprised` (`packages/shared/src/intents/mark-surprised.ts`):

```ts
export const MarkSurprisedPayloadSchema = z.object({
  participantId: z.string().min(1),
  surprised: z.boolean(),
}).strict();
```

Reducer (`packages/rules/src/intents/mark-surprised.ts`):

1. Rejects if no active encounter.
2. Trust check: **active director only** (canon-trust — only the director judges who was caught unaware).
3. Allowed at any time during round 1 or before `RollInitiative` fires. Rejected if `currentRound !== null && currentRound > 1` (canon: surprise ends at round-1 end).
4. Sets `participant.surprised = surprised` on the named participant.

### Engine: existing intent changes

`StartEncounter` (`packages/rules/src/intents/start-encounter.ts`): initializes `firstSide: null`, `currentPickingSide: null`, `actedThisRound: []`. No longer initializes `turnOrder` (the field is gone). The malice preload + heroic-resource preload paths are unchanged.

`StartRound`: for rounds 2+, sets `currentPickingSide = firstSide`, clears `actedThisRound = []`. The malice math is unchanged. Round 1's `currentPickingSide` is already set by `RollInitiative`, so the same code path is safe on round 1 (re-applying `firstSide` is a no-op).

`EndRound`: when `currentRound === 1`, sweeps `surprised: false` on every participant (canon: surprise ends end of round 1). The existing OpenAction-expiry sweep is unchanged.

`EndTurn`: the existing logic that advances `activeParticipantId` to the next index in `turnOrder` is **deleted**. New logic:

1. Clear `activeParticipantId = null`.
2. Compute `currentPickingSide` as a derivation:
   - If both sides have unacted participants, flip to the other side.
   - If only one side has unacted participants, stay on that side (canon run-out rule).
   - If neither side has unacted participants, set to `null` and the round is ready to end. The dispatcher (or an explicit `EndRound`) takes it from there.
3. The save-ends and Talent-Clarity-damage cascades stay exactly as today.

Two new helpers in `packages/rules/src/state-helpers.ts` next to `aliveHeroes()`:

```ts
function participantSide(p: Participant): 'heroes' | 'foes' {
  return p.kind === 'pc' ? 'heroes' : 'foes';
}

function nextPickingSide(state: CampaignState): 'heroes' | 'foes' | null {
  if (!state.encounter) return null;
  const acted = new Set(state.encounter.actedThisRound);
  const unactedBySide = { heroes: 0, foes: 0 };
  for (const p of state.participants) {
    if (!isParticipant(p) || acted.has(p.id)) continue;
    unactedBySide[participantSide(p)]++;
  }
  const current = state.encounter.currentPickingSide;
  if (unactedBySide.heroes === 0 && unactedBySide.foes === 0) return null;
  if (unactedBySide.heroes === 0) return 'foes';
  if (unactedBySide.foes === 0) return 'heroes';
  // both sides have unacted creatures — flip
  return current === 'heroes' ? 'foes' : 'heroes';
}
```

`participantSide` is used by `PickNextActor` (side validation). `nextPickingSide` is used by `applyEndTurn` and by the WS-reflect side-flip case — single source of truth so client and engine agree on the run-out rule.

`SetInitiative` intent + `applySetInitiative` reducer + the `turnOrder` field on `EncounterPhase` are **removed**. Existing reducer tests that dispatch `SetInitiative` migrate to `RollInitiative` + `PickNextActor`.

### Engine: backwards compat

Pre-2b1 snapshots may have:
- `turnOrder: string[]` (now extraneous; ignored by the loader).
- No `firstSide` / `currentPickingSide` / `actedThisRound` fields.
- No `surprised` field on participants.

The DO's snapshot loader is the surface that materializes a `CampaignState` from D1. It already runs the Zod schemas with defaults — adding the new fields with defaults handles the migration mechanically. The loader explicitly drops `turnOrder` from the parsed encounter (since it's no longer in the schema, Zod's `.strict()` would reject; we relax to `.passthrough()` on the encounter schema temporarily during 2b1's first deploy, then tighten back once snapshots have been rewritten on next save).

UX-side: a pre-2b1 encounter that loads with `firstSide === null` and `currentRound !== null` shows the Roll-Initiative overlay. The director re-rolls (or manually picks the winner); play resumes. `actedThisRound` starts at `[]`, so creatures who already acted in the in-flight round get to act again — accept this regression for the migration path and document it in the PS. Friend-group trust: at the table, the director can mark already-acted PCs as acted by clicking "I'll go now" + ending their turn immediately, or by tapping the foe row and ending the turn.

### Engine: trust matrix

| Intent | Active Director | Participant Owner | Anyone else |
|---|---|---|---|
| `RollInitiative` | yes | yes (PC owners) | yes (per "anyone can press") |
| `MarkSurprised` | yes | no | no |
| `PickNextActor` (hero) | yes | yes (own PC only) | no |
| `PickNextActor` (foe) | yes | no | no |
| `EndTurn` (own turn) | yes | yes | no |
| `EndTurn` (other's turn) | yes (override) | no | no |

`RollInitiative` deliberately accepts dispatch from anyone — the d10 result is rolled client-side and the chooser UI runs there; the engine accepts the first valid `RollInitiative` and ignores the rest (subsequent ones reject on `firstSide !== null`). This matches the canon flavor of "the table" rolling.

### UI: `RollInitiativeOverlay`

A new component (`apps/web/src/pages/combat/initiative/RollInitiativeOverlay.tsx`) rendered by `DirectorCombat` when `encounter.firstSide === null && encounter.currentRound !== null`. The overlay is positioned **over the rails (left pane only)** — `position: absolute; inset: 0; left: 0; right: 50%` against a relatively-positioned SplitPane parent. The DetailPane (right pane) and InlineHeader remain interactive. (On the phone breakpoint where SplitPane collapses to one column, the overlay covers the whole content area; the InlineHeader stays visible above it.)

The overlay's internal flow:

1. **Default view.** Centered card with:
   - Heading: `ROLL INITIATIVE`
   - Sub-line: per-side participant counts. `4 HEROES · 6 FOES`.
   - Surprise summary: `0 surprised` or `2 surprised: Goblin 3, Goblin 4` (free-text list of names, mono uppercase).
   - **Primary**: large `Roll d10` button. On click, generates a client-side d10 via the existing dice helper, runs the reveal animation, then dispatches `RollInitiative` with `winner` resolved per the rules below.
   - **Secondary** (mono uppercase ghost link): `Pick manually →`. Expands the card to show two side buttons.
2. **Pick-manually view.** The card replaces the Roll button with two buttons:
   - `PLAYERS FIRST` (hero-tone)
   - `DIRECTOR FIRST` (foe-tone)

   Plus a `← Back to roll` link. Clicking a side button dispatches `RollInitiative { winner, surprised: [...], rolledD10: undefined }`.
3. **Surprise-marking layer.** While the overlay is up, every participant row in the left-pane rails behind the overlay (which is visible-but-dimmed) becomes tappable for the active director. Tapping a row toggles its `surprised` state locally in the overlay's component state (not dispatched yet — only sent at roll-time as part of the payload). Marked rows render a `SURPRISED` mono-uppercase chip in the meta line. Player viewers see the same chips read-only and can't tap. The overlay's "Surprise summary" line updates live.
4. **Roll reveal.** When the Roll button fires, the card transitions to:
   - Display the d10 value in display-size mono (`8`).
   - Resolve the winner per the rules:
     - If one side is fully surprised in the overlay's local state → ignore d10, show "Auto-pick: <other side> not surprised."
     - Else if d10 ≥ 6 → "Players choose first." Show a `PLAYERS FIRST` / `DIRECTOR FIRST` button pair (canon: 6+ means players *choose*, including the choice to defer to the director).
     - Else → "Director chooses first." Same chooser, defaulting to Director with a 1.5s auto-confirm timer that any user can cancel by clicking either button.
   - Once a side is picked, dispatch `RollInitiative` and dismiss.

The overlay's dismissal is driven entirely by the WS-reflected state — when `firstSide` becomes non-null in the next snapshot/intent, the overlay unmounts. Optimistic dismissal happens via the `reflect()` case for `RollInitiative`.

### UI: picking-phase chrome (between turns)

Once `firstSide` is set and `currentRound !== null` and `activeParticipantId === null`, the rails enter **picking mode**:

- **InlineHeader** (`apps/web/src/pages/combat/combat-header/InlineHeader.tsx`):
  - Trailing slot replaces today's `KORVA's turn` / End-turn button with a picking-side status pill:
    - `HEROES PICK` (hero-tone) when `currentPickingSide === 'heroes'`
    - `DIRECTOR PICKS` (foe-tone) when `currentPickingSide === 'foes'`
    - Empty/null when `currentPickingSide === null` (round end, ready for StartRound)
  - When a turn is *in progress* (`activeParticipantId !== null`), the existing 2a behavior takes over — End-turn button for the active participant's owner, `KORVA's turn` mono-uppercase readout for others.
- **PartyRail** (`apps/web/src/pages/combat/PartyRail.tsx`):
  - Each `ParticipantRow` receives a new `state` prop derived from `actedThisRound`, `currentPickingSide`, and `me.userId`:
    - `acted`: in `actedThisRound`. Row dims to 55% opacity; trailing meta-line tag reads `ACTED`.
    - `pickable-self`: not acted, `currentPickingSide === 'heroes'`, `p.ownerId === me.userId`. Renders a primary `I'LL GO NOW` button as the trailing affordance.
    - `pickable-other`: not acted, `currentPickingSide === 'heroes'`, `p.ownerId !== me.userId`. Director view only: renders a ghost-link `Pick for them` trailing affordance. Player view: row is non-interactive (read-only "waiting" state).
    - `idle`: not acted, `currentPickingSide === 'foes'`. Row is non-interactive.
- **EncounterRail** (`apps/web/src/pages/combat/EncounterRail.tsx`):
  - Same derivation. Director view: when `currentPickingSide === 'foes'`, each unacted foe row gets a tap-target — clicking dispatches `PickNextActor { participantId }`. Acted rows dim with `ACTED` tag. Player view: rows are read-only with the `ACTED` tag visible.

The "I'll go now" / "Pick for them" / foe-tap dispatches all flow through the same `PickNextActor` intent. The d3-rolling for d3-gain classes is done client-side in the dispatch helper (a one-time inspection of the picked participant's heroic-resource config; same code as 2b.0's `StartTurn` dispatcher) and rides on `PickNextActor.rolls.d3`.

### UI: `ParticipantRow` primitive additions

`apps/web/src/primitives/ParticipantRow.tsx` gains:

```ts
isActed?: boolean;          // dims to 55% opacity, shows ACTED tag
isSurprised?: boolean;      // shows SURPRISED tag (read by all viewers)
pickAffordance?:            // optional trailing affordance
  | { kind: 'self'; onClick: () => void; label: string }    // primary button
  | { kind: 'other'; onClick: () => void; label: string }   // ghost link
  | { kind: 'foe-tap'; onClick: () => void }                // whole-row tap target
  | null;
```

The existing `isTurn` and `isTarget` props stay; the new `pickAffordance` slot composes with them. Visual priority for the row's accent ring: `isTurn` (pk-glow with pulse) > `isTarget` (single-line accent) > `pickAffordance.kind === 'self'` (1px hero-tone outline) > none.

### UI: state reflection in `useSessionSocket`

`apps/web/src/ws/useSessionSocket.ts`'s `reflect()` adds optimistic cases for:

- `RollInitiative` — stamps `firstSide`, `currentPickingSide = winner`, marks `surprised: true` on each named participant, appends the `rolledD10` to the toast log.
- `PickNextActor` — adds `participantId` to `actedThisRound`, sets `activeParticipantId` (deferred until the cascaded `StartTurn` reflect runs; effectively a no-op here since `StartTurn` reflects right after — but listing it for symmetry with the existing patterns).
- `MarkSurprised` — sets `participant.surprised = surprised`.
- `EndTurn` — updates the side-flip derivation. Pure function over `actedThisRound` + participant kinds; same logic as the engine.

Same pattern as the 2a PS #4 fix that added the `AdjustVictories` + `MarkActionUsed` cases — optimistic apply runs ahead of the WS broadcast so the UI feels instantaneous.

### File organization

```
apps/web/src/pages/combat/
├── DirectorCombat.tsx                       branches on initiative phase; mounts overlay
├── initiative/
│   ├── RollInitiativeOverlay.tsx            NEW — left-pane overlay
│   ├── SurprisedRowToggle.tsx               NEW — row-tap handler used during overlay
│   ├── PickerAffordance.tsx                 NEW — derives ParticipantRow.pickAffordance
│   └── index.ts                             NEW — public re-exports
├── combat-header/
│   ├── InlineHeader.tsx                     +pickingSide prop; new picking-pill
│   └── (MalicePill / VictoriesPill unchanged)
├── PartyRail.tsx                            wires pickAffordance via PickerAffordance
├── EncounterRail.tsx                        same
└── DirectorCombat.tsx                       overlay mount + picking-phase dispatch helpers

apps/web/src/primitives/
├── ParticipantRow.tsx                       +isActed / isSurprised / pickAffordance props
└── (others unchanged)

apps/web/src/ws/
└── useSessionSocket.ts                      reflect() cases for new intents

packages/shared/src/
├── participant.ts                           +surprised field
├── intents/
│   ├── roll-initiative.ts                   NEW
│   ├── pick-next-actor.ts                   NEW
│   ├── mark-surprised.ts                    NEW
│   ├── turn.ts                              SetInitiative removed
│   └── index.ts                             re-export the three new intents; drop SetInitiative
└── (index.ts re-exports follow)

packages/rules/src/
├── intents/
│   ├── roll-initiative.ts                   NEW reducer
│   ├── pick-next-actor.ts                   NEW reducer
│   ├── mark-surprised.ts                    NEW reducer
│   ├── turn.ts                              applyEndTurn rewritten (side-flip derivation);
│   │                                        applyStartRound resets currentPickingSide;
│   │                                        applySetInitiative removed
│   ├── start-encounter.ts                   initializes new fields, drops turnOrder
│   └── (others unchanged except end-round.ts: surprise sweep)
├── reducer.ts                               dispatch cases for the three new intents;
│                                            SetInitiative case removed
├── state-helpers.ts                         +participantSide() helper
└── types.ts                                 EncounterPhase shape changes (drops turnOrder,
                                              adds firstSide / currentPickingSide / actedThisRound)

apps/web/src/lib/intentDescribe.ts           describe cases for the three new intents
```

### Phase 2b umbrella update

`docs/phases.md`'s "Phase 2b — Combat completeness" table gains a new sub-epic row:

| **2b.11** | **Minion squads** — N minions sharing one row + one Turn-flow; squad-level action-economy bookkeeping; consecutive-act semantics when a squad is picked in zipper initiative; encounter-builder grouping UI (canon § 8.6 initiative groups). Composes with Pass 2b1's side-aware picker without schema rework | new SquadParticipant entity (or `participant.squadId`); EncounterBuilder grouping UI; PickNextActor extension for squad-as-target; consecutive-turn cascade | 🚧 |

And in the "Sequencing notes" section, add a bullet noting that 2b.11 depends on Pass 5 Layer 1 2b1 (zipper initiative) being live, since the squad-pick UX builds on the side-aware picker.

### Trust model summary

Both new intents are role-gated in the reducer:

- `RollInitiative` — anyone can dispatch (canon: anyone at the table can roll). Reducer rejects if `firstSide !== null` (idempotent).
- `PickNextActor` — participant's owner (own PC) OR active director (any participant).
- `MarkSurprised` — active director only.

The active-director gate uses the same `actor.userId === state.activeDirectorId` predicate the existing director-only intents (`AdjustVictories`, `GainMalice`, `SpendMalice`) use.

## Constraints and risks

- **`SetInitiative` removal is a breaking change** for tests and fixture scripts. The plan should sequence the new intents + reducers + tests landing first (all green), then the `SetInitiative` removal in a separate commit so its blast radius is isolated. Search for callers: `packages/rules/src/__tests__/`, `packages/data/tests/`, any e2e fixtures.
- **The encounter snapshot migration is silent.** Loaders run defaults; pre-existing `turnOrder` data is dropped. Risk: a director with an in-flight encounter mid-round loses round-state. Mitigation: post-shipping PS entry documenting the migration; verbal "if you have a live encounter, finish the round before deploying" warning at deploy time (we have no other users yet, so this is a friend-group concern only).
- **The d10-and-then-chooser flow is two-step in the UI but one intent in the engine.** Risk: confusing toast/log story if a user expects the roll itself to be logged separately. Mitigation: include `rolledD10` on the `RollInitiative` payload as log-only metadata; toast reads `"d10=8 → Players choose first"` then `"Players chose: Players first"` as a single line per intent.
- **Run-out rule is a pure derivation, not bookkeeping.** Risk: bugs where the derivation disagrees between client and server. Mitigation: same helper function `nextPickingSide(state)` lives in `packages/rules/src/state-helpers.ts` and is consumed by both `applyEndTurn` and `reflect()`. Single source of truth.
- **The "anyone can press Roll" trust model** is intentionally permissive but creates a race condition: two users press Roll at the same time, both dispatch, the second is rejected on `firstSide !== null`. Mitigation: the dispatch helper checks the local optimistic state before sending and disables the button after the first click; the engine's idempotent reject is the safety net. Reflect the rejection by un-disabling the button if the response says rejected.
- **Surprise auto-pick can override a manual choice.** If a director manually picks `winner: 'foes'` but every foe is surprised, the engine returns the override-the-override and picks `'heroes'`. Risk: surprising at the table. Mitigation: the overlay's surprise-summary line shows the auto-pick prediction live (`"Auto-pick: Heroes (all foes surprised)"`) so the director sees the override coming before they click.
- **`MarkSurprised` is director-only post-roll, but the overlay's surprise-marking pre-roll is dispatched as part of `RollInitiative.surprised`** — that means a non-director who presses Roll can technically stamp surprise on creatures (because `RollInitiative` is anyone-dispatchable). Mitigation: the overlay's surprise-marking taps are gated client-side to `isActingAsDirector`; players see the chips read-only. The engine accepts whatever the dispatcher sends because the `RollInitiative.surprised` field is part of the canon-trust-friend-group model — if a player edits the network payload they get the same lobby-trust we extend everywhere else.
- **No `PickNextActor` cancel intent.** Once a participant is picked, the cascade fires `StartTurn` and the turn is in progress. Risk: a misclick locks in the wrong picker. Mitigation: the existing Undo path captures this — Undo of `PickNextActor` removes the participant from `actedThisRound` and clears `activeParticipantId`. The reducer's inverse path mirrors what `EndTurn` would do but without the side-flip.
- **PicAffordance "I'll go now" can race with a director's "Pick for them"** on the same participant. The reducer's idempotent guard (`participantId in actedThisRound` → reject) handles this; one wins, the other reflects as a no-op. Both UIs see the picked state.
- **Round 1 pick-window opens immediately after `RollInitiative`** — there's no separate "round 1 starts" event in this flow. `StartRound` still fires at encounter start (today) and sets `currentRound = 1` before `RollInitiative` resolves. Edge: if `RollInitiative` is dispatched before `StartRound` (which shouldn't happen but the schema permits), the overlay shows but no picker affordances activate because `currentRound === null`. Mitigation: `StartEncounter` automatically dispatches a derived `StartRound` — already today's behavior — so this is consistent.
- **TurnFlowTab's End-turn dispatch goes through `EndTurn` which now derives the next picking side.** A player's End-turn click no longer auto-starts the next participant; instead it parks the encounter in "between-turns" state, with the picker UI re-engaging. Risk: regression in the "table flow" where Pass-2a players expected ending their turn to "complete the turn and let the next happen automatically." That auto-progression was actually the bug zipper initiative is fixing — clarify in the PS / release note.

## Acceptance

Pass 2b1 is done when:

1. Starting a fresh encounter renders the Roll-Initiative overlay over the left-pane rails. The right pane (DetailPane) and InlineHeader remain interactive behind/around the overlay.
2. The active director can tap participant rows behind the overlay to toggle their `surprised` flag; chips render live; players see the chips read-only.
3. Anyone can press the Roll button. A client-side d10 reveals; resolution shows the chooser:
   - d10 ≥ 6 → "Players choose first" with hero/foe side buttons (defaulting to no auto-confirm — players make the call).
   - d10 ≤ 5 → "Director chooses first" with hero/foe side buttons (defaulting to a 1.5s auto-confirm on Director-first, cancellable).
   - One side fully surprised → skip the d10, auto-pick the un-surprised side, log the reason.
4. The chooser confirms; `RollInitiative` dispatches; the overlay dismisses; rails enter picking mode.
5. InlineHeader's trailing slot shows `HEROES PICK` or `DIRECTOR PICKS` between turns. When a turn is in progress, today's End-turn / `KORVA's turn` behavior takes over.
6. PartyRail: each PC owner sees a primary `I'LL GO NOW` button on their own unacted row when `currentPickingSide === 'heroes'`. Director sees `Pick for them` ghost links on other unacted hero rows (override). EncounterRail: director sees tappable unacted foe rows when `currentPickingSide === 'foes'`; players see foes as non-interactive.
7. Acted rows render dimmed at 55% opacity with an `ACTED` mono-uppercase tag until round end.
8. `PickNextActor` correctly threads the heroic-resource d3 through to the derived `StartTurn`; flat-gain classes don't send d3; d3-classes pre-roll on the client.
9. `EndTurn` derives `currentPickingSide` per the run-out rule: flip to the other side unless the other side is fully acted (then stay), or both are acted (then null). When both sides are out, `StartRound` is the next legal intent.
10. `StartRound` for rounds 2+ resets `currentPickingSide = firstSide` and clears `actedThisRound = []`. Surprise flags are auto-cleared by `EndRound` at the end of round 1.
11. `SetInitiative` intent is removed from `packages/shared/src/intents`, its reducer is removed from `packages/rules`, and the dispatch switch case is removed from `reducer.ts`. Existing tests migrate to the new intents.
12. Pre-2b1 snapshots load successfully: `firstSide` defaults to `null`, the run screen shows the Roll-Initiative overlay, and a fresh roll resumes play. Per-participant `surprised` defaults to `false`.
13. `pnpm test`, `pnpm typecheck`, `pnpm lint` clean repo-wide. New reducer test suites:
    - `roll-initiative.spec.ts` — auto-pick on full surprise; idempotent reject on second dispatch; surprised-id validation.
    - `pick-next-actor.spec.ts` — side validation; acted-this-round validation; trust validation; derived StartTurn cascade with and without d3.
    - `mark-surprised.spec.ts` — director-only; round-1-only; flag toggling.
    - `turn.spec.ts` — `applyEndTurn` side-flip derivation including run-out and round-end cases; `applyEndRound` clears surprise at end of round 1.
14. `docs/phases.md` has a new `2b.11 — Minion squads` row in the Phase 2b sub-epic table, with the sequencing note that it depends on this Pass 5 Layer 1 2b1 work.
15. Spot-check screenshots at iPad-portrait (810 × 1080) and iPhone-portrait (390 × 844) for: (a) the Roll-Initiative overlay with mid-roll surprise marking, (b) the picking-phase chrome between turns (heroes' pick), (c) the picking-phase chrome between turns (director's pick), (d) the picking-phase chrome during the run-out rule (one side exhausted).

## Out-of-scope confirmations

- Director-side initiative groups (canon § 8.6) — deferred to 2b.11 minion squads.
- Roll-side surprise effects (edge-on-rolls-against, triggered-action blocking) — Phase 2b umbrella, alongside the rest of `RollPower` edge/bane stacking.
- Pass 2b2 inventory (B3, B4, B5, B6, C1, C2, C3, D2, D3) — separate spec.
- Drag-reorder of initiative (former B1) — replaced by zipper initiative; not implemented.
- DB persistence for active context — unchanged from Pass 1.
- Encounter-builder UI changes — none; the encounter-builder still produces a flat foe list.

## PS — post-shipping fixes

After the plan lands and the dev server comes up, eye-testing will likely surface gaps that aren't visible at design time. Each is a small change layered on top of the Pass-2b1 plan. Capturing them here so the spec stays a complete record of what shipped.

### 1. RollInitiativeOverlay was not full-viewport and rendered black text on the dark theme

**Symptom.** The overlay was positioned `absolute inset-0` against a relatively-positioned left-pane wrapper — so it covered only the rails, not the InlineHeader or the right pane. And because the wrapping element was a native `<dialog>`, its user-agent style `color: CanvasText` (black) bled through to all descendants, making the heading and surprise checklist labels unreadable against the dark theme.

**Fix** ([`6f42fd9`](../../..)). Two changes in `RollInitiativeOverlay.tsx`:
- `absolute inset-0 z-10` → `fixed inset-0 z-50` so the overlay covers the whole viewport.
- `text-text` set explicitly on both the `<dialog>` root and the inner card so children inherit the dark-theme foreground.

### 2. Picking a participant immediately rendered their row as ACTED — hiding the pulse + End-turn button

**Symptom.** When a player clicked **I'll go now** (or director picked a foe), the row simultaneously rendered as the active turn (`isTurn=true` → pulse + ring) AND as already-acted (`isActed=true` → 55% opacity + ACTED badge). The dimming visually won, masking the pulse, and the InlineHeader's End-turn affordance was hard to associate with the dimmed row.

Root cause: `applyPickNextActor` was appending the picked participant to `actedThisRound` at pick time. Semantically `actedThisRound` should mean "their turn ended this round" — not "they're currently being picked."

**Fix** ([`8abeb2a`](../../..)). Moved the `actedThisRound` append out of `applyPickNextActor` and into `applyEndTurn`. Engine, WS mirror, and tests updated:
- `applyEndTurn` now appends `activeParticipantId` (the ending creature) to `actedThisRound` before computing `nextPickingSide`, with an idempotent guard (no double-add if already present).
- `useSessionSocket`'s `PickNextActor` reflect drops the acted append; its `EndTurn` reflect computes `nextActed` and threads it into the side-flip derivation.
- `reducer-pick-next-actor.spec.ts` asserts `actedThisRound` stays empty after PickNextActor (and `activeParticipantId === picked`).

`activeParticipantId !== null` is still the guard preventing double-pick mid-turn, so dropping the early acted-add doesn't change correctness — only the semantic + visual state.

### 3. Targeting redesigned — per-row reticle button, auto-target opposite side, ordered target list

**Symptom.** Pass 2a's role-asymmetric tap-to-target gesture (player taps row → targets; director uses AbilityCard dropdown) didn't read as deliberate, only worked for one role, and had no forward-compat shape for multi-target abilities.

**Fix** ([`68d2557`](../../..)). Scope expansion beyond the original Pass 2b1 design:
- `ParticipantRow.target` prop (replaces `isTarget`): `{ index: number | null; onToggle: () => void }`. Idle = small gray crosshair SVG that hovers to foe-tone. Targeted = crosshair turns foe-tone, pulses red via a new `@keyframes ironyard-target-pulse` (with `prefers-reduced-motion` fallback), and shows a 1-based **target number badge** for forward-compat with multi-target.
- `DirectorCombat` state migrates from `targetParticipantId: string | null` to `targetParticipantIds: string[]` (ordered). Single-target abilities still consume `[0]` (DetailPane / AbilityCard / TargetBanner / FullSheetTab keep their existing `targetParticipantId` prop, fed from `targetParticipantIds[0]`). Future multi-target abilities consume `targets.slice(0, ability.maxTargets)`.
- New `useEffect` watches `activeParticipantId`: PC active → first alive foe becomes `[Target 1]`; foe active → first alive PC. Manual reticle toggles override until the next turn change.
- Row click now focuses the DetailPane for both roles. The Pass-2a player-only tap-to-target gesture is removed. Same UX for director and player.
- Memory entry added at `feedback_targeting_explicit_reticle_with_indices.md` so future passes don't reintroduce tap-to-target.

### 4. Hooks-after-guard-returns broke DirectorCombat on the first render

**Symptom.** Browser blew up with `Rendered more hooks than during the previous render` and "React has detected a change in the order of Hooks called by DirectorCombat." Same Rules-of-Hooks pattern as Pass 1 PS #6.

Root cause: Tasks 18+19 had introduced two `useCallback` handlers (`handlePickNextActor`, `handleRollInitiative`) **below** the existing campaign-loading guard returns. The bug was latent until PS #3 above added a new `useEffect` (above the guards). On the first render the guards exited early — fewer hooks ran. On the next render the guards passed — the trailing `useCallback`s fired, and React's hook-count check tripped.

**Fix** ([`f9c99db`](../../..)). Demoted both handlers from `useCallback` to plain inline functions, matching the pattern of the other handlers (`handleStartRound`, `handleEndTurn`, `handleEndEncounter`) that already live below the guards. Neither is referenced by a downstream `useEffect`, so referential stability isn't needed.

**Lesson.** Pass 1 PS #6 already documented this pattern; reinforce when adding any hook to DirectorCombat that every hook line must be lower than every guard `return` line. Cheap check before committing: `grep -n "use[A-Z]\\|return (" DirectorCombat.tsx` — confirm every hook line < every return line.

### Acceptance addendum

In addition to the 15 Pass-2b1 acceptance criteria above:

16. The Roll-Initiative overlay covers the full viewport (including the InlineHeader) and renders with the dark-theme foreground color.
17. Picking a participant via **I'll go now** or director foe-tap renders the row in the active-turn visual state (pulse + accent ring) with no `ACTED` dim. The InlineHeader's End-turn button is visible to the active player.
18. Each row in PartyRail and EncounterRail has a reticle button. Clicking it toggles inclusion in `targetParticipantIds`; targeted rows show a red-pulsing reticle with a 1-based number badge. `StartTurn` auto-seeds the first alive opposite-side participant as Target 1.

### Maintenance note

Future post-shipping fixes to Pass 2b1 layer the same way: append a numbered entry to this PS section with a one-line symptom, a one-paragraph fix, and the relevant commit SHA. Once a follow-up entry has shipped *and* been verified in real use, leave it in place — the doc is the historical record, not a TODO list.
