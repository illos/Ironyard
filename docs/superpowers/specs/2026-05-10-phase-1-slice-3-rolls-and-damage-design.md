---
name: Phase 1 slice 3 — rolls and damage
description: First combat primitive — RollPower resolution, ApplyDamage pipeline, Participant model, encounter intents
type: spec
---

# Phase 1 slice 3 — rolls and damage

## Goal

Ship the first combat primitive end-to-end: a player can dispatch a power roll against a target and the engine applies the resulting damage, with the target's stamina reflecting the change. This unlocks every subsequent combat-engine slice.

## What's in / out

**In:**
- `Participant` model in `SessionState`: id, name, kind, characteristics, currentStamina/maxStamina, immunities, weaknesses
- New intents: `StartEncounter`, `BringCharacterIntoEncounter`, `RollPower`, `ApplyDamage` (derived)
- Power roll resolution per `rules-canon.md §1.8` subset (no critical hits, no auto-tier, no downgrade, no bonuses/penalties)
- Damage pipeline per `rules-canon.md §2.12` subset (no temp stamina, no state transitions, no multi-type)
- `DamageType` enum in `@ironyard/shared` (closed 10-value set per pre-Phase-0 #4)

**Deferred to slice 4+:**
- Critical hits (nat-19/20 + Main-action ability → extra action) — § 1.9
- Auto-tier outcomes — § 1.6
- Voluntary downgrade — § 1.7
- Bonuses + penalties from skills — § 1.5
- External damage modifiers (halving etc.) — § 2.2
- Temporary stamina drain
- Stamina state transitions (winded / dying / dead)
- Multi-type damage from a single source — Q6
- `RollTest`, `RollResistance`, `RollOpposedTest`, `RollFreeStrike`
- Ability registry lookup — for now, the ability's tier ladder lives in the `RollPower` payload, supplied by the dispatcher (web client or system)
- Initiative ordering

## Data shapes

### DamageType (in `@ironyard/shared`)

```ts
const DAMAGE_TYPES = [
  'fire', 'cold', 'holy', 'corruption', 'psychic',
  'lightning', 'poison', 'acid', 'sonic', 'untyped',
] as const;
export const DamageTypeSchema = z.enum(DAMAGE_TYPES);
export type DamageType = z.infer<typeof DamageTypeSchema>;
```

Per pre-Phase-0 #4, this enum is closed and ingest-validated.

### Characteristic

```ts
export const CharacteristicSchema = z.enum(['might', 'agility', 'reason', 'intuition', 'presence']);
export type Characteristic = z.infer<typeof CharacteristicSchema>;

export const CharacteristicsSchema = z.object({
  might: z.number().int().min(-5).max(5),
  agility: z.number().int().min(-5).max(5),
  reason: z.number().int().min(-5).max(5),
  intuition: z.number().int().min(-5).max(5),
  presence: z.number().int().min(-5).max(5),
});
```

Range matches canon `§1.1` — characteristic score range `−5..+5`.

### TypedResistance

```ts
export const TypedResistanceSchema = z.object({
  type: DamageTypeSchema,
  value: z.number().int().min(0),
});
```

Used for both immunities (subtracts on incoming damage) and weaknesses (adds).

### Participant (in `@ironyard/rules`)

```ts
type Participant = {
  id: string;                            // unique within SessionState
  name: string;
  kind: 'pc' | 'monster';
  currentStamina: number;                // can floor at 0 in this slice
  maxStamina: number;
  characteristics: Characteristics;
  immunities: TypedResistance[];
  weaknesses: TypedResistance[];
};
```

### SessionState extension

```ts
type SessionState = {
  // ... existing
  activeEncounter: { id: string; participants: Participant[] } | null;
};
```

Stays null until `StartEncounter` fires. Encounter ends via `EndEncounter` (deferred — not in this slice; slice 4 will add it).

## Intents

### StartEncounter

Payload: `{ encounterId: string }`.

Initialize `activeEncounter = { id: encounterId, participants: [] }`. Idempotent if the same `encounterId` is already active. Rejects with `'encounter_active'` if a *different* encounter is already running (no implicit close).

### BringCharacterIntoEncounter

Payload: full `Participant` envelope. The dispatcher (web client) builds the stat block — for PCs from form input, for monsters by reading `monsters.json` and filling in defaults the engine doesn't have yet (stamina, immunities, etc. land in a future data slice). This sidesteps the chicken-and-egg of the data pipeline only shipping id/name/level.

Effect: appends to `activeEncounter.participants`. Rejects with `'no_active_encounter'` if `activeEncounter === null`, `'duplicate_participant'` if an id collision exists, `'invalid_payload'` if the participant fails schema validation.

### RollPower

Payload:

```ts
{
  abilityId: string;                     // logged for attribution; engine doesn't look it up yet
  attackerId: string;                    // must be in activeEncounter.participants
  targetIds: string[];                   // each must be in activeEncounter.participants
  characteristic: Characteristic;        // which characteristic to add to the roll
  edges: number;                         // 0..2 (canon §1.4 cap)
  banes: number;                         // 0..2
  rolls: { d10: [number, number] };      // each ∈ 1..10
  ladder: {                              // dispatcher-supplied — see "Out of scope: ability registry"
    t1: { damage: number; damageType: DamageType };
    t2: { damage: number; damageType: DamageType };
    t3: { damage: number; damageType: DamageType };
  };
}
```

Reducer steps (subset of §1.8):

1. Validate: attacker + each target exist in `activeEncounter.participants`; d10 values are 1..10; edges/banes are 0..2.
2. `natural = d10[0] + d10[1]`
3. `characteristicValue = attacker.characteristics[characteristic]`
4. `total = natural + characteristicValue`
5. Cancel edges and banes per §1.4 → `netEdges` ∈ {0,1,2}, `netBanes` ∈ {0,1,2} (one is always 0)
6. If `netEdges === 1`: `total += 2`. If `netBanes === 1`: `total -= 2`.
7. `baseTier = tierFromTotal(total)` per §1.2 (≤11=t1, 12–16=t2, ≥17=t3)
8. If `netEdges >= 2`: `tier = min(t3, baseTier+1)`. Else if `netBanes >= 2`: `tier = max(t1, baseTier−1)`. Else: `tier = baseTier`.
9. If `natural ∈ {19, 20}`: `tier = t3` (overrides step 8)
10. For each `targetId`: emit a derived `ApplyDamage` intent with the tier's `damage` + `damageType`, `sourceIntentId = intent.id`, `causedBy = intent.id`.

Returns: updated state (only seq advance — the damage happens via derived intents), the derived `ApplyDamage[]`, a log entry like `"Alice rolls 14 (t2) vs Goblin 1 → 4 fire"`.

### ApplyDamage (derived only)

Payload: `{ targetId: string; amount: number; damageType: DamageType; sourceIntentId: string }`.

Cannot be dispatched directly by clients (rejected). The reducer emits it from `RollPower`.

Pipeline (subset of §2.12):

1. Find target in `activeEncounter.participants`. If missing, error `target_missing`.
2. `damage = payload.amount`
3. **Weakness**: if any `target.weaknesses` matches `damageType`, sum their `value` and add to `damage`.
4. **Immunity**: if any `target.immunities` matches `damageType`, sum their `value` and subtract from `damage` (floor at 0).
5. `target.currentStamina = max(0, target.currentStamina − damage)`.
6. Append a log entry: `"<name> takes N <type> damage (was M, now M')"`.

## Reducer dispatch

`packages/rules/src/reducer.ts` adds three cases. Per-handler files in `packages/rules/src/intents/`:

- `start-encounter.ts`
- `bring-character-into-encounter.ts`
- `roll-power.ts` — emits derived intents
- `apply-damage.ts`

## DO integration (apps/api)

No structural change. The DO already serializes dispatches through `applyAndBroadcast`. When `RollPower` returns derived intents, the DO needs to process each derived intent through the same pipeline (assign seq, persist, broadcast `applied`).

Current `applyAndBroadcast` doesn't yet handle the `derived` array. Slice 3 adds:

```
applyAndBroadcast(intent):
  result = applyIntent(state, intent)
  if errors: reject; return
  state = result.state
  INSERT intents
  broadcast applied
  for derived in result.derived:
    applyAndBroadcast(derived)   // recursive, each gets its own seq + applied envelope
```

Derived intents inherit:
- `sessionId` from the parent
- `actor` from the parent
- `source = 'auto'`
- `timestamp` from the DO (fresh)
- New `id` from `ulid()`
- `causedBy = parent.id`

The reducer returns derived intents *without* an id / timestamp / sessionId — the DO fills those in. The reducer's `Intent` type for derived needs to be looser (no `id` required). Use `Omit<Intent, 'id' | 'timestamp' | 'sessionId'>` for the derived shape, or define a `DerivedIntent` type in `@ironyard/rules`.

## Permissions

Phase 1 slice 3 keeps the permission model minimal:

- Any connected member can dispatch `StartEncounter`, `BringCharacterIntoEncounter`, `RollPower`.
- Client-dispatched `ApplyDamage` is rejected (`'permission'`) — server-only via derived intents.

Director-vs-player gates land in slice 4+ when participant ownership matters.

## Wire format

No schema change. The intent envelope already supports any `type`. Payload validation is per-handler via Zod.

## Tests

`packages/rules/tests/`:
- `power-roll.spec.ts` — pure power-roll resolution helpers (~10 tests covering edge/bane cancellation, tier thresholds, nat-19/20 override).
- `damage-pipeline.spec.ts` — pure damage application helpers (~6 tests covering weakness add, immunity subtract, immunity zeroes overkill, stamina floor at 0).
- `reducer-encounter.spec.ts` — end-to-end reducer scenarios (~10 tests covering StartEncounter/Bring/RollPower → derived ApplyDamage chain).

`packages/shared/tests/`:
- Add a few `DamageTypeSchema` and `CharacteristicsSchema` validation tests.

**Total new tests**: ~30.

Smoke test extension (in `/tmp/iy-rolls-smoke.mjs`): alice creates encounter, adds two participants (PC + monster), dispatches `RollPower` with controlled d10 values, asserts the derived `ApplyDamage` lands and the monster's stamina drops correctly.

## Risks / open questions

- **Ladder-in-payload trust model**: the dispatcher fills in the tier ladder, so a malicious client could lie ("this ability does 999 damage on t1"). Real fix lands in slice 4+ when abilities live in the data registry and the engine looks them up by id. For Phase 1, friend-group trust per `CLAUDE.md` makes this acceptable.
- **`StartEncounter` with a different active encounter**: rejecting is the safe default. Phase 1 spec implies one encounter at a time per session.
- **Derived-intent recursion depth**: theoretically a derived intent could itself produce derived intents (slice 4 conditions). The DO should bound the depth — slice 3 stays shallow (RollPower → ApplyDamage, no further chain).

## Verification baseline (after slice lands)

- `pnpm typecheck`, `pnpm lint`, `pnpm test` all clean
- ~30 new tests pass
- Manual smoke: create encounter → add two participants → RollPower → applied envelopes show RollPower (seq N) + ApplyDamage (seq N+1) + monster stamina drop in subsequent state
