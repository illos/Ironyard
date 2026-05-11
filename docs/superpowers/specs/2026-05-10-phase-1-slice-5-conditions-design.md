---
name: Phase 1 slice 5 — conditions (data model + manual override)
description: 9 conditions modeled as data on Participant; SetCondition / RemoveCondition / RollResistance intents. Hook system (Bleeding damage, edge/bane contributions, action gating) explicitly deferred.
type: spec
---

# Phase 1 slice 5 — conditions

## Goal

Model all 9 Draw Steel conditions as data attached to participants so the engine can store them, undo them, and replay them. Manual-override semantics only — the engine doesn't yet *enforce* anything about conditions (no Bleeding damage on action, no Dazed gates, no Frightened edges). That enforcement (the hook system) lands in slice 6.

This is the smallest meaningful slice for conditions: get the data model right, get the intents right, get the canon-compliant stacking and duration semantics right. Hooks plug in later without rewriting the data layer.

## What's in / out

**In:**
- `ConditionInstance` shape attached to `Participant.conditions[]`
- Closed enum of the 9 condition types (matches `rules-canon.md §3.5`)
- Duration variants: `EoT`, `save_ends`, `until_start_next_turn { ownerId }`, `end_of_encounter`, `trigger { description }` (last one is a data-only placeholder)
- Intents: `SetCondition`, `RemoveCondition`, `RollResistance`
- Stacking rules:
  - Same `{type, sourceId}` is idempotent (no double-add)
  - Different sources on same type → keep both `ConditionInstance` entries (per-source duration tracked) but effect is binary (per Q8)
  - Frightened / Taunted: per `rules-canon.md §3.4`, a new imposition from a *different* source replaces any prior instance on the target (keeps just the newest from each source for these two types)
- `RollResistance`: client sends 1 d10 in payload; reducer reads the value, removes the matching `save_ends` condition iff d10 ≥ 6 (per `rules-canon.md §3.3` and `Q9`)

**Deferred to slice 6 (hook system):**
- Bleeding damage on action / triggered action / Might-or-Agility power roll (`rules-canon.md §3.5.1`)
- Edge/bane contributions from Frightened / Grabbed / Prone / Restrained / Taunted / Weakened on `onRollResolution`
- Action gating (Dazed restricts the turn to one of {main, maneuver, move}; Slowed forbids shift; Grabbed forbids Knockback; Restrained forbids Stand Up; Surprised forbids triggered + free triggered through round 1)
- Auto-fire `RollResistance` at end of turn for `save_ends` conditions
- `onCheckTriggerEnd` (teleport, force-move-apart) auto-removes Grabbed / Restrained
- Strained (Talent-only class status, not a condition) — slice 7

## Data shapes

### ConditionType (in `@ironyard/shared`)

```ts
const CONDITION_TYPES = [
  'Bleeding', 'Dazed', 'Frightened', 'Grabbed', 'Prone',
  'Restrained', 'Slowed', 'Taunted', 'Weakened',
] as const;
export const ConditionTypeSchema = z.enum(CONDITION_TYPES);
export type ConditionType = z.infer<typeof ConditionTypeSchema>;
```

### ConditionDuration (in `@ironyard/shared`)

Discriminated union on `kind`:

```ts
export const ConditionDurationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('EoT') }),
  z.object({ kind: z.literal('save_ends') }),
  z.object({ kind: z.literal('until_start_next_turn'), ownerId: z.string().min(1) }),
  z.object({ kind: z.literal('end_of_encounter') }),
  z.object({ kind: z.literal('trigger'), description: z.string().min(1).max(200) }),
]);
```

### ConditionSource (in `@ironyard/shared`)

```ts
export const ConditionSourceSchema = z.object({
  kind: z.enum(['creature', 'effect']),
  id: z.string().min(1),
});
```

### ConditionInstance (in `@ironyard/shared`)

```ts
export const ConditionInstanceSchema = z.object({
  type: ConditionTypeSchema,
  source: ConditionSourceSchema,
  duration: ConditionDurationSchema,
  appliedAtSeq: z.number().int().nonnegative(),
  // `removable: false` is currently only used for the dying-induced Bleeding,
  // which is a slice-6 concept; default true.
  removable: z.boolean().default(true),
});
```

### Participant extension (in `@ironyard/shared/participant.ts`)

Add `conditions: z.array(ConditionInstanceSchema).default([])`. Existing payloads that omit `conditions` still parse (default kicks in), so this slice doesn't break slice 3's BringCharacterIntoEncounter shape.

## Intents

### SetCondition

