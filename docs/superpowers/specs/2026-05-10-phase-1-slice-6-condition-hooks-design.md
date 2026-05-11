---
name: Phase 1 slice 6 — condition hooks + action gating
description: Activates the data-only conditions shipped in slice 5. Bleeding deals 1d6+level on action / triggered action / Might-or-Agility roll; Dazed/Slowed/Grabbed/Restrained gate the action economy; Frightened/Taunted/Prone/Weakened contribute edges/banes on RollPower; EndTurn auto-fires RollResistance for each save_ends condition.
type: spec
---

# Phase 1 slice 6 — condition hooks + action gating

## Goal

Wire the 9-condition data model from slice 5 into the engine's mutation paths so the reducer **actually does something** when a participant is Bleeding, Dazed, Frightened, etc. After this slice, dispatching a `RollPower` from a Frightened attacker against the imposing source picks up a bane automatically; ending the turn of a save_ends-afflicted creature dispatches `RollResistance` automatically; a Dazed creature trying to use a second action gets `action_gated` back.

Every behavior in this slice is backed by a ✅-verified rules-canon entry (`conditions.the-9-conditions`, `conditions.engine-implications`, `action-economy.engine-turn-state-machine`, `action-economy.condition-interactions-with-action-economy`, `conditions.saving-throws`). Anything ambiguous goes to `rule-questions.md` and stays manual-override-only.

## What's in / out

