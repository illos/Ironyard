---
name: Phase 1 slice 7 — heroic resources, surges, and Director's Malice
description: Generic per-participant resource model (the 9 class resources) + universal surges pool + recoveries + encounter-scoped Director's Malice. Talent's Clarity floor-below-zero is the load-bearing exception.
type: spec
---

# Phase 1 slice 7 — heroic resources, surges, and Director's Malice

## Goal

Land the engine's resource subsystem: a generic per-participant `ResourceInstance` keyed by name; the universal surges pool; recoveries; and a Director-scoped Malice counter on the active encounter. Auto-application is gated on the relevant `requireCanon('heroic-resources-and-surges.*')` slugs; every non-✅ branch falls back to manual-override-only via the standard canon-gate idiom.

After this slice the reducer can:

- `GainResource { participantId, name, amount }` and `SpendResource { participantId, name, amount, reason? }` on any participant for any of the 9 named class resources (plus a free-form `extras` array for homebrew).
- `SetResource { participantId, name, value }` as a manual override that ignores floor/ceiling.
- `SpendSurge { participantId, count }` and adjust the universal surges pool.
- `SpendRecovery { participantId }` to dispatch a derived `ApplyHeal` for `recoveryValue` HP, paying 1 recovery, capped at `maxStamina`.
- `GainMalice { amount }` and `SpendMalice { amount, reason? }` against an encounter-scoped Director's Malice counter (which is allowed to go negative per canon §5.5).
- Enforce Talent's Clarity floor of `-(1 + Reason)` and dispatch derived `ApplyDamage` end-of-turn while Clarity is negative (the Strained EoT damage rule from canon §5.3).

Out: class-specific spend-time consequences (Censor Wrath channel effects, Fury Ferocity damage tiers, Shadow Insight cost reduction, etc.); ability-cost gating (which ability costs which resource); Heroic Slayer Renown / Director's Renown; UI; and the per-turn `1d3` auto-gain (the dice-from-payload pattern handles that — slice 8 wires it).

## Required reading

