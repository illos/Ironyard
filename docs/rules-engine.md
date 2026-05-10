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

## What it models

### Power rolls (resolution)

Draw Steel's resolution is `2d10 + characteristic`, plus any bonuses or penalties (rare; mostly skills), with edges and banes layered on top. A single net edge is +2; a single net bane is −2. A *double* edge or bane (two net) is a tier shift, not a ±4 modifier. Natural 19/20 always lands at tier 3. Some effects grant automatic tier outcomes that supersede everything else.

The full mechanic — cancellation rules, threshold table, exact resolution order — lives in [`rules-canon.md` § 1](rules-canon.md#1-power-rolls-resolution). The engine implements that ordering verbatim.

The engine reads the d10 values from the intent's `rolls` field — it does **not** sample randomness — then walks the resolution order, looks up the tier on the ability's t1/t2/t3 ladder, and emits derived intents. Characteristic and bonus lookups happen against `state` inside the reducer; only the random component travels in the payload. See [`intent-protocol.md` → Rolls](intent-protocol.md#rolls).

### Damage with types and adjustments

Each damage application checks the target's `immunities`, `weaknesses`, and any active condition that modifies incoming damage. Damage types are an enum (`fire`, `cold`, `holy`, `corruption`, `psychic`, `lightning`, `poison`, `acid`, `sonic`, `untyped`).

### Conditions

A condition has a name, source (intent id), duration (`EoT` end-of-turn, `EoEnc` end-of-encounter, `Save` ends on save, `Until: <intentId>`), and an effect on resolution. Effects are encoded declaratively in `packages/rules/src/conditions/<condition>.ts`:

```ts
export const Bleeding: ConditionDef = {
  name: 'Bleeding',
  on: {
    startTurn: (target, ctx) => ctx.dispatch({ type: 'ApplyDamage', payload: { targetId: target.id, amount: 5, damageType: 'untyped' } }),
  },
  endsOn: { kind: 'save', saveType: 'resistance' },
};
```

The reducer iterates registered condition handlers at relevant lifecycle moments (`startTurn`, `endTurn`, `onAttack`, `onDamageTaken`, etc.) and dispatches their derived intents.

### Heroic resources and surges

Each class has a heroic resource (Wrath, Drama, Insight, etc.) modeled as a numeric pool with class-specific gain/spend rules. Surges are a separate per-character pool.

The engine's job: track the number, prevent going below zero, emit log entries when resource thresholds enable specific abilities (e.g. Conduit's "spend 5 Piety" abilities).

### Movement and forced movement

`Push`, `Pull`, `Slide` are intent types with distance and direction. The engine doesn't model a grid yet (Phase 4 stretch); it tracks movement as numeric distance from baseline. The director can manually adjust position with a `SetStat` if it matters tactically.

## Module layout

```
packages/rules/
├── src/
│   ├── index.ts              # public exports
│   ├── reducer.ts            # the main applyIntent dispatch
│   ├── intents/
│   │   ├── rollPower.ts      # one file per intent type
│   │   ├── applyDamage.ts
│   │   ├── ...
│   │   └── index.ts
│   ├── conditions/           # one file per condition
│   ├── damage.ts             # damage calculation w/ resistances
│   ├── rolls.ts              # 2d10 + tier lookup
│   ├── permissions.ts        # canDispatch
│   ├── inverses.ts           # inverse functions for undo
│   └── types.ts              # SessionState, Participant, etc.
└── tests/
    ├── fixtures/             # reusable scenarios (a goblin combat, etc.)
    └── *.spec.ts
```

## Test strategy

Fixture-driven. We don't write tests like "given this exact state, expect this exact state" — that's brittle. We write scenario tests:

```ts
test('Bleeding ticks damage at start of turn and ends on save', () => {
  const s = scenario('two_combatants')
    .applyCondition('p2', 'Bleeding')
    .startTurn('p2');

  expect(s.lastLog()).toMatch(/p2 takes 5 untyped damage from Bleeding/);

  s.rollResistance('p2');  // assume the helper rolls a 12, succeeds

  expect(s.hasCondition('p2', 'Bleeding')).toBe(false);
});
```

The fixture helpers wrap intent dispatches with an ergonomic API. Every test runs the real reducer.

## Where the rulebook ambiguity lives

Real edge cases the engine has to make a call on (and surface to the user when wrong):

- **Order of operations on the same trigger.** Two conditions both fire on `startTurn`: which goes first? Engine: in registration order, surfaced in the log so the table can override.
- **Damage type interactions** when a hit deals two types (e.g. fire + holy). Engine: apply each type's resistance/weakness independently and sum.
- **Concurrent push from multiple sources.** Engine: apply in dispatch order; if the table wants different, undo and re-apply.

The pattern: pick a defensible default, log it loudly, make it overridable. We don't try to be omniscient.

## When to extend the engine vs. log it as TODO

- **Common mechanic, well-specified in the rulebook** → extend the engine
- **Rare interaction, ambiguous in the rulebook** → log a TODO, fall back to manual override, ship

We don't block features waiting for the engine to handle every corner case. The override path is the relief valve.