**In:**
- **Bleeding (canon §3.5.1):** when the actor uses a main action *or* a triggered action *or* makes a power-roll/test using **Might** or **Agility**, the engine emits a derived `ApplyDamage` of `1d6 + actor.level` once per triggering action. Damage is `untyped` and is `causedBy = parent.id` so it lives in the parent's undo chain. The d6 enters via the parent payload's optional `bleedingD6?: 1..6` field; absent ⇒ engine logs `manual_override_required` and skips the auto-damage (per the canon-gate idiom).
- **Dazed (canon §3.5.2):** on any second action-type intent in a turn, return `errors: [{code: 'action_gated', message: ...}]`. The turn-state for Dazed is tracked per-turn as a single `daze_action_used` flag inside the encounter (`StartTurn` resets, `EndTurn` clears; explicit `RestartDazedTurn` is out of scope — `Undo` recovers).
- **Slowed (canon §3.5.7):** `Move { kind: 'shift' }` intents from a Slowed creature are gated with `action_gated`. (No `Move` intent exists yet — slice 6 surfaces the gate as a helper function `gateShift(state, actorId)` used by future slices and exercised in tests via a tiny stub `Move` intent path we leave dormant. **Deferred** to the next slice that adds `Move`; for now the helper is exported, tested, but not yet wired to a real intent.)
- **Frightened (canon §3.5.3):** when the actor rolls a `RollPower` against the source of their Frightened condition, the reducer adds **+1 bane** to that roll's `banes` count before the standard §1.4 cancellation. (Edge against the Frightened creature when the source rolls against them is also wired.) Cannot-move-closer is a position/grid concern and is **deferred to slice 7+** (no grid yet).
- **Taunted (canon §3.5.8):** when a Taunted creature uses a `RollPower` whose `targetIds` does **not** include the taunter, contribute **+2 banes** from one source. The §1.4 cancellation handles cap correctly.
- **Grabbed (canon §3.5.4):** `RollPower` whose `targetIds` does not include the grabber adds +1 bane. `Move { kind: 'speed'|'shift' }` from a Grabbed creature is gated via the same helper as Slowed (deferred wiring; helper exported and tested).
- **Prone (canon §3.5.5):** strike-style `RollPower` from a Prone creature gets +1 bane; ability rolls against a Prone creature gain +1 edge (slice-6 simplification: every `RollPower` is treated as strike-style for the bane contribution since the ability category isn't yet part of the payload — flagged in summary).
- **Restrained (canon §3.5.6):** `RollPower` from a Restrained creature gets +1 bane; ability rolls against a Restrained creature gain +1 edge.
- **Weakened (canon §3.5.9):** any `RollPower` from a Weakened creature gets +1 bane.
- **Auto-`RollResistance` on `EndTurn` (canon §3.3, Q9):** at the end of a creature's turn, the engine collects every `save_ends` condition on that creature (sorted by `appliedAtSeq`) and emits one derived `RollResistance` per condition. d10 values come from `EndTurn` payload's optional `saveRolls: number[]` field (positional with the sorted conditions). Missing or wrong-length ⇒ engine logs `manual_override_required` per save and skips the auto-fire (canon-gate idiom).
- **`onCheckTriggerEnd` hook (canon §3.5.4, §3.5.6):** export a pure helper `removeTriggerEndedConditions(target, event)` that returns the new `conditions[]` array with Grabbed dropped on `teleport`/`force_move_apart` events and Restrained dropped on `teleport`. Helper is exported and unit-tested. **Not yet wired to real intents** — there is no teleport/forced-move intent in Phase 1; helper is in place for slice 7 to call.

**Out (deferred to slice 7 or later):**
- **Surprised round-1 rule (canon §3.5.10 / §4.9 row).** Surprised is a §4 status, not a condition in the §3.5 list, and the engine doesn't yet track "round 1 vs round 2." Flagged for slice 7 once the initiative model exposes round number to condition hooks cleanly.
- **Strained.** Talent-only class status, deferred to slice 7 (resources slice).
- **Cannot-move-closer (Frightened).** Position/grid concern.
- **Knockback maneuver (Grabbed).** No `Maneuver` intent yet.
- **Stand Up maneuver gating (Restrained).** No `Stand Up` intent yet.
- **Forced-movement immunity (Grabbed except grabber, Restrained).** No force-move intent yet.
- **Ability-category-aware Prone bane (strike only).** Slice 6 treats every `RollPower` as strike-style; the ability category will be in the payload in slice 7 when the ability registry lands.
- **`Move` intent.** Helper `gateShift` is exported for slice-7 use; no real `Move` intent exists yet.
- Anything not ✅-verified in `rules-canon.md`. Logged as `manual_override_required` in the engine log.

## Hook architecture

Hooks are pure functions that take `(state, intent, ...args)` and return zero-or-more **derived intents** plus optional **payload mutations** (additional edges/banes) applied to the parent intent before its handler resolves. Two flavors:

### Flavor 1 — derived-intent emitters (post-action effects)

Used by Bleeding (post-action damage) and the auto-save fire on `EndTurn`. Signature:

```ts
// packages/rules/src/condition-hooks.ts
export function bleedingDamageHook(
  state: SessionState,
  actor: Participant,
  trigger: { kind: 'main_action' | 'triggered_action' | 'might_or_agility_roll' },
  bleedingD6: number | undefined,
  parentIntentId: string,
): { derived: DerivedIntent[]; log: LogEntry[] };
```

Called from inside `applyRollPower` (and any future main-action handler) after the parent's own state mutation is computed. The returned `derived` list is concatenated onto the parent's `derived` so the wire shape stays one intent → many derived. `causedBy` is set to the parent's id.

### Flavor 2 — edge/bane contributors (pre-roll modifiers)

Used by Frightened, Taunted, Grabbed, Prone, Restrained, Weakened. Signature:

```ts
// packages/rules/src/condition-hooks.ts
export function computeRollContributions(
  attacker: Participant,
  defenders: Participant[],
): { extraEdges: number; extraBanes: number; reasons: string[] };
```

Called inside `applyRollPower` *before* it constructs the `resolvePowerRoll` args. The contributor function reads:

- Conditions on the attacker (Weakened, Restrained, Prone, Grabbed-not-against-grabber, Frightened-against-source, Taunted-against-non-taunter)
- For each defender: conditions whose source is the attacker (Frightened-on-defender means attacker gets edge), and conditions on the defender (Restrained-on-defender means edge to attacker)

Then it adds the totals to the payload's `edges` / `banes` *before* `resolvePowerRoll` cancels them per §1.4. The §1.4 cancellation then naturally caps at ±2.

`reasons[]` is appended to the log so the table can see *why* the roll picked up a bane.

### Flavor 3 — action gates (pre-mutation rejection)

Used by Dazed (single-action turn). Signature:

```ts
// packages/rules/src/condition-hooks.ts
export type ActionGate =
  | { ok: true }
  | { ok: false; code: 'action_gated'; reason: string };

export function gateActionForDazed(
  encounter: ActiveEncounter,
  actorId: string,
  intentKind: 'main_action' | 'maneuver' | 'move',
): ActionGate;
```

Called from `applyRollPower` (which today represents the only main-action surface) at the very top of the handler, before payload validation. On `{ ok: false }`, the handler returns the standard rejection shape with `errors: [{ code: 'action_gated', ... }]`.

A similar `gateShift(...)` helper covers Slowed/Grabbed move-shift gating and is exported but not yet called from a real intent in slice 6.

### Per-turn daze tracker

To enforce "one of {main, maneuver, move} per Dazed turn," we add a per-encounter `turnState: Record<participantId, { dazeActionUsed: boolean }>` map to `ActiveEncounter`. `StartTurn` resets the entry for the starting participant; `applyRollPower` flips `dazeActionUsed = true` after successful resolution. `EndTurn` clears the entry for the ending participant.

A more elaborate `TurnState` (mainSpent, maneuversSpent, etc. from canon §4.10) is the right long-term home, but slice 6 only needs the single Dazed flag. The map is shaped so slice 7's full turn-state can replace `{ dazeActionUsed }` with the full record without renaming the field.

## Per-condition behavior table

| Condition | Hook flavor | Trigger | Effect | Canon slug |
|-----------|-------------|---------|--------|------------|
| Bleeding | derived-intent | `RollPower` (any) | emits `ApplyDamage 1d6+level untyped` once | `conditions.the-9-conditions` §3.5.1 |
| Bleeding (Might/Agility) | derived-intent | `RollPower` with `characteristic ∈ {might, agility}` | same; fires from the M/A-roll branch instead of the main-action branch | §3.5.1 |
| Dazed | action gate | second `RollPower` after one already used this turn | `action_gated` rejection | §3.5.2 / §4.9 |
| Frightened | edge/bane | `RollPower` targeting the Frightened source | +1 bane on attacker | §3.5.3 |
| Frightened | edge/bane | `RollPower` from the source against the Frightened creature | +1 edge on attacker | §3.5.3 |
| Grabbed | edge/bane | `RollPower` from grabbed creature against non-grabber | +1 bane | §3.5.4 |
| Prone | edge/bane | `RollPower` from Prone creature | +1 bane (strike-style simplification) | §3.5.5 |
| Prone | edge/bane | melee `RollPower` against Prone creature | +1 edge (simplification: every `RollPower` is treated as melee-eligible) | §3.5.5 |
| Restrained | edge/bane | `RollPower` from Restrained creature | +1 bane | §3.5.6 |
| Restrained | edge/bane | `RollPower` against Restrained creature | +1 edge | §3.5.6 |
| Slowed | gate (deferred wiring) | `Move { kind: 'shift' }` | helper exported, not yet called | §3.5.7 |
| Taunted | edge/bane (2) | `RollPower` not targeting taunter | +2 banes from one source (§1.4 still cancels) | §3.5.8 |
| Weakened | edge/bane | any `RollPower` from Weakened creature | +1 bane | §3.5.9 |
| save_ends conditions | derived-intent | `EndTurn` of afflicted creature | one `RollResistance` per save_ends, sorted by `appliedAtSeq` | `conditions.saving-throws` §3.3 |
| Grabbed | onCheckTriggerEnd | `teleport` or `force_move_apart` event | helper removes the instance; not yet called | §3.5.4 |
| Restrained | onCheckTriggerEnd | `teleport` event | helper removes the instance; not yet called | §3.5.6 |

## Module layout (additions)

```
packages/rules/src/
├── condition-hooks.ts            # all pure hook helpers (NEW)
└── intents/
    ├── roll-power.ts             # modified — pre-roll contributors, post-roll Bleeding, daze gate
    └── turn.ts                   # modified — StartTurn resets daze flag; EndTurn auto-fires saves
```

```
packages/rules/tests/
├── reducer-condition-hooks.spec.ts   # ~25 new tests across all hook flavors (NEW)
└── condition-hooks.spec.ts           # ~10 unit tests for the pure helpers (NEW)
```

```
packages/shared/src/intents/
├── roll-power.ts                 # modified — add bleedingD6: number 1..6 optional field
└── turn.ts                       # modified — add saveRolls: number[] optional on EndTurn
```

```
packages/shared/src/participant.ts # modified — add level: number 0..20 with default 1
```

No new exports from `@ironyard/shared/intents/index.ts` are required (existing payload schemas just get an optional field).

## Wire format

No envelope changes. Existing `RollPower` and `EndTurn` payloads gain optional fields:

- `RollPower.bleedingD6?: number` (int, 1..6) — the d6 the dispatcher pre-rolls *iff* the attacker has Bleeding. Absent ⇒ engine skips auto-Bleeding damage and logs `manual_override_required`.
- `EndTurn.saveRolls?: number[]` (each int 1..10) — one entry per save_ends condition on the ending creature, in `appliedAtSeq` order. Missing or wrong-length ⇒ per-save manual override.

Old dispatchers that don't set these still work: their conditions go to manual override, and the table sees a clear log entry pointing out what to roll. This preserves backward compat with slice-5 fixtures and avoids forcing every test in the repo to provide a `bleedingD6`.

## Permissions

No permission changes. The hook helpers are invoked inside existing handlers, which already enforce member/director gating at the DO layer.

## Canon gating

Every auto-application branch in this slice wraps in `requireCanon('conditions.the-9-conditions')` or the relevant slug. The action gate uses `requireCanon('action-economy.condition-interactions-with-action-economy')`. Auto-save fire uses `requireCanon('conditions.saving-throws')`. Falling back through `requireCanon` to manual-override is the slice's contract for the unverified-edge cases (none today, but future).

## Testing

### `packages/rules/tests/condition-hooks.spec.ts` — unit tests for pure helpers (~10 tests)

- `computeRollContributions`:
  - Weakened attacker → +1 bane
  - Restrained attacker → +1 bane
  - Restrained defender → +1 edge to attacker
  - Frightened-on-attacker, source = defender → +1 bane
  - Frightened-on-defender, source = attacker → +1 edge
  - Taunted attacker, targets do not include taunter → +2 banes
  - Taunted attacker, targets include taunter → no bane
  - Grabbed attacker, target is grabber → no bane
  - Grabbed attacker, target is not grabber → +1 bane
  - Prone attacker → +1 bane (strike-style simplification)
- `gateActionForDazed`:
  - First action of the turn → `{ok:true}`
  - Second action of the turn → `{ok:false, code:'action_gated'}`
  - Non-Dazed actor → always ok
- `removeTriggerEndedConditions`:
  - Grabbed dropped on `teleport`
  - Grabbed dropped on `force_move_apart`
  - Restrained dropped on `teleport`
  - Restrained NOT dropped on `force_move_apart` (per canon §3.5.6)
  - Other conditions untouched

### `packages/rules/tests/reducer-condition-hooks.spec.ts` — integration through the reducer (~20 tests)

- Bleeding emits a derived `ApplyDamage` when `bleedingD6` is provided
- Bleeding-emitted damage equals `bleedingD6 + level`
- Bleeding skipped + log when `bleedingD6` is missing
- Bleeding triggers on Might-or-Agility roll regardless of action category (since slice 6 treats `RollPower` as the action surface)
- Bleeding does NOT fire when attacker has no Bleeding
- Dazed allows first action, rejects second with `action_gated`
- Dazed gate uses the per-turn flag that resets on `StartTurn`
- Frightened-against-source picks up a bane in the roll outcome
- Frightened-from-source picks up an edge
- Taunted contributes 2 banes when targets don't include taunter
- Taunted contributes 0 banes when target list includes taunter
- Grabbed contributes 1 bane when target ≠ grabber
- Grabbed contributes 0 banes when target == grabber
- Restrained: attacker bane and defender edge both fire
- Weakened: attacker bane fires alongside Restrained
- Multiple conditions stack additively before §1.4 cancellation
- §1.4 caps at +2/−2 net even when six banes are added
- `EndTurn` auto-emits `RollResistance` for each save_ends condition in `appliedAtSeq` order
- `EndTurn` skips auto-save when `saveRolls` is missing and logs manual_override_required
- `EndTurn` with the right number of `saveRolls` removes the conditions that pass and keeps the ones that fail
- `EndTurn` does NOT emit `RollResistance` for non-save_ends conditions

Test count delta target: 125 → ~155.

## Constraints for the agent

- **Touch only `packages/rules` and `packages/shared`.** No app, no DO, no data pipeline.
- All hook helpers are pure. No `Date.now()`, no `Math.random()`. Dice enter via payload optionals.
- The pure-reducer guarantee remains: same intent + same state ⇒ same result. The optional dice fields are part of the payload.
- TypeScript strict; no `any` without a justified `// reason:` comment.
- Zod is the source of truth for payload changes; the new optional fields go on the existing schemas with `.optional()`.

## Expected output (return summary)

1. Files added / modified.
2. Test count delta (current 125 → ?).
3. Verification gates output (`pnpm -F @ironyard/rules test`, `pnpm typecheck`, `pnpm lint`).
4. Any deviations from this spec, with reasoning.
5. Any new `rule-questions.md` entries (if a slice-6 implementation forced an interpretive call).
