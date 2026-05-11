# Engine follow-ups — deferred slices

Known gaps in the engine / data pipeline that we've consciously deferred. Each entry is a future slice candidate — large enough to deserve its own spec when it lands, small enough to ship alone.

Order is roughly by impact on the Phase 1 "run a real session" acceptance bar.

---

## Potency gating on auto-applied conditions

**Status:** 🟡 deferred — biggest correctness gap of the condition-extraction slice (`docs/superpowers/specs/2026-05-10-phase-1-ability-condition-extraction-design.md`).

**Problem.** Many monster ability tier outcomes are gated on a potency test, written as a characteristic-comparison prefix: `"A < 2 weakened (save ends)"`, `"M < 0 bleeding (save ends)"`, `"R < 6 dazed (EoT)"`. Today the parser extracts the condition and the engine auto-applies it **regardless of whether the target's characteristic actually fails the test.** The prefix is preserved in the `ConditionApplicationOutcome.note` field so the director can see it, but no gate fires.

The dominant phrasing in current data: **most** condition-bearing tier outcomes are potency-gated. Auto-applying without checking the gate makes monsters significantly stronger than they should be — every potency-gated condition lands on every hit.

**What this slice would do:**

- Parser: structurally extract the potency test from `note` into a typed field on `ConditionApplicationOutcome`, e.g. `gate: { characteristic: 'agility', op: '<', threshold: 2 }`. Permissive regex per the project's parsing rule.
- Schema: extend `ConditionApplicationDispatch` with the same optional `gate`.
- Engine: in `RollPower`'s derivation, before emitting `SetCondition` for a gated condition, evaluate the gate against the target's `Participant.characteristics[gate.characteristic]`. Emit only when the gate fails (per Draw Steel "potency test"). When the gate passes, log "potency_passed: target resisted Weakened" instead.
- UI: AbilityCard's amber chip should show the gate inline (e.g. `Weakened A<2 ⓘ`) so the director knows it's conditional.
- Tests: parser per-gate-shape; reducer for gate-fail emits SetCondition, gate-pass does not, missing characteristic logs a sensible error.

**Out of scope:**
- Mid-clause potency tests ("if reduced below 0 stamina, …") — rare; stays in raw effect text.
- Multi-condition gates with different tests in one clause (`A < 2 slowed, M < 2 weakened (save ends)`) — current parser likely catches both with the same prefix; would need clause-splitting on `,` inside a potency clause.

**Acceptance:**
- Pin the current `monsters.json`. Run a representative subset of monster abilities through a fixture-driven reducer test. A target with characteristics tuned to *fail* every gate sees every condition applied; a target tuned to *pass* every gate sees zero conditions applied.

---

## Forced movement (push / pull / slide)

**Status:** 🟡 deferred — second-biggest gap; no engine surface exists.

**Problem.** Tier outcomes commonly include forced-movement riders: `"Push 3"`, `"slide 5"`, `"pull 2"`. These appear in **~21.6% of tier outcomes** in the current data pin (push 1,032, pull 356, slide 454 raw mentions across the bestiary). Today these stay in the raw `effect` text; the director applies movement manually. There is no `Move` (or `ForceMove`) intent in `packages/shared/src/intents/`.

**What this slice would do:**

- Parser: extract `"<verb> N"` triples from tier residue. Verbs: `push | pull | slide | vertical push | shift` (canon "shift" is voluntary; only directorial shift might land here). Capture the squares count and the verb.
- Schema: new `ForcedMovementOutcome` on `TierOutcome`, mirroring the condition shape: `{ kind: 'push' | 'pull' | 'slide' | 'vertical-push', squares: number, scope: 'target' | 'other' }`. Wire-side `ForcedMovementDispatch` for the RollPower ladder.
- Engine: a new `Move` intent or a more specialized `ForceMove { targetId, vector }` — the exact shape needs design work. Draw Steel positions are squares; we don't have a grid yet (out of scope per CLAUDE.md). Two paths:
  - **A.** Engine tracks abstract distance only — `ForceMove` just records the event in the log with no positional state. Equivalent to "the engine acknowledges the push happened; the table resolves the grid impact." Simplest. Matches the "we track movement as numeric distance" note in `docs/phases.md` out-of-scope.
  - **B.** Engine tracks coordinate state — requires positions on `Participant`, a grid system, line-of-sight infra. **Out of scope for Phase 1–4** per CLAUDE.md.
- UI: AbilityCard renders a small movement chip per tier (e.g. `push 3`); auto-roll emits the `ForceMove` event; director sees a toast and physically moves the figurine / token at the table.
- Tests: parser shape coverage, reducer emits one ForceMove per target per landing tier.

**Out of scope:**
- Grid-based movement, line-of-sight, area-of-effect targeting templates — Phase 4+ stretch per CLAUDE.md.
- Forced-movement immunity (canon §3.5.4 Grabbed targets can't be force-moved by anyone other than the grabber; size-based caps) — flagged in the slice 6 spec as deferred; lands with this slice or a follow-up.
- Difficult terrain, perilous terrain — separate slice.

**Acceptance:**
- The director can dispatch `ForceMove` and see the event in the intent log with attribution + Undo. The intent log makes the chain auditable ("Sarah → Goblin 3 was pushed 3"). No positional state on participants; the table physically moves the figurine.

---

## Other known gaps (lighter weight, parked here)

These are smaller than a slice but worth not losing:

- **`SetStamina` / `GainResource` / `GainMalice` permission gating** — today any session member can dispatch; canon-correct is director-anyone, player-self-only. Needs `Participant.ownerUserId` and a claim mechanism. Same blocker mentioned in the slice 7 and slice-11-followup summaries.
- **Per-turn 1d3 auto-gain for Clarity / Piety / Ferocity / Insight / Drama** — slice 7 spec'd this; engine doesn't fire because the dispatcher needs to pre-roll the d3.
- **Ability-cost gating** — "this ability costs N Focus" isn't enforced; the ability just rolls. Needs ability data to ship cost shape (today `cost` is free-form text like `"2 Malice"` / `"Signature Ability"`).
- **EndEncounter UI affordance from the lobby** — engine intent exists; the combat run screen has a button; the lobby doesn't. Tiny.
- **Web vitest setup** — UI has no regression-test infra yet.
- **Screenshot tooling** — no Playwright/Puppeteer; UI verification still manual.
- **DO override of `RollPower.source`** — fixed in the engine+api cleanup slice. Listed here only to confirm it's done; not deferred.

---

## Conventions

- Each entry: problem statement, what the slice would do, out-of-scope, acceptance sketch.
- When a follow-up becomes the next slice, write a spec at `docs/superpowers/specs/<date>-<slug>-design.md` and remove the entry from this file (or mark it ✅ landed with a pointer to the commit).
- Keep entries short. This is a backlog, not a design doc.
