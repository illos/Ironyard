# Phase 2b Group A + B — Conditional/triggered ancestry attachments + schema completeness batch — Design

**Date:** 2026-05-16
**Status:** Brainstorm complete (see conversation 2026-05-16); awaiting plan.
**Sub-epics covered:** 2b.1, 2b.3, 2b.4, 2b.8 (combined Group A + Group B per [phases.md § Phase 2b — Proposed shipping grouping](../../phases.md#proposed-shipping-grouping-post-2026-05-16-dual-audit))
**Cross-references:**
- [2026-05-16 Phase 2b canon audit](../notes/2026-05-16-phase-2b-canon-audit.md) — authoritative per-trait / per-kit classification tables.
- [2026-05-16 Phase 2b shipped-code audit](../notes/2026-05-16-phase-2b-shipped-code-audit.md) — context on what 2b.12-2b.16 already shipped and the patterns they established.
- [rules-canon.md § 10.16](../../rules-canon.md) carry-overs are the canon entries this spec closes.

## Why combined

Groups A and B were originally separate (A = 2b.4 conditional/triggered ancestry attachments; B = 2b.1 + 2b.3 + 2b.8 schema completeness). The 2026-05-16 canon audit reclassified Revenant *Bloodless* out of A (it's a flat `condition-immunity`, not a save modifier) into B, narrowing A to two attachments (Devil/Dragon Knight *Wings* + Orc *Bloodfire Rush*). Three of B's ancestry signature traits (Orc *Relentless*, Memonek *Fall Lightly*, Memonek *Lightweight*) explicitly need the runtime-eval seam A is building. Both groups touch the same `AttachmentEffect` / `AttachmentCondition` schema files, the same override files, and the same applier. Shipping them together means one round of typing instead of two, one fixture sweep instead of two.

11 deliverable sub-slices total. Each ships as its own bisect-friendly commit on one branch.

## Architecture decisions (from brainstorm)

### A1. Runtime-eval seam shape — hybrid, no `AttachmentCondition` extension

Three discrete additions, no extension to `AttachmentCondition`:

1. **`packages/rules/src/ancestry-triggers/`** — new directory mirroring `class-triggers/`. Per-trait files subscribe to existing event reducers (`StaminaTransitioned`, `ApplyCondition`, `apply-damage` tail, `EndRound`). Fires-on-event traits live here.

2. **New per-encounter participant fields** as serializable source of truth:
   - `movementMode: { mode: 'flying' | 'shadow', roundsRemaining: number } | null`
   - `bloodfireActive: boolean`
   - `conditionImmunities: ConditionType[]` (snapshotted from `CharacterRuntime` at `StartEncounter`, mirrors `immunities` / `weaponDamageBonus`)
   - `disengageBonus: number`, `meleeDistanceBonus: number`, `rangedDistanceBonus: number` (same snapshot pattern)

3. **Read-site helpers** in `packages/rules/src/effective.ts` (new file): `getEffectiveSize`, `getEffectiveWeaknesses`, `getEffectiveSpeed`, `isImmuneToCondition`. Consumers replace direct field reads with helper calls.

**Rejected: a generic `AttachmentCondition` runtime-eval variant.** The applier (`applyAttachments` in `packages/rules/src/attachments/apply.ts`) doesn't see `Participant` today; making it participant-aware would require re-derivation at every state change OR every consumer paying re-derivation cost. The hybrid approach reuses the proven `class-triggers/` infrastructure, keeps `Participant` as serializable D1-snapshottable source of truth, and bounds the touchpoints to the actually-affected consumers (only ~4 read sites + ~4 trigger sites in this slice).

### A2. Fall trigger semantics — subscribe to Prone-add

A flying participant falls when **Prone is added to them, regardless of cause**. Caught via `ancestry-triggers/wings.ts` subscribing to `ApplyCondition { type: 'prone' }` and to `applyTransitionSideEffects` (KO and inert both add Prone in slice 2b.15). Speed-0 detection deferred — no consumer reads "speed went to 0 this tick" today.

`Fall` (emitted as a derived `EndFlying { reason: 'fall' }` intent) clears `movementMode`, leaves Prone in place, logs `"fell from {roundsRemaining} rounds aloft"`. **Does not apply fall damage** — the engine doesn't track altitude in squares, so director adjudicates per memory `project_no_movement_tracking`.

`StartFlying` is blocked when `staminaState ∉ {'healthy', 'winded'}`. Director can override via `source: 'server'` (same pattern as 2b.14's `SetTargetingRelation` permission bypass).

### A3. `condition-immunity` — additive, single-condition entries, generalized read site

- **Schema shape:** `AttachmentEffect { kind: 'condition-immunity', condition: ConditionType }` — one entry per trait, mirroring canon authorship. Multi-condition shape considered and rejected — no current trait grants more than one condition's immunity.
- **Accumulation:** applier dedupes onto `runtime.conditionImmunities: ConditionType[]` via the existing array-dedupe pass at `apply.ts:45`. Set-union semantics across all sources (additive, no last-write-wins).
- **Snapshot:** mirrored to `participant.conditionImmunities` at `StartEncounter`, parallel to `immunities` / `weaknesses`.
- **Read site:** new `isImmuneToCondition(p, cond)` helper called from every condition-application path:
  - `ApplyCondition` reducer (player/director-dispatched)
  - `applyTransitionSideEffects` engine-applied dying→Bleeding (generalizes 2b.15's Bloodless-specific suppression)
  - `applyTransitionSideEffects` engine-applied KO→Prone, inert→Prone
  - Future condition-application sites pick up the check for free

### A4. Disengage — data-only, no intent

Per memory `project_no_movement_tracking` ("the app doesn't track movement or spacing — surface intent only"), Disengage ships as:

- `Kit.disengageBonus: number` (parser regex from kit MD)
- Collector emits `AttachmentEffect { kind: 'disengage-bonus', delta }`
- `CharacterRuntime.disengageBonus: number` (applier sums)
- `participant.disengageBonus` snapshot at `StartEncounter`
- UI surfaces "Disengage: shift {1 + disengageBonus}" on the move-action card

**No `Disengage` intent, no `Shift` intent, no OA suppression.** Player flags intent at the table; presses the existing "Done moving" toggle for `turnActionUsage.move`. Verbal attribution. The OA-suppression mechanic that's Disengage's canonical point is meaningless in v1 because the engine has no OA system yet (per shipped-code audit: no OA reducer in `packages/rules/src/intents/`). When OA infrastructure arrives (Phase 2b.9 / Group E trigger-cascade), `Disengage` intent + OA suppression layer on then.

## Schema changes

All additive; defaults preserve existing fixtures and snapshots.

### `packages/shared/src/data/attachment.ts` — `AttachmentEffect` discriminated union gains

```ts
| { kind: 'stat-mod', stat, delta }                            // existing
| { kind: 'stat-mod-echelon', stat, perEchelon: [n,n,n,n] }   // NEW — split into its own kind for Zod discriminator ergonomics
| { kind: 'immunity', damageKind, value: number | 'level' }    // existing
| { kind: 'immunity', damageKind, value: { kind: 'level-plus', offset: number } }  // NEW — variant on existing kind via union
| { kind: 'condition-immunity', condition: ConditionType }     // NEW
| { kind: 'grant-skill-edge', skillGroup: string }             // NEW — Glamors
| { kind: 'weapon-distance-bonus', appliesTo: 'melee' | 'ranged', delta: number }  // NEW
| { kind: 'disengage-bonus', delta: number }                   // NEW
```

> Implementation note: if Zod's discriminated-union ergonomics complain about a union inside an existing `kind`'s `value` field, the `level-plus` variant gets its own kind (`immunity-level-plus`). Discover during impl; not architectural.

### `packages/shared/src/data/kit.ts` — Kit gains

```ts
meleeDistanceBonus: number     // default 0
rangedDistanceBonus: number    // default 0
disengageBonus: number         // default 0
```
(`rangedDamageBonusPerTier` already exists from Epic 2C.)

### `packages/shared/src/participant.ts` — ParticipantSchema gains

```ts
movementMode: z.object({
  mode: z.enum(['flying', 'shadow']),
  roundsRemaining: z.number().int().min(0),
}).nullable().default(null),

bloodfireActive: z.boolean().default(false),

conditionImmunities: z.array(ConditionTypeSchema).default([]),

disengageBonus: z.number().int().min(0).default(0),
meleeDistanceBonus: z.number().int().min(0).default(0),
rangedDistanceBonus: z.number().int().min(0).default(0),
```

### `packages/shared/src/derive-character-runtime.ts` — CharacterRuntime gains

The matching scalar fields plus per-echelon `stat-mod` handling that consumes `character.level` to pick `perEchelon[echelonIndex]` where `echelonIndex = level >= 10 ? 3 : level >= 7 ? 2 : level >= 4 ? 1 : 0`.

### New intents (`packages/rules/src/intents/`)

- `StartFlying { participantId }` — sets `movementMode = { mode: 'flying', roundsRemaining: max(1, character.mightScore) }`. Permission: `staminaState ∈ {'healthy', 'winded', 'doomed'}` for player-dispatched; any state for `source: 'server'`.
- `EndFlying { participantId, reason: 'voluntary' | 'fall' | 'duration-expired' }` — clears `movementMode`. When `reason === 'fall'`, also ensures Prone is present (idempotent — Prone may already be the cause).
- *Shadowmeld* reuses `StartFlying { mode: 'shadow' }`. Open: Shadowmeld has no canonical round-duration in canon — schema allows `roundsRemaining: 0` as sentinel "no countdown" OR Polder Shadowmeld dispatches a separate `StartShadowmeld` intent that omits the duration field. Pick during impl based on what reads cleanest from the override files.

**Intentionally NOT added in this group:** `Disengage`, `Shift`, `Move`, any OA reducer.

## Sub-slice plan (11 deliverables, sequenced)

Branch: one branch off `master`. Sequential commits per sub-slice for bisect. Commit message convention: `feat(rules,...): <subject> (Phase 2b 2b.X-Y)` mirroring 2b.12-2b.16 style.

### Slice 1 — Schema-shape lift (foundation)

**Files:** `packages/shared/src/data/attachment.ts`, `packages/shared/src/data/kit.ts`, `packages/shared/src/participant.ts`, `packages/shared/src/derive-character-runtime.ts`, `packages/rules/src/attachments/apply.ts`

**What:** all schema additions above. Applier learns to handle the new effect kinds (single-stage fold, no behavior change for traits that don't yet have overrides using them).

**Acceptance:**
- `pnpm typecheck` clean repo-wide
- `pnpm test` repo-wide green (no behavioral change yet)
- Existing fixtures parse with defaults
- New effect kinds round-trip through Zod parse

### Slice 2 — `condition-immunity` effect kind + Bloodless reclassify + 5 other immunities

**Files:** `packages/data/overrides/ancestry-traits.ts`, `packages/rules/src/effective.ts` (new), `packages/rules/src/stamina.ts` (replace Bloodless special-case from 2b.15 with generalized helper), `packages/rules/src/intents/apply-condition.ts`

**What:** 6 ancestry-trait overrides (Bloodless = bleeding, Great Fortitude = weakened, Polder Fearless = frightened, Orc Nonstop = slowed, Memonek Nonstop = slowed, High Elf Unstoppable Mind = dazed, Memonek Unphased = surprised). New `isImmuneToCondition(p, cond)` helper consumed by `ApplyCondition` reducer and `applyTransitionSideEffects`.

**Acceptance:**
- Existing 2b.15 Bloodless×dying-Bleeding suppression test still green (now via helper, not special-case)
- New tests: each of the 6 traits blocks its named condition from being applied via `ApplyCondition`
- Engine-applied conditions (Prone from KO, Bleeding from dying) respect immunities
- `conditionImmunities` snapshots to participant at `StartEncounter`

### Slice 3 — Per-echelon `stat-mod`

**Files:** `packages/shared/src/derive-character-runtime.ts` (echelon tier picker), `packages/data/overrides/ancestry-traits.ts` (Spark Off Your Skin override), `packages/data/overrides/ancestry-traits.ts` (Wyrmplate, Psychic Scar to use new shape)

**What:** Dwarf Spark Off Your Skin = +6/+12/+18/+24 stamina at L1/L4/L7/L10. Wyrmplate and Psychic Scar migrated to the same shape (each currently ships L1 baseline only; canon scales).

**Acceptance:**
- L1 Dwarf with Spark Off Your Skin: +6 stamina; L4: +12; L7: +18; L10: +24
- Wyrmplate / Psychic Scar match canon at all four echelons
- `pnpm test` green; no regression on existing static `stat-mod` shape

### Slice 4 — `level-plus` immunity

**Files:** `packages/shared/src/data/attachment.ts` (variant lift if not done in slice 1), `packages/rules/src/attachments/apply.ts` (resolveLevel extends), `packages/data/overrides/ancestry-traits.ts` (Polder Corruption Immunity)

**What:** extend `immunity.value` to accept `{ kind: 'level-plus', offset: number }`. Polder Corruption Immunity override changes from `value: 'level'` to `value: { kind: 'level-plus', offset: 2 }`.

**Acceptance:**
- L1 Polder = corruption immunity 3; L5 = 7; L7 = 9; L10 = 12
- Existing `value: 'level'` immunities (if any) unchanged

### Slice 5 — `grant-skill-edge` + Glamors

**Files:** `packages/shared/src/data/attachment.ts` (effect kind), `packages/shared/src/derive-character-runtime.ts` (`skillEdges` accumulator), `packages/data/overrides/ancestry-traits.ts` (Wode Elf Glamors all skill groups, High Elf Glamors one skill group), `packages/rules/src/intents/roll-power.ts` (skill-roll edge consumer if not already in place)

**What:** new effect kind grants edge on a named skill group. Glamors traits override.

**Acceptance:**
- Wode Elf has edge on all skill groups; High Elf has edge on one player-picked skill group
- Skill rolls apply the edge in `RollPower` output

### Slice 6 — `movementMode` primitive + Wings (Devil + Dragon Knight)

**Files:** `packages/shared/src/participant.ts` (already done in slice 1), `packages/rules/src/intents/start-flying.ts` (new), `packages/rules/src/intents/end-flying.ts` (new), `packages/rules/src/ancestry-triggers/` (new directory), `packages/rules/src/ancestry-triggers/index.ts` (dispatcher), `packages/rules/src/ancestry-triggers/wings.ts`, `packages/rules/src/effective.ts` (`getEffectiveWeaknesses`), `packages/rules/src/intents/apply-damage.ts` (consume helper), `packages/rules/src/intents/turn.ts` (EndRound calls ancestry-triggers dispatcher)

**What:** elective `StartFlying` / `EndFlying` intents; `wings.ts` subscribes to `ApplyCondition { type: 'prone' }` and to KO/inert prone-add, emits derived `EndFlying { reason: 'fall' }`; EndRound decrements `roundsRemaining`, fires `EndFlying { reason: 'duration-expired' }` at 0; `getEffectiveWeaknesses` adds `{ kind: 'fire', value: 5 }` when `movementMode.mode === 'flying' && level <= 3 && (purchasedTraits includes 'devil-wings' or 'dragonknight-wings')`.

**Acceptance:**
- Devil/Dragon Knight can elect to fly; `roundsRemaining` initialized from `mightScore` (min 1)
- Becoming Prone (any cause) while flying → fall (EndFlying { reason: 'fall' }); Prone persists; log entry recorded
- EndRound decrements `roundsRemaining`; at 0 → fall (EndFlying { reason: 'duration-expired' })
- L1-3 flying Devil takes fire damage with `weakness 5` applied; L4+ does not
- `StartFlying` blocked when `staminaState ∈ {'dying', 'dead', 'unconscious', 'inert', 'rubble'}` for player-dispatched (i.e. allowed when `staminaState ∈ {'healthy', 'winded', 'doomed'}` — doomed is canon-active per Title Doomed); director override via `source: 'server'`

### Slice 7 — Polder Shadowmeld

**Files:** `packages/data/overrides/ancestries.ts` (Shadowmeld activates `StartFlying { mode: 'shadow' }`), `packages/rules/src/intents/start-flying.ts` (handle `mode === 'shadow'` — sentinel duration or separate intent path per architectural pick during slice 6)

**What:** reuse the movement-mode primitive with `mode: 'shadow'`. Narrative-tagged active ability registered alongside (already in slice 1 pattern via `activeAbilities`).

**Acceptance:**
- Player can toggle Shadowmeld through the same UI path as Wings; movementMode reflects `'shadow'`
- Shadowmeld does NOT trigger Wings fire-weakness (read-site helper gated on `mode === 'flying'`)

### Slice 8 — Orc Bloodfire Rush

**Files:** `packages/rules/src/ancestry-triggers/bloodfire.ts` (new), `packages/rules/src/effective.ts` (extend `getEffectiveSpeed`), `packages/rules/src/intents/apply-damage.ts` (tail-call ancestry-triggers dispatcher), `packages/rules/src/intents/turn.ts` (EndRound clears `bloodfireActive`)

**What:** `bloodfire.ts` subscribes to `apply-damage` tail (delivered damage > 0); if `!participant.bloodfireActive`, sets it true. `EndRound` clears. `getEffectiveSpeed` adds +2 when `bloodfireActive`.

**Acceptance:**
- First time Orc takes damage in a round → `bloodfireActive = true`, effective speed +2 until end of round
- Second damage same round → no double-bump (latch holds)
- EndRound → `bloodfireActive = false`
- Doesn't fire for non-Orcs; doesn't fire for Orcs without the trait

### Slice 9 — 3 ancestry sig-traits riding triggers

**Files:** `packages/rules/src/ancestry-triggers/{relentless,fall-lightly,lightweight}.ts`, `packages/rules/src/effective.ts` (`getEffectiveSize`), wherever forced-move resolution reads target size

**What:** per-trait files using the triggers infra from slice 6/8. Memonek Lightweight is read-site-only (size for forced move).

**Open canon questions for each — re-read during impl, surface to user with printed book if ambiguous:**
- Orc Relentless: exact effect on entering dying state
- Memonek Fall Lightly: exact effect on falling event
- Memonek Lightweight: confirm "one size smaller" applies to *forced movement only* or other size-dependent reads too

**Acceptance:**
- Each trait canon-correct on TDD red→green; canon citations in test names
- Lightweight applied at forced-move read site only (or wider per canon)

### Slice 10 — Distance bonus (melee + ranged) + ranged-damage RollPower read-site fix (2b.3.a)

**Files:** `packages/data/src/parse-kit.ts` (regex for "Melee/Ranged Distance Bonus" lines), `packages/rules/src/attachments/collectors/kit.ts` (emit `weapon-distance-bonus`), targeting layer that computes ability distances (find via grep `Melee N` / `Ranged N`), `packages/rules/src/intents/roll-power.ts` (verify ranged-damage branch isn't melee-only-gated; fix if so)

**What:** parser extracts both distance flavors. Collector emits effects. Targeting layer adds `participant.{melee,ranged}DistanceBonus` to base `Melee N` / `Ranged N` for non-signature weapon abilities. **AoE sizes (burst/cube/wall) NOT affected** — canon-explicit. **Signature abilities** that bake in the bonus get a sentinel pass-through. Plus the 2b.3.a fix to the `RollPower` ranged branch.

**Acceptance:**
- A non-signature non-AoE Ranged-keyword weapon ability on an Arcane Archer gets +10 to its ranged distance (Arcane Archer's `rangedDistanceBonus`)
- A burst/cube/wall AoE ability stays the same size regardless of distance bonus (AoE size excluded per canon)
- Signature abilities whose distance + damage already bake in the kit bonus do NOT double-add (canon caveat — Kits.md:142-146)
- Ranged kit damage bonus from `weapon-damage-bonus { appliesTo: 'ranged' }` reaches roll output (parser + collector already done from Epic 2C; verify `RollPower` ranged branch isn't gated melee-only and fix if so)

### Slice 11 — `disengage-bonus` data-only

**Files:** `packages/data/src/parse-kit.ts` (regex), `packages/rules/src/attachments/collectors/kit.ts` (emit), participant snapshot at `StartEncounter`, UI move-action card

**What:** 13 kits surface +1 disengage. UI shows "Disengage: shift {1 + bonus}" on the move-action card. No intent, no OA logic, no engine consumption beyond display.

**Acceptance:**
- All 13 kits parse `+1 disengage bonus`
- `participant.disengageBonus` reads 1 for characters with one of those kits, 0 otherwise
- Combat UI shows "Disengage: shift 2" on the move action for those characters
- Sheet shows the bonus on the kit summary

## Parallelization (per memory `feedback_parallel_agents_for_disjoint_slices`)

After slice 1 (schema lift) lands, the following can be dispatched as **worktree-isolated agents in one message** because their override files / touched files are disjoint:

- Slice 2 (condition-immunity) — `ancestry-traits.ts` + `effective.ts` + `stamina.ts`
- Slice 3 (per-echelon) — `ancestry-traits.ts` (different traits) + `derive-character-runtime.ts`
- Slice 4 (level-plus immunity) — `ancestry-traits.ts` (Polder only) + `apply.ts`
- Slice 5 (grant-skill-edge) — `ancestry-traits.ts` (Glamors) + `derive-character-runtime.ts` + `roll-power.ts`
- Slice 10 + slice 11 — both touch `parse-kit.ts` + kit collector; can pair as a single agent or sequential.

Slices 6 → 7 → 8 → 9 are sequential (7 reuses 6's primitive; 8 and 9 use the triggers infra 6 introduces).

## Acceptance (whole group)

- All 11 sub-slices either ✅ shipped or explicitly deferred with reasoning in a PS section
- `pnpm test` repo-wide green (target: 1774+ tests pre-batch → 1850+ post-batch with new coverage)
- `pnpm typecheck` clean repo-wide
- `pnpm lint` clean for files touched in this group
- `docs/phases.md` rows 2b.1, 2b.3, 2b.4, 2b.8 flipped to ✅
- `docs/rules-canon.md § 10.16` entries for each shipped mechanic pass Gate 1 (source check) AND Gate 2 (user review with printed book)
- Interpretive judgment calls (if any) recorded in `docs/rule-questions.md` and cited from canon entries

## Verification gates (per commit)

```
pnpm test            # all green
pnpm typecheck       # clean
pnpm lint            # files YOU touched have no new lint issues
```

For any UI work in slice 10/11 (move-action card surface): screenshot at iPad-portrait (810×1080) and iPhone-portrait (390×844) per CLAUDE.md.

## Out-of-scope explicit

- `Disengage` / `Shift` / `Move` intents (deferred per Q4)
- OA reducer / OA suppression (deferred to Phase 2b.9 / Group E trigger-cascade)
- Speed-0 detection as a fall trigger (deferred per Q2 — no consumer reads speed deltas today)
- Fall damage computation (deferred per `project_no_movement_tracking` — no altitude tracking)
- Item-side conditional/triggered attachments (Color Cloak, Encepter, Mortal Coil) — Phase 2e
- Save modifiers (Devil Impressive Horns, High/Wode Elf Otherworldly Grace, Dragon Knight Remember Your Oath) — different shape, separate slice
- Class-feature choice pipeline (2b.7) — Group D
- Trigger cascade substrate (2b.9) — Group E
- 2b.5 damage-engine cleanup punch-list — Group C (mostly shipped via 2b.15)

## PS section

Append numbered entries here as post-shipping fixes land, per memory `feedback_post_shipping_fixes_ps_section`. Each entry: symptom + fix + commit SHA. Bump acceptance criteria if user-visible flows change.

### PS#1 — Slice 3 canon correction (2026-05-16, pre-implementation)

**Symptom:** Spec § "Sub-slice plan: Slice 3" and § "Schema changes" referenced Wyrmplate and Psychic Scar as sharing the per-echelon `stat-mod-echelon` shape (citing the 2026-05-16 canon audit). On verification against `.reference/data-md/Rules/Ancestries/Dragon Knight.md` and `.reference/data-md/Rules/Ancestries/Time Raider.md`, both traits are actually **level-scaling damage immunities**, not per-echelon stat-mods:

- **Wyrmplate** (Dragon Knight signature): *"damage immunity equal to your level to one of the following damage types: acid, cold, corruption, fire, lightning, or poison"* — already correctly modeled in `ancestries.ts` via `collectFromAncestry`'s special-cased `ancestryChoices` path (player-chosen damage type, value = level).
- **Psychic Scar** (Time Raider signature): *"psychic immunity equal to your level"* — already correctly modeled at `packages/data/overrides/ancestries.ts:35-37` as `grantedImmunities: [{ kind: 'psychic', value: 'level' }]`.

The audit conflated *level-scaling* (monotonic with level, no echelon jumps) with *per-echelon scaling* (discrete jumps at L4/L7/L10). They are different shapes.

**Fix:** Slice 3 scope narrows to **Spark Off Your Skin only** — the single Draw Steel ancestry trait that genuinely fits `stat-mod-echelon`. Wyrmplate + Psychic Scar drop from this slice (they already work via the existing immunity machinery and need no migration). The `stat-mod-echelon` schema variant is still useful — future items (per-tier leveled armor scaling, etc.) may use it — and Spark Off Your Skin alone validates the shape end-to-end.

**Acceptance criteria update:** Slice 3 acceptance becomes "L1 Dwarf = +6 maxStamina; L4 = +12; L7 = +18; L10 = +24." Wyrmplate + Psychic Scar acceptance lines dropped.

### PS#2 — Slice 5 canon correction + infrastructure gap (2026-05-16, pre-implementation)

**Symptom:** Spec § "Sub-slice plan: Slice 5" and § A1 framing referenced Wode Elf Glamor as "edge on all skill groups" and High Elf Glamor as "edge on one player-picked skill group" (citing the 2026-05-16 canon audit). On verification:

- **Wode Elf Glamor** (signature): *"You gain an edge on tests made to hide and sneak, and tests made to search for you while you are hidden take a bane."* — Two effects: (a) self-edge on Hide + Sneak; (b) others'-bane on Search targeting hidden user. Effect (b) is a **contextual / triggered debuff applied to OTHERS** — needs trigger-cascade infrastructure (Phase 2b.9 / Group E).
- **High Elf Glamor** (signature): *"granting you an edge on Presence tests using the Flirt or Persuade skills"* — edge on **Presence-characteristic** tests specifically when using the **Flirt OR Persuade** skill. The characteristic + skill compound condition is more nuanced than a flat skill-group edge.

Plus an infrastructure gap surfaced by the slice 5 dispatch attempt: **signature traits without active abilities don't fold through `packages/data/overrides/ancestry-traits.ts`** (which keys on purchased trait ids via `character.ancestryChoices.traitIds`). Signature traits are auto-granted per ancestry and need to be wired through `packages/data/overrides/ancestries.ts` (the per-ancestry override map) — either via direct field overrides like `grantedImmunities` or a new attachment-emitting path. Current Wode Elf and High Elf entries in `ancestries.ts` are empty `{}`.

**Fix:** **Slice 5 is DEFERRED out of this group.** Reasoning:
- Both Glamors involve mechanics that don't cleanly fit `grant-skill-edge { skillGroup }` as-specified (Wode Elf needs skill-name granularity + contextual bane; High Elf needs characteristic + skill compound).
- The contextual-bane-on-others requires trigger-cascade infrastructure (Phase 2b.9 / Group E) to model correctly.
- Wiring signature-trait `CharacterAttachment[]` emission through `ancestries.ts` is a non-trivial extension that should be designed alongside the other signature-trait gaps from 2b.8 (Polder Shadowmeld, Human Detect the Supernatural, Dwarf Runic Carving, etc.) rather than as a one-off for Glamors.

The `grant-skill-edge` AttachmentEffect schema variant from slice 1 stays in place — unused for now, available when a future slice (likely in Phase 2b.9 + signature-trait-emission groundwork) revisits both Glamors plus the other signature-trait gaps.

**Acceptance criteria update:** Slice 5 dropped from Group A+B acceptance. Group acceptance becomes "10 sub-slices ✅-or-deferred" instead of 11. The two affected `docs/phases.md` rows (2b.1, 2b.8) still flip to ✅ because Group A+B closes the *modelable-today* surface; the Glamors + other signature-trait-emission work moves to a new follow-up sub-epic to be created when revisited.
