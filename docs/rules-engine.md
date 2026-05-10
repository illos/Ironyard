# Rules engine (`packages/rules`)

The rules engine is the heart of the app. It's a pure, stateless TypeScript module that takes the current session state and an intent and returns a new state plus any derived intents. Same code runs in the Durable Object (authoritative) and in the client (optimistic).

This is the genuinely hard part of the project. Plumbing (Cloudflare, React, DOs) is well-trodden territory. Modeling Draw Steel's mechanics correctly enough that the table doesn't constantly need to override the engine is where most of the engineering goes.

## Public surface

```ts
// packages/rules/src/index.ts

export function applyIntent(
  state: SessionState,
  intent: Intent,
): IntentResult;

export function inverse(
  intent: Intent,
  stateBefore: SessionState,
): Intent;

export function canDispatch(
  intent: Intent,
  actor: Actor,
  state: SessionState,
): { ok: true } | { ok: false; reason: string };

export type SessionState = { ... };
export type Intent = { ... };
export type IntentResult = { state: SessionState; derived: Intent[]; log: LogEntry[] };
```

Nothing else is exported. The rules engine never imports from `apps/web`, `apps/api`, or any side-effectful module. It runs identically in node, the browser, and a Worker.

## Canon-gated automation

The reducer is allowed to apply a rule automatically only when [`rules-canon.md`](rules-canon.md) marks that rule ✅ verified. This is enforced mechanically.

- A build script (`scripts/gen-canon-status.ts`) parses `rules-canon.md`, extracts each section's status (✅ / 🚧 / ⛔), and emits `src/canon-status.generated.ts` — a typed registry keyed by stable slug.
- The reducer wraps every auto-apply branch in `requireCanon('<slug>')`. If the slug's status is not `'verified'`, the reducer skips the branch, emits a `manual_override_required` log entry, and surfaces the question to the UI.
- CI runs `pnpm canon:gen` and fails on `git diff` against `canon-status.generated.ts`. The doc and the registry can never silently disagree.
- `pnpm canon:report` prints the current status of every rule slug — the operator-facing view of "where are we on rules verification."

Two consequences worth being explicit about:

1. **Editing a ✅ rule drops it back to 🚧.** The next CI run regenerates the registry; engine paths that depend on that rule fall back to manual override until the user re-verifies. Loud, intentional, recoverable.
2. **Reordering sections in the doc never breaks engine code.** Slugs are derived from heading text, not section numbers.

Open mechanical details (slug derivation, declaring expected slugs, separating "canon-verified" from "engine-implemented") are tracked in the pre-Phase-0 decisions doc, item 14.

## What it models

### Power rolls (resolution)

Draw Steel's resolution is `2d10 + characteristic`, plus any bonuses or penalties (rare; mostly skills), with edges and banes layered on top. A single net edge is +2; a single net bane is −2. A *double* edge or bane (two net) is a tier shift, not a ±4 modifier. Natural 19/20 always lands at tier 3. Some effects grant automatic tier outcomes that supersede everything else.