Payload:
```ts
{
  targetId: string;
  condition: ConditionType;
  source: ConditionSource;
  duration: ConditionDuration;
}
```

Reducer:
1. Validate payload + active encounter + target exists.
2. Compute next `conditions` array for the target:
   - If a matching `{type === condition, source.id === source.id}` already exists → no-op (idempotent).
   - If condition ∈ {Frightened, Taunted} and any existing instance of that type has a *different* `source.id` → drop that older instance, then append the new one.
   - Otherwise append a new `ConditionInstance` with `appliedAtSeq = state.seq + 1` and `removable = true`.
3. Replace the target in `participants[]` immutably.

### RemoveCondition

Payload:
```ts
{
  targetId: string;
  condition: ConditionType;
  sourceId?: string;     // if present, remove only the instance from this source; else remove all of this type
}
```

Reducer:
1. Validate.
2. Filter the target's `conditions` array:
   - If `sourceId` supplied: drop entries where `type === condition && source.id === sourceId`.
   - Else: drop all entries where `type === condition`.
3. Skip entries whose `removable === false` (defensive — slice 5 never sets that).

### RollResistance

Payload:
```ts
{
  characterId: string;     // the participant rolling the save
  effectId: string;        // the condition source.id this save targets
  rolls: { d10: number };  // single d10, 1..10 (per canon §3.3 — not a power roll)
}
```

Reducer:
1. Validate payload + active encounter + target exists.
2. Find the matching condition: any `ConditionInstance` on the target where `duration.kind === 'save_ends' && source.id === effectId`.
3. If d10 ≥ 6: remove the matching condition.
4. If d10 < 6: leave it; log the failed save.
5. If no matching condition: log a warning (`no_matching_condition`) but don't error — the client may have raced.

## Module layout (additions)

```
packages/shared/src/
├── condition.ts                 # ConditionTypeSchema, ConditionDurationSchema,
│                                # ConditionSourceSchema, ConditionInstanceSchema
├── participant.ts               # extended with conditions: ConditionInstance[]
└── intents/
    ├── set-condition.ts
    ├── remove-condition.ts
    └── roll-resistance.ts

packages/rules/src/intents/
├── set-condition.ts
├── remove-condition.ts
└── roll-resistance.ts
```

`packages/rules/src/reducer.ts` adds the three new cases. `packages/rules/src/types.ts` is unchanged (Participant is imported from @ironyard/shared).

## Wire format

No envelope schema changes. `dispatch` carries the new intent types; `applied` broadcasts them.

`IntentTypes` adds `SetCondition`, `RemoveCondition`, `RollResistance`.

## Permissions

- `SetCondition`, `RemoveCondition`, `RollResistance`: any connected member can dispatch (matches the rest of Phase 1 — director/player gates land later).
- None of the three are server-only; they don't go in `SERVER_ONLY_INTENTS`.

## Testing

`packages/rules/tests/`:
- `reducer-conditions.spec.ts` — ~20 tests covering:
  - SetCondition appends new instance with correct appliedAtSeq
  - Same {type, sourceId} is idempotent
  - Different source on same type → both instances kept (binary effect via the canonical interpretation per Q8)
  - Frightened replaces from different source; same source idempotent
  - Taunted same replacement rule
  - RemoveCondition without sourceId clears all of type
  - RemoveCondition with sourceId removes just that one
  - RollResistance with d10 ≥ 6 removes save_ends condition
  - RollResistance with d10 < 6 leaves it
  - RollResistance for a non-matching effectId is a no-op
  - All three intents require an active encounter + target exists
  - Bad payloads are rejected with `invalid_payload`

`packages/shared/tests/`:
- `condition.spec.ts` — ~6 tests covering the schemas (enum closure, duration discrimination, source kinds).

## Constraints for the agent

- **Touch only `packages/shared` and `packages/rules`.** Do not modify `apps/web`, `apps/api`, or `packages/data`.
  - Exception: if you find a typo or obvious issue in the live DO that *blocks* tests, fix it minimally and call it out in your summary.
- Follow the existing per-handler pattern (validate payload → guard active encounter → guard target → mutate state immutably → return result).
- All handlers are pure. No `Date.now()`, no `Math.random()`. The intent's `timestamp` is provided by the DO.
- Run the full verification baseline before declaring done: `pnpm typecheck`, `pnpm lint`, `pnpm test`. Existing test count is **154**; this slice should land at **~180** (added ~26 across reducer + shared).

## Expected output (return summary)

1. List of files added/modified.
2. New test count and grand total.
3. Any deviations from the spec (with reasoning).
4. Any caveats or follow-ups for slice 6 (the hook system).