1. `docs/rules-canon.md` § 5 (Heroic resources & surges) and § 5.5 (Director's Malice).
2. `docs/rule-questions.md` Q1 (Strained sub-effect timing) and Q2 (Strained as engine status).
3. `docs/superpowers/specs/2026-05-10-phase-1-slice-5-conditions-design.md` and `…-slice-6-condition-hooks-design.md` for the data-model + hook patterns this slice mirrors.

## What's in / out

**In — generic resource model:**
- `ResourceInstance` on `Participant`: `{ name: ResourceName, value: number, max?: number, floor: number }`. `floor` defaults to 0; the Talent's Clarity instance is created with `floor = -(1 + Reason)`. Engine doesn't recompute floor automatically when Reason changes — slice 7 ships a one-shot constructor; slice 8+ (character sheet) recomputes on stat edit.
- `ResourceName` is a discriminated string. Typed for the 9 class resources (a typed name registry, **not** free-form), plus a `participant.extras: ResourceInstance[]` array for homebrew or compound resources (Censor's Virtue, Conduit's Divine Power) — see "Naming model" below.
- Intents: `GainResource`, `SpendResource`, `SetResource`.

**In — surges / recoveries:**
- Universal surges pool: `Participant.surges: number` (≥ 0, no max).
- Recoveries: `Participant.recoveries: { current: number, max: number }` and `Participant.recoveryValue: number`.
- `SpendSurge { participantId, count }` decrements `surges` by `count`. Class-specific surge effects (Censor channel, Fury rage, etc.) are deferred to Phase 2.
- `SpendRecovery { participantId }` decrements `recoveries.current` by 1 and dispatches a derived `ApplyHeal { targetId, amount: recoveryValue }` clipped at `maxStamina` (see "ApplyHeal" below). Logs `manual_override_required` if `recoveries.current === 0`.

**In — Talent Clarity floor exception:**
- `SpendResource` rejects when `value - amount < floor`. For non-Talent resources `floor === 0`, so the existing "can't go negative" semantics fall out for free. For Talent's Clarity, `floor` is the participant's `-(1 + Reason)` — the Talent **can** spend Clarity they don't have, going negative, up to that floor.
- `SetResource` is a manual override and ignores the floor (Director can put Clarity at any integer).
- End-of-turn while `clarity < 0`: derived `ApplyDamage { targetId, amount: |clarity|, damageType: 'untyped' }`. The hook fires in `EndTurn` after slice 6's `RollResistance` cascade, behind `requireCanon('heroic-resources-and-surges.talent-clarity')`.

**In — Director's Malice (canon §5.5 ✅):**
- `Malice` is encounter-scoped, not participant-scoped. Lives on `ActiveEncounter.malice: { current: number; lastMaliciousStrikeRound: number | null }`. Encounter creation initializes `{ current: 0, lastMaliciousStrikeRound: null }`.
- `GainMalice { amount }` adds (may go negative if `amount` is negative — the engine permits negative Malice per canon §5.5).
- `SpendMalice { amount, reason? }` subtracts. The engine **permits** going negative (no floor; canon explicitly says so).
- Auto-gain per round: canon §5.5 says `heroes_alive + round_number` per `StartRound`. **This slice does NOT auto-fire the gain** — the dispatcher (DO / UI) passes `maliceGain?: number` on `StartRound` and the engine credits it iff the canon slug is ✅ and the field is provided; otherwise logs `manual_override_required`. This keeps the per-round Malice generation purely data-driven (no `heroes_alive` calculation in this slice).
- The `lastMaliciousStrikeRound` field is allocated for future use (Phase 2 Malice spend gating); slice 7 only resets it to `null` on `StartEncounter`.

**Out (deferred):**
- Class-specific resource consequences (Fury bonus damage tiers, Censor channel, Shadow cost reduction, Troubadour posthumous gain, Elementalist maintenance, Conduit pray) — Phase 2 once character sheets exist and abilities have costs.
- Resource-driven ability gating (this ability costs N Focus etc.) — slice 8+ when ability data lands.
- Auto-`1d3` per-turn Clarity / Piety / Ferocity / Insight / Drama gain — dispatcher-provided dice in slice 8.
- Heroic Slayer Renown / Director's Renown — Phase 2.
- Strained sub-effect rider firing on ability use (Q1) — needs ability-cost wiring (slice 8). Slice 7 only ships the engine-tracked `isStrained` derivation and the EoT damage.
- 10th-level epic secondary pools (Censor Virtue, Conduit Divine Power) — Phase 2 character sheets surface these. Slice 7 reserves `extras: ResourceInstance[]` so the model can carry them without a refactor.
- 10th-level Effortless Mind toggle (suppress EoT clarity damage) — Phase 2.

## Naming model

Typed name registry. The closed enum:

```ts
const HEROIC_RESOURCE_NAMES = [
  'wrath',      // Censor
  'piety',      // Conduit
  'essence',    // Elementalist
  'ferocity',   // Fury
  'discipline', // Null
  'insight',    // Shadow
  'focus',      // Tactician
  'clarity',    // Talent
  'drama',      // Troubadour
] as const;
```

Reasoning: the 9 resources are a fixed Draw Steel design constant and the engine has to know which one is Clarity (only Clarity has a negative floor). A typed enum gets us compiler-checked switch statements at every consumer site. Homebrew or epic-secondary resources live in a parallel `participant.extras: ResourceInstance[]` array where the `name` is a free-form `z.string().min(1)`.

Two arrays, not one map:

```ts
participant.heroicResources: ResourceInstance<HeroicResourceName>[]  // ≤ 1 entry per name
participant.extras: ResourceInstance<string>[]                       // free-form (homebrew)
```

The split surfaces the canon-fixed names at the type system layer while leaving homebrew open. Lookup is by linear scan; n ≤ 1 for heroic + few-handful for extras, so no map needed.

## Data shapes

### ResourceInstance (in `@ironyard/shared`)

```ts
// packages/shared/src/resource.ts
export const HEROIC_RESOURCE_NAMES = [
  'wrath', 'piety', 'essence', 'ferocity', 'discipline',
  'insight', 'focus', 'clarity', 'drama',
] as const;
export const HeroicResourceNameSchema = z.enum(HEROIC_RESOURCE_NAMES);
export type HeroicResourceName = z.infer<typeof HeroicResourceNameSchema>;

export const HeroicResourceInstanceSchema = z.object({
  name: HeroicResourceNameSchema,
  value: z.number().int(),
  max: z.number().int().nonnegative().optional(),
  floor: z.number().int().default(0),
});
export type HeroicResourceInstance = z.infer<typeof HeroicResourceInstanceSchema>;

export const ExtraResourceInstanceSchema = z.object({
  name: z.string().min(1),
  value: z.number().int(),
  max: z.number().int().nonnegative().optional(),
  floor: z.number().int().default(0),
});
export type ExtraResourceInstance = z.infer<typeof ExtraResourceInstanceSchema>;
```

### MaliceState (in `@ironyard/shared`)

```ts
// packages/shared/src/malice.ts
export const MaliceStateSchema = z.object({
  current: z.number().int(),                          // may be negative; canon §5.5
  lastMaliciousStrikeRound: z.number().int().nullable().default(null),
});
export type MaliceState = z.infer<typeof MaliceStateSchema>;
```

### Participant additions (in `@ironyard/shared/participant.ts`)

```ts
// Slice 7 additions
heroicResources: z.array(HeroicResourceInstanceSchema).default([]),
extras: z.array(ExtraResourceInstanceSchema).default([]),
surges: z.number().int().min(0).default(0),
recoveries: z.object({
  current: z.number().int().min(0),
  max: z.number().int().min(0),
}).default({ current: 0, max: 0 }),
recoveryValue: z.number().int().min(0).default(0),
```

Existing payloads that omit these still parse (defaults). Tests for slices 1–6 do not break.

### ActiveEncounter additions (in `packages/rules/src/types.ts`)

```ts
malice: MaliceState;  // initialized { current: 0, lastMaliciousStrikeRound: null } in StartEncounter
```

`StartEncounter` constructs the field with the defaults; nothing else mutates it outside the Malice intents.

## Intents

### GainResource

Payload:
```ts
{
  participantId: string;
  name: HeroicResourceName | { extra: string };  // typed name OR named extra
  amount: number;                                 // int, may be negative (canon allows; e.g. Elementalist maintenance)
}
```

Reducer:
1. Validate payload + active encounter + target exists.
2. Look up the instance in `heroicResources` (typed name) or `extras` (extra). If absent and `amount > 0`, **error** (`resource_missing`) — clients must explicitly initialize via `SetResource` or `BringCharacterIntoEncounter`. This forces players to declare their resource up front; we don't silently allocate a Wrath pool for a Conduit.
3. Compute `next = current.value + amount`. Cap at `max` if defined.
4. Floor: not enforced on gain. Negative `amount` that would breach the floor is **rejected** with `floor_breach`.
5. Update participant immutably; bump `seq`; log.

### SpendResource

Payload:
```ts
{
  participantId: string;
  name: HeroicResourceName | { extra: string };
  amount: number;             // int, > 0
  reason?: string;            // free-form, for the log
}
```

Reducer:
1. Validate.
2. Look up the instance. Absent → `resource_missing`.
3. Compute `next = current.value - amount`. If `next < current.floor` → `floor_breach` (rejected; no state change).
4. Update participant immutably; log.
5. **Note on Clarity:** Talent's Clarity instance has `floor = -(1 + Reason)` (set at participant-construction time by the dispatcher / character sheet). The reducer doesn't recompute floor; it reads what's in the instance. This is the load-bearing exception: every other resource has `floor === 0` so the `next < floor` check rejects negative spends as expected.

### SetResource (manual override)

Payload:
```ts
{
  participantId: string;
  name: HeroicResourceName | { extra: string };
  value: number;
  initialize?: { max?: number; floor?: number };  // optional — used the first time to create the instance
}
```

Reducer:
1. Validate.
2. Look up. If absent and `initialize` provided → create the instance with `{ name, value, max, floor }` (floor defaults to 0; for Clarity the dispatcher passes the negative floor explicitly).
3. If absent and `initialize` absent → `resource_missing`.
4. If present → replace `value` (ignore floor/ceiling — this is the override path).
5. Update; log with `manual_override` marker.

### SpendSurge

Payload:
```ts
{
  participantId: string;
  count: number;  // int, > 0
}
```

Reducer:
1. Validate.
2. Look up participant. Reject if `participant.surges < count` with `insufficient_surges`.
3. Decrement; log.

(Class-specific surge effects — extra damage, potency boost — are deferred to slice 8 when `RollPower` learns to read `surgeDamage` / `surgePotency` payload fields.)

### SpendRecovery

Payload:
```ts
{
  participantId: string;
}
```

Reducer:
1. Validate + target exists.
2. If `recoveries.current === 0` → reject with `no_recoveries`.
3. Decrement `recoveries.current` by 1.
4. Emit a derived `ApplyHeal { targetId: participantId, amount: recoveryValue }`. The dispatcher (DO) fills `id`, `timestamp`, `sessionId`, `causedBy = parent.id`.

(See **ApplyHeal** below — new intent type this slice adds.)

### ApplyHeal (new)

Payload:
```ts
{
  targetId: string;
  amount: number;  // int, > 0
}
```

Reducer:
1. Validate + target exists.
2. `next = min(target.currentStamina + amount, target.maxStamina)`. (Floor at 0; healing never makes stamina negative. For dying-but-alive PCs `currentStamina` may already be negative — see canon §2.8 — and the heal climbs from there.)
3. Update target's `currentStamina`; log `${target.name} heals N (X → Y)`.

This isn't strictly resource-scoped — it's an effect — but it's the cleanest way to express "this recovery delivers HP" without inventing a new intent dispatch path. Future heal abilities reuse it.

### GainMalice

Payload:
```ts
{
  amount: number;  // int, may be negative
}
```

Reducer:
1. Validate + active encounter.
2. Add to `activeEncounter.malice.current`. No floor (canon §5.5 — negative Malice is allowed).
3. Update; log.

### SpendMalice

Payload:
```ts
{
  amount: number;   // int, > 0
  reason?: string;
}
```

Reducer:
1. Validate + active encounter.
2. Subtract; log. **No insufficient-Malice rejection** — canon §5.5 explicitly permits going negative.

## Hook integration

### EndTurn: Talent Clarity EoT damage (canon §5.3)

After slice 6's `EndTurn` cascade (which dispatches `RollResistance` for save_ends conditions), the reducer inspects the ending participant's `heroicResources` for a Clarity instance. If `clarity.value < 0`, behind `requireCanon('heroic-resources-and-surges.talent-clarity')`:

```ts
derived.push({
  actor: intent.actor,
  source: 'auto' as const,
  type: IntentTypes.ApplyDamage,
  payload: {
    targetId: currentId,
    amount: Math.abs(clarity.value),
    damageType: 'untyped',
  },
  causedBy: intent.id,
});
```

Log: `${name} takes N damage from negative Clarity (strained)`.

Cite Q2 in the comment — Strained isn't a condition, it's an engine-tracked status derived from `clarity < 0`.

### StartEncounter: Malice init

`StartEncounter` constructs the encounter with `malice: { current: 0, lastMaliciousStrikeRound: null }`. No further hook; per-round Malice generation is dispatcher-driven (see "Director's Malice" above).

### Hook for end-of-encounter resource reset (canon §5.4: encounter-scoped)

**Punted to a future `EndEncounter` intent**, which doesn't exist yet in the slice 1–6 set. Slice 7 introduces no `EndEncounter`. When that intent lands, it walks each participant's `heroicResources` and zeroes `value` (except `clarity` which canon §5.3 says "remaining positive clarity is lost AND any negative clarity resets to 0" — same end-state). Surges also reset to 0 per canon §5.6.

Flagged in the summary as a forward dependency.

## Module layout (additions)

```
packages/shared/src/
├── resource.ts                   # HeroicResourceNameSchema, HeroicResourceInstanceSchema, ExtraResourceInstanceSchema
├── malice.ts                     # MaliceStateSchema
├── participant.ts                # extended with heroicResources, extras, surges, recoveries, recoveryValue
└── intents/
    ├── gain-resource.ts
    ├── spend-resource.ts
    ├── set-resource.ts
    ├── spend-surge.ts
    ├── spend-recovery.ts
    ├── apply-heal.ts
    ├── gain-malice.ts
    └── spend-malice.ts

packages/rules/src/
├── types.ts                      # ActiveEncounter.malice added
└── intents/
    ├── gain-resource.ts
    ├── spend-resource.ts
    ├── set-resource.ts
    ├── spend-surge.ts
    ├── spend-recovery.ts
    ├── apply-heal.ts
    ├── gain-malice.ts
    ├── spend-malice.ts
    ├── start-encounter.ts        # extended — initialize encounter.malice
    └── turn.ts                   # extended — EndTurn clarity EoT damage hook
```

`packages/rules/src/reducer.ts` adds 8 new cases.

## Wire format

No envelope changes. `IntentTypes` enum adds:

- `GainResource`, `SpendResource`, `SetResource`
- `SpendSurge`, `SpendRecovery`, `ApplyHeal`
- `GainMalice`, `SpendMalice`

## Per-class resource table

(All names lowercased to match canon § 5.4.9 engine summary. Floor is 0 for all except Talent.)

| Class | Resource | Per-turn gain | Extra in-combat gain triggers | Floor |
|-------|----------|---------------|-------------------------------|-------|
| Censor | wrath | 2 | judged-creature damage exchange (canon §5.4.1) | 0 |
| Conduit | piety | 1d3 | (optional pray-to-gods rider — canon §5.4.2) | 0 |
| Elementalist | essence | 2 | 1+ damage in 10 sq (typed, not untyped/holy) — canon §5.4.3 | 0 |
| Fury | ferocity | 1d3 | take damage; winded/dying — canon §5.4.4 | 0 |
| Null | discipline | 2 | Null Field main-action use; Director Malice spend — canon §5.4.5 | 0 |
| Shadow | insight | 1d3 | damage incorporating surges — canon §5.4.6 | 0 |
| Tactician | focus | 2 | damage to Marked creature; ally heroic ability — canon §5.4.7 | 0 |
| **Talent** | **clarity** | **1d3** | first force-move per round — canon §5.3 | **−(1 + Reason)** |
| Troubadour | drama | 1d3 | 3+ heroes ability turn; hero winded/dies; nat 19/20 in LoE — canon §5.4.8 | 0 |

**Slice 7 enforces:** the floor difference (Clarity's `-(1+Reason)` vs the rest's 0) and the typed name registry. **Slice 7 does NOT enforce** any of the extra gain triggers or per-turn gains — those are dispatcher-driven `GainResource` calls.

## Director's Malice model

```ts
// On ActiveEncounter (in packages/rules/src/types.ts)
malice: {
  current: number;                         // may be negative (canon §5.5)
  lastMaliciousStrikeRound: number | null; // reserved; not used by slice 7
}
```

- Initialized on `StartEncounter` to `{ current: 0, lastMaliciousStrikeRound: null }`.
- `GainMalice` / `SpendMalice` adjust `current`. Both signed.
- No floor.
- `lastMaliciousStrikeRound` is allocated for the canon §5.5 "Malicious Strike can't fire two rounds in a row" rule — slice 8+ wires the spend-time check.

## Surges / Recoveries semantics

**Surges (canon §5.6):**
- Universal per-character pool, separate from heroic resources.
- Floor 0; no ceiling.
- Lost at end of combat (handled when `EndEncounter` lands).
- Slice 7 ships only the `SpendSurge` intent and the floor check. Class-specific surge consequences land in slice 8.

**Recoveries (canon §2.13):**
- Per-character pool of `recoveries.current / recoveries.max`.
- Each recovery dispatched via `SpendRecovery` heals `recoveryValue` HP (canon-typical math; the dispatcher computes the value from `maxStamina / 3` rounded down — slice 7 doesn't compute it, just consumes what's in the field).
- `ApplyHeal` is the canonical heal intent and is added this slice.

## Permissions

- Any connected member can dispatch resource intents on themselves; the DO already overrides `intent.actor`. Director-vs-player gates land later.
- Malice intents (`GainMalice`, `SpendMalice`): no role gate at the reducer level in slice 7. The intent is semantically director-only and the UI will only surface it to directors. A future permission slice (Phase 2) flags it `director-only` at `canDispatch`.
- None are server-only.

## Canon gating

- `GainResource` / `SpendResource` / `SetResource`: gated on `heroic-resources-and-surges.engine-model` — currently `drafted`, so **auto-application is OFF**. That means: the reducer **still applies the intent** (it's a manual-override-trustworthy mutation, like SetCondition), but auto-derived chains (e.g. Clarity EoT damage) are gated separately on `talent-clarity`.
- Talent EoT damage: `heroic-resources-and-surges.talent-clarity` ✅ → auto-applies.
- Director's Malice: `heroic-resources-and-surges.directors-malice` ✅ → auto-applies (the spend/gain intents).
- Surges: `heroic-resources-and-surges.surges` ✅ → auto-applies.
- Recoveries / ApplyHeal: rely on the existing damage pipeline slug for stamina updates; recoveries themselves are canon §2.13 not in the §5 tree, so this slice cites `damage-application.recoveries` ✅.

Rationale: per the canon-gate idiom, intents themselves apply unconditionally (they're the user's command); **auto-derived intents** are what `requireCanon` gates. That matches slice 6's pattern.

## Test plan

### `packages/shared/tests/resource.spec.ts` — schema tests (~5)
- HeroicResourceName enum closure (rejects 'mana')
- HeroicResourceInstance rejects non-int value
- ExtraResourceInstance accepts arbitrary name
- MaliceStateSchema parses with default `lastMaliciousStrikeRound: null`
- Participant defaults: heroicResources/extras/surges/recoveries/recoveryValue parse from `{}`

### `packages/rules/tests/reducer-resources.spec.ts` — reducer integration (~25)

**GainResource / SpendResource / SetResource:**
- GainResource on existing resource increments value
- GainResource caps at `max` if defined
- GainResource on absent resource → `resource_missing`
- GainResource negative amount that would breach floor → `floor_breach`
- SpendResource decrements value
- SpendResource where `value - amount < floor` → `floor_breach`
- SpendResource for Talent Clarity with `floor = -(1+Reason)` allows going negative within the floor
- SpendResource for Talent Clarity that would breach `-(1+Reason)` → `floor_breach`
- SpendResource on a non-Talent resource with `floor: 0` rejects going negative
- SetResource creates the resource if `initialize` provided
- SetResource without `initialize` on a missing resource → `resource_missing`
- SetResource ignores floor (manual override path)
- SetResource on an extra (named string) works through the `extras` array
- GainResource on an extra name works
- All three intents reject with `no_active_encounter` / `target_missing` / `invalid_payload` as appropriate

**SpendSurge / SpendRecovery / ApplyHeal:**
- SpendSurge decrements
- SpendSurge with `count > surges` → `insufficient_surges`
- SpendRecovery decrements and emits derived ApplyHeal with `amount = recoveryValue`
- SpendRecovery with 0 recoveries → `no_recoveries`
- ApplyHeal caps at maxStamina
- ApplyHeal from negative currentStamina climbs correctly (canon §2.8 dying)

**GainMalice / SpendMalice:**
- GainMalice adds to encounter.malice.current
- SpendMalice can drive current negative (canon §5.5)
- GainMalice/SpendMalice reject with `no_active_encounter`
- StartEncounter initializes `malice: { current: 0, lastMaliciousStrikeRound: null }`

**Clarity EoT damage hook (integration):**
- EndTurn with clarity < 0 emits derived ApplyDamage with amount = |clarity|, damageType = 'untyped'
- EndTurn with clarity >= 0 emits no clarity-derived damage
- EndTurn for a non-Talent participant (no clarity instance) emits no clarity-derived damage
- EndTurn clarity damage co-exists with slice 6's save_ends `RollResistance` cascade (both derived intents present)

## Constraints for the agent

- **Touch only `packages/shared` and `packages/rules`.** Do not modify `apps/web`, `apps/api`, or `packages/data`.
- Follow the existing per-handler pattern (validate payload → guard active encounter → guard target → mutate immutably → return result).
- All handlers pure: no `Date.now()`, no `Math.random()`. Dice for per-turn 1d3 gains arrive via payload — slice 8 wires it.
- TypeScript strict; no `any` without a justified `// reason:` comment.
- Zod is the source of truth at every boundary; types via `z.infer`.
- Tests are scenario-driven (mirror `reducer-conditions.spec.ts`); fixture helpers (`pc()`, `monster()`, `ready()`, `intent()`) are duplicated locally in the spec file.

## Expected output (return summary)

1. Spec path + files added/modified.
2. New test count and grand total (baseline 167 → target ~200).
3. Verification gates output.
4. Any deviation from the spec, with reasoning.
5. Forward dependencies: `EndEncounter` (for resource reset), per-turn 1d3 gains (slice 8), ability-cost wiring (slice 8), 10th-level epic secondaries (Phase 2).
6. The fields added to `packages/shared/src/participant.ts` (for the parallel data-ingest agent's merge resolution).