The full mechanic — cancellation rules, threshold table, exact resolution order — lives in [`rules-canon.md` § 1](rules-canon.md#1-power-rolls-resolution). The engine implements that ordering verbatim.

The engine reads the d10 values from the intent's `rolls` field — it does **not** sample randomness — then walks the resolution order, looks up the tier on the ability's t1/t2/t3 ladder, and emits derived intents. Characteristic and bonus lookups happen against `state` inside the reducer; only the random component travels in the payload. See [`intent-protocol.md` → Rolls](intent-protocol.md#rolls).

### Critical hits

A natural 19/20 on a Strike or ability power roll for an ability that **uses an action** (main action category) is a **critical hit**: tier 3 plus the actor gets to take another main action immediately. Detail in [`rules-canon.md` § 1.9](rules-canon.md#19-critical-hits-) and [Q5](rule-questions.md#q5-is-a-natural-1920-always-a-critical-hit-or-only-on-certain-rolls-).

Implementation: after dispatching the tier's effects, the reducer detects nat-19/20 + ability category = Main action and emits a derived `GrantExtraAction { actorId, source, kind: 'crit-hit' }`. The actor's controller chooses whether to use it; if used, it's a normal main-action dispatch flagged as crit-extra in the log. The crit-hit benefit is independent of the final tier (so auto-tier-1 + nat-20 still grants the extra action per canon § 1.9.4) and survives voluntary downgrade (canon § 1.7).

A natural 19/20 on a **test** is a different mechanic — **critical success** — handled in `RollTest` resolution per canon § 7.2. The engine treats these as separate dispatch paths so the log uses the right terminology.

### Turn state machine

The reducer maintains a per-creature, per-turn state object that gates which action types are available — main, maneuver(s), move action(s), triggered action, free triggered action, free maneuvers — including conversion rules (the main action may be converted into a second maneuver OR a second move action). Full state and gating in [`rules-canon.md` § 4.10](rules-canon.md#410-engine-turn-state-machine).

Conditions plug into the gates: Dazed restricts the turn to one of {main, maneuver, move}; Slowed forbids shift; Grabbed forbids Knockback; Restrained forbids Stand Up; Surprised forbids triggered + free triggered actions until end of round 1.

At round end the engine clears `triggeredActionUsedThisRound` for every participant and resets per-turn slot trackers. Surprise auto-clears at end of round 1.

Simultaneous triggered actions on the same trigger are sequenced: PCs decide internal order, Director decides internal order, cross-side ordering deferred per [Q10](rule-questions.md#q10-cross-side-ordering-of-simultaneous-triggered-actions-) (engine fallback: Director sequences the queues at the table).

### Damage application

Damage runs through a fixed pipeline: base → external modifiers (halving, etc.) → weakness → immunity → temp stamina drain → stamina → state transitions (winded/dying/dead). The full ordering is in [`rules-canon.md` § 2.12](rules-canon.md#212-engine-resolution-order); the reducer implements it verbatim. Damage types are a closed 10-value enum (the 9 typed + `untyped` sentinel) defined by canon § 2.1.

Multi-type damage from a single source (e.g. an ability deals "8 fire + 4 cold") runs the modifier pipeline **independently per typed clause** and sums the final amounts before draining temp stamina — see [Q6](rule-questions.md#q6-multi-type-damage-from-a-single-source-).

The state machine for stamina is non-trivial: heroes can go negative (dying at ≤ 0, dead at ≤ -windedValue) and apply auto-Bleeding when dying. Director-controlled creatures die at stamina ≤ 0. Both base max and effective max are tracked separately so max-reduction effects can be applied and removed without losing the base.

### Conditions

There are exactly **9 conditions** in Draw Steel: Bleeding, Dazed, Frightened, Grabbed, Prone, Restrained, Slowed, Taunted, Weakened. Each is binary per creature (see [Q8](rule-questions.md#q8-condition-stacking-)): multiple impositions track per-source durations but don't compound the effect. Frightened and Taunted have a special "new replaces old from a different source" rule per canon § 3.4.

A condition instance has:

```ts
type ConditionInstance = {
  type: 'Bleeding' | 'Dazed' | 'Frightened' | 'Grabbed' | 'Prone'
      | 'Restrained' | 'Slowed' | 'Taunted' | 'Weakened';
  source: { kind: 'creature' | 'effect'; id: string };
  duration:
    | { kind: 'EoT' }
    | { kind: 'save_ends' }
    | { kind: 'until_start_next_turn'; ownerId: string }
    | { kind: 'end_of_encounter' }
    | { kind: 'trigger'; ... };
  appliedAtSeq: number;
  removable: boolean;  // false only for dying-induced Bleeding
};
```

Duration definitions, save mechanic, and the per-condition mechanics live in [`rules-canon.md` § 3](rules-canon.md#3-conditions-).

Condition handlers fire at engine-defined hook points. A handler is declared per condition type:

```ts
// packages/rules/src/conditions/bleeding.ts
export const Bleeding: ConditionDef = {
  name: 'Bleeding',
  hooks: {
    onMainAction: (subject, ctx) => bleedingDamage(subject, ctx),
    onTriggeredAction: (subject, ctx) => bleedingDamage(subject, ctx),
    onAbilityRoll: (subject, ctx, { characteristic }) => {
      if (characteristic === 'Might' || characteristic === 'Agility') {
        bleedingDamage(subject, ctx);
      }
    },
    onTest: (subject, ctx, { characteristic }) => {
      if (characteristic === 'Might' || characteristic === 'Agility') {
        bleedingDamage(subject, ctx);
      }
    },
  },
};

function bleedingDamage(subject: Participant, ctx: HandlerCtx) {
  // 1d6 + level damage, once per action, dispatched after the action resolves
  ctx.dispatch({
    type: 'ApplyDamage',
    payload: {
      targetId: subject.id,
      amount: ctx.roll('1d6') + subject.level,
      damageType: 'untyped',
      sourceIntentId: ctx.currentIntentId,
    },
  });
}
```

Note that Bleeding **does not** fire on `onTurnStart` — the rulebook's trigger is "use a main action / triggered action / Might-or-Agility power roll." The previous draft of this doc had the wrong trigger; canon § 3.5.1 has the correct rule.

The hook taxonomy that condition handlers can subscribe to:

- `onTurnStart(subject)` / `onTurnEnd(subject)`
- `onMainAction(subject)` / `onTriggeredAction(subject)`
- `onAbilityRoll(subject, { characteristic })` / `onTest(subject, { characteristic })`
- `onRollResolution(subject, intent)` — for conditions that contribute edges/banes (Frightened, Grabbed, Prone, Restrained, Taunted, Weakened)
- `onMove(subject, { kind: 'speed' | 'shift' | 'crawl' | 'forced' })` — Slowed, Prone, Grabbed, Restrained
- `onCheckTriggerEnd(subject, event)` — Grabbed (teleport, force-move-apart), Restrained (teleport)

Edge/bane contributions from conditions are gathered at `onRollResolution` time, summed, then run through the § 1.4 cancellation rules. A single condition (Taunted) can contribute **two** banes from one source (the "double bane"); after cancellation, the engine caps net at 2 per § 1.4.

**Strained is not a condition.** The Talent's "Strained" state, derived from `clarity < 0`, is **engine-tracked as a class-specific status** rather than a Draw Steel condition — see [Q2](rule-questions.md#q2-strained-as-engine-status-vs-draw-steel-condition-). It doesn't appear in the conditions list and uses a different lifecycle.

**Saving throws.** At the end of an affected creature's turn, the reducer dispatches a `RollResistance` intent for each `save_ends` condition on them, in `appliedAtSeq` order. Each save is independent — d10 ≥ 6 ends the effect — per canon § 3.3 and [Q9](rule-questions.md#q9-saving-throws--per-effect-or-per-turn-).

### Heroic resources and surges

Each class has its own heroic resource — Censor: wrath · Conduit: piety · Elementalist: essence · Fury: ferocity · Null: discipline · Shadow: insight · Tactician: focus · Talent: clarity · Troubadour: drama. The engine ships a generic resource model — pool, floor, ceiling, gain triggers, spend rules, ongoing effects, lifecycle — parameterized per class. Per-class detail lives in [`rules-canon.md` § 5](rules-canon.md#5-heroic-resources--surges).

The model is **not** "track an integer ≥ 0." Things it has to support:

- **Floor below zero.** Talent's clarity floors at `-(1 + Reason)` and dispatches end-of-turn `ApplyDamage` plus a `Strained` flag while negative.
- **Encounter-scoped primaries + persistent epic secondaries.** All 8 non-Talent primary resources are encounter-scoped (reset to 0 at end of encounter). Two classes also have 10th-level **epic** secondary resources that *do* persist between encounters: Censor's Virtue and Conduit's Divine Power. Engine model accommodates a class having a primary pool + a persistent epic pool.
- **Ongoing effects as derived intents.** "Take 1 damage per negative point of clarity at end of turn" is dispatched by the engine, not tracked manually.
- **Director's Malice.** Encounter-scoped pool. Can go negative under specific abilities (e.g. Elementalist's `Sap Strength`). Lives on the encounter, not on a participant.

Surges are a separate per-character pool. The engine's job for resources: apply gain/spend, run ongoing effects as derived intents at the right lifecycle moments, and surface threshold-driven options (e.g. "spend 5 piety" abilities) to the UI.

### Forced movement

`Push`, `Pull`, `Slide` are the three forced-movement intents. The engine runs each through the pipeline in [`rules-canon.md` § 6.12](rules-canon.md#612-engine-resolution-order-for-a-force-move): stability reduction → size adjustment → square-by-square walk → collision/terrain/trigger checks → post-move state (e.g. fall after airborne).

Load-bearing details the engine has to get right:

- **Stability is voluntary** ([Q12](rule-questions.md#q12-stability-application--voluntary-or-automatic-)). The reducer prompts the target for how many squares of stability to apply (0 ≤ n ≤ stability). UI defaults to "apply full stability" with a "use less" affordance; Director can override for monsters.
- **Slam damage** is per-square remaining and applies to **both** the slammed and the slammed-into creature (size rules in canon § 6.5).
- **Hurling through objects** consumes squares of remaining movement and deals material-specific damage (glass/wood/stone/metal — canon § 6.7).
- **Multi-target force-move** — source chooses order; each target completes their full pipeline before the next (canon § 6.3, § 6.12).
- **Death-effect ordering** — same-ability lethal damage + force-move: force-move completes first, then `OnDeath` derived intents fire (canon § 6.11).
- **"When a creature moves" triggers** fire per-square traversed, including on forced movement (unless the trigger explicitly requires willing movement) — canon § 6.10.

The engine doesn't currently model a grid; movement is tracked as numeric distance / abstract position. The pipeline still runs faithfully — slams, hurls, and falls are resolved against logical positions and reported in the log. A grid view is a Phase 4 stretch. The director can manually adjust position with a `SetStat` if it matters tactically.

## Module layout

```
packages/rules/
├── src/
│   ├── index.ts                  # public exports
│   ├── reducer.ts                # the main applyIntent dispatch
│   ├── canon-status.generated.ts # generated from rules-canon.md (do not edit)
│   ├── require-canon.ts          # requireCanon(slug) gate
│   ├── intents/
│   │   ├── rollPower.ts          # one file per intent type
│   │   ├── rollTest.ts
│   │   ├── rollResistance.ts
│   │   ├── rollOpposedTest.ts
│   │   ├── applyDamage.ts
│   │   ├── push.ts / pull.ts / slide.ts
│   │   ├── ...
│   │   └── index.ts
│   ├── conditions/               # one file per condition
│   │   ├── bleeding.ts
│   │   ├── dazed.ts
│   │   ├── ...
│   │   └── index.ts              # exports the ConditionDef registry
│   ├── resources/                # one file per class heroic resource
│   │   ├── talent-clarity.ts
│   │   ├── ...
│   │   └── index.ts
│   ├── damage.ts                 # § 2.12 pipeline
│   ├── forced-movement.ts        # § 6.12 pipeline
│   ├── rolls.ts                  # 2d10 + tier + crit detection
│   ├── turn-state.ts             # § 4.10 state machine
│   ├── permissions.ts            # canDispatch
│   ├── inverses.ts               # inverse functions for undo
│   └── types.ts                  # SessionState, Participant, etc.
├── scripts/
│   └── gen-canon-status.ts       # parses rules-canon.md → registry
└── tests/
    ├── fixtures/                 # reusable scenarios
    └── *.spec.ts
```

## Test strategy

Fixture-driven. We don't write tests like "given this exact state, expect this exact state" — that's brittle. We write scenario tests:

```ts
test('Bleeding deals 1d6+level damage on a main action and ends on save', () => {
  const s = scenario('two_combatants')
    .applyCondition('p2', 'Bleeding', { duration: 'save_ends' })
    .startTurn('p2')
    .rollPower('p2', 'meleeWeaponFreeStrike', { rolls: [5, 5] });  // tier 2 outcome

  expect(s.lastLog()).toMatch(/p2 takes \d+ untyped damage from Bleeding/);

  s.endTurn('p2');  // dispatches RollResistance for save_ends
  s.applyRoll({ d10: 7 });  // ≥ 6 ends the effect

  expect(s.hasCondition('p2', 'Bleeding')).toBe(false);
});
```

The fixture helpers wrap intent dispatches with an ergonomic API. Every test runs the real reducer.

## Where the rulebook ambiguity lives

Every interpretive call we've made — where the rulebook is silent, ambiguous, or two sources contradict — is recorded in [`rule-questions.md`](rule-questions.md). The reducer cites the relevant `Q#` from canon at every gate that depends on a judgment call (e.g. multi-type damage handling, stability voluntariness, cross-side triggered-action ordering). When new information arrives that changes a call, the relevant Q-entry is superseded and the dependent canon section drops back to 🚧 for re-verification — at which point the registry regenerates and the engine path falls back to manual override until re-verified.

The pattern: pick a defensible default, cite it as a `Q#`, surface it in the log, make it overridable. We don't try to be omniscient.

## Engine vs. manual override

The decision of what to automate is **not** "is it well-specified in the rulebook" — that's part of it, but the canon-gated automation pattern (above) is the real answer:

- A rule canon section marked ✅ — the engine may automate it via `requireCanon(slug)`.
- 🚧 or ⛔ — the reducer dispatches to a manual-override path. The UI prompts the table to resolve.

We don't block on perfect coverage; we ship with the canon-✅ rules automated and the rest as override-and-log. The override path is the relief valve.
