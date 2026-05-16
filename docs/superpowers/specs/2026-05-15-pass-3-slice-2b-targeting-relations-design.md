# Pass 3 Slice 2b — Targeting Relations (close §5.4 stubs)

**Status:** Designed, awaiting plan.
**Parent:** [Pass 5 Layer 1 Pass 3 — Combat Tracker Realization umbrella](2026-05-15-phase-5-layer-1-base-pass-3-combat-tracker-realization-design.md).
**Predecessor:** [Pass 3 Slice 2a — class-δ triggers + Open Action raisers](2026-05-15-pass-3-slice-2a-class-delta-and-open-actions-design.md).
**Successor:** Pass 3 Slice 2c — 2b.4 conditional / triggered attachments (Devil Wings, Color Cloak, Orc Bloodfire Rush, Encepter aura, Mortal Coil); brainstormed separately.
**Scope notes:** brainstormed 2026-05-15. Stub-closure slice. Reifies the three permissive predicates slice 2a left in `class-triggers/per-class/{censor,null,tactician}.ts` by introducing a player-managed `Participant.targetingRelations` tagged-map driven by per-row chip toggles, with auto-set on the two canonical PHB ability ids (Judgment, Mark). Flips canon §5.4 (umbrella) + §5.4.1 Censor / §5.4.5 Null / §5.4.7 Tactician from 🚧 back to ✅, restoring auto-apply for all eight § 5.4 heroic resources.

## One-line summary

Replace the three slice-2a stubs (`isJudgedBy`, `isMarkedBy`, `hasActiveNullField`) with one-line `.includes()` reads against a new `Participant.targetingRelations: { judged: ParticipantId[], marked: ParticipantId[], nullField: ParticipantId[] }` tagged-map; mutate via a single generic `SetTargetingRelation { sourceId, kind, targetId, present }` intent dispatched from a per-row chip on every target row (visible only to the source's owner + director) and auto-derived from `UseAbility` for the two registered PHB ability ids via an `ABILITY_TARGETING_EFFECTS` registry (Judgment cap-1 `mode: 'replace'`; Mark additive `mode: 'add'`, pending plan-time printed-rulebook verification); render a public read-only "Judged by / Marked by / In Null Field of <name>" chip on every participant row for table visibility; surface a persistent summary card under each class's heroic-resource block on the source's sheet (matching slice 2a's Maintenance precedent under Essence). `EndEncounter` clears all three relation arrays for every participant. No spatial engine, no battlemap, no grid positions — Ironyard is explicitly UI-driven for spatial features.

## Goals

- Close slice 2a PS#7's three permissive stubs with real predicates; eliminate the over-fire bugs.
- Flip canon § 5.4 umbrella + § 5.4.1 / § 5.4.5 / § 5.4.7 from 🚧 → ✅; remove the "auto-apply gated by the umbrella § 5.4 🚧 flip" footer from § 5.4.2 / § 5.4.3 / § 5.4.4 / § 5.4.6 / § 5.4.8 (the five sub-sections that are individually ✅ but currently riding the umbrella's manual-override gate).
- Ship a UI affordance that makes the Null Field's "who's in the area" question playable at the table without a battlemap.
- Unify all three relations under one schema slot + one intent so slice 2c's conditional attachments can add new kinds (Color Cloak conversion targets, Encepter aura participants, future Revenant Bloodless save-target tracking) without re-litigating shape.

## Non-goals (deferred)

- **2b.4 conditional / triggered attachments** (Devil *Wings*, Color Cloak triggered weakness conversion, Orc *Bloodfire Rush*, Encepter aura, Mortal Coil +1 main action) — slice 2c. The `targetingRelations` substrate slice 2b ships is the forward-compat seam.
- **Battlemap / grid positions / spatial within-area math.** Confirmed 2026-05-15 — Ironyard is not a grid-based tool and probably never will be. Spatial features go through UI affordances (per-row chips, OA-as-spatial-gate from slice 2a), not engine math.
- **Pray-to-the-Gods "instead of standard d3"** — slice 2c (slice 2a PS#5 deferral).
- **Server-side dice rolling.**
- **Parser regex extension** for "judged by you" / "marked by you" effect text. Two ability ids cover 100% of v1 PHB content; the override map is two entries. Parser path can land later if homebrew-volume needs emerge.
- **Auto-clear on canon Judgment / Mark duration semantics.** The relation is player-managed mid-encounter (consistent with slice 2a's `maintainedAbilities`). If canon says "Mark lasts until end of encounter," `EndEncounter` already clears. If canon says "Judgment lasts until you Judgment a different creature," the `mode: 'replace'` derived intent handles the common case; manual chip removal handles edge cases.
- **NPC-side targeting relations.** Monsters don't have heroic resources, so the gain triggers never fire for monsters. Schema-wise `targetingRelations` defaults to empty arrays for all participants, including monsters — no special-casing.
- **§ 5.5 Malice 🚧 review.** Out of scope; § 5.5 is its own canon entry.

## Architecture

### Schema additions (`packages/shared/src/participant.ts`)

```ts
export const TargetingRelationKindSchema = z.enum(['judged', 'marked', 'nullField']);
export type TargetingRelationKind = z.infer<typeof TargetingRelationKindSchema>;

export const TargetingRelationsSchema = z.object({
  judged: z.array(z.string().min(1)).default([]),
  marked: z.array(z.string().min(1)).default([]),
  nullField: z.array(z.string().min(1)).default([]),
});
export type TargetingRelations = z.infer<typeof TargetingRelationsSchema>;
```

Added to `ParticipantSchema` as `targetingRelations: TargetingRelationsSchema.default({ judged: [], marked: [], nullField: [] })`. Defaults populate cleanly on pre-slice-2b snapshots — no D1 migration intent.

Participant ids are plain `z.string().min(1)` repo-wide (matching `intents/use-consumable.ts:16` and `per-encounter-flags.ts:21`). No dedicated `ParticipantIdSchema` exists today; this slice does not introduce one.

**Invariants:**
- Arrays contain unique ids (no duplicates). Reducer enforces.
- All ids in any array refer to currently-living participants. `RemoveParticipant` (or equivalent removal flow) strips the removed id from every other participant's arrays — see reducer changes.
- Self-targeting allowed? No. `SetTargetingRelation` reducer rejects `sourceId === targetId`. (Censor judging themselves, etc., isn't a canon scenario.)

### Intent additions (`packages/shared/src/intents/`)

**New intent: `SetTargetingRelation`**

```ts
export const SetTargetingRelationSchema = z.object({
  kind: z.literal('SetTargetingRelation'),
  actor: ActorSchema,
  sourceId: z.string().min(1),
  relationKind: TargetingRelationKindSchema,
  targetId: z.string().min(1),
  present: z.boolean(),
});
```

Field named `relationKind` (not `kind`) to avoid shadowing the discriminated-union tag.

**Behavior:**
- `present: true` adds `targetId` to `participant[sourceId].targetingRelations[relationKind]` if not already present.
- `present: false` removes it if present; no-op if absent (idempotent).
- Rejects: `sourceId === targetId`; unknown participant ids; actor not authorized.

**Trust:** `actor.userId === source.ownerId` OR active-director. Not server-only — players manage their own relations.

**Existing intent extension: `UseAbility`**

After main resolution, the reducer consults the new `ABILITY_TARGETING_EFFECTS` registry (`packages/rules/src/class-triggers/ability-targeting-effects.ts`):

```ts
type AbilityTargetingEffect = {
  relationKind: TargetingRelationKind;
  mode: 'replace' | 'add';
};

export const ABILITY_TARGETING_EFFECTS: Record<string, AbilityTargetingEffect> = {
  'judgment': { relationKind: 'judged', mode: 'replace' },
  'mark':     { relationKind: 'marked', mode: 'add' },
};
```

Exact ability-id keys (`'judgment'`, `'mark'`) verified against the ability data pipeline at plan time. A unit test imports the ability data and asserts both ids exist; the test fails loudly if a rename slips through.

When `UseAbility.abilityId` matches a registry entry and `UseAbility.targetParticipantIds` is non-empty, the reducer emits a derived `SetTargetingRelation` per primary target. For `mode: 'replace'`, the reducer first emits `SetTargetingRelation { present: false }` for every existing entry in the relation array, then `present: true` for the new target. For `mode: 'add'`, just `present: true`.

**Cap-1 vs additive plan-time check.** The registry encodes Judgment as cap-1 replace and Mark as additive. Both are flagged for printed-rulebook verification at plan time. If either is wrong, it's a one-line registry fix.

### Reducer changes

| Reducer | Change |
|---|---|
| `SetTargetingRelation` (new) | dispatch as described above; enforce invariants |
| `UseAbility` (extension) | after main resolution, consult `ABILITY_TARGETING_EFFECTS`; emit derived `SetTargetingRelation` if matched |
| `EndEncounter` (extension) | for every participant, reset `targetingRelations` to `{ judged: [], marked: [], nullField: [] }` |
| Participant removal path (extension) | strip the removed id from every other participant's three relation arrays |

The participant-removal sweep is the small subtle one — the relation is stored on the *source*, so when a target dies / leaves, every other participant needs scanning. Existing flow is in `intents/remove-participant.ts` or whichever reducer governs participant removal; plan author identifies the exact site. Test coverage explicitly exercises a remove-while-judged scenario.

### Predicate collapse

Three files in `packages/rules/src/class-triggers/per-class/` simplify:

```ts
// censor.ts — replace the slice-2a permissive stub
const isJudgedBy = (target: Participant, source: Participant) =>
  source.targetingRelations.judged.includes(target.id);

// tactician.ts — replace the slice-2a permissive stub
const isMarkedBy = (target: Participant, source: Participant) =>
  source.targetingRelations.marked.includes(target.id);

// null.ts — replace the slice-2a permissive stub
// Renamed from hasActiveNullField → hasActiveNullFieldOver because semantics changed:
// before, "does this Null have a field at all"; now, "is THIS enemy in the field."
const hasActiveNullFieldOver = (target: Participant, source: Participant) =>
  source.targetingRelations.nullField.includes(target.id);
```

The renamed Null predicate forces a call-site update in `class-triggers/action-triggers.ts` (or wherever the `main-action-used` event handler invokes the Null gain logic). Trivial.

### File organization

```
packages/shared/src/
  participant.ts                                  # +TargetingRelationsSchema, +TargetingRelationKindSchema; extend ParticipantSchema
  intents/
    set-targeting-relation.ts                     # NEW intent schema

packages/rules/src/
  intents/
    set-targeting-relation.ts                     # NEW reducer
    use-ability.ts                                # extend: emit derived SetTargetingRelation
    end-encounter.ts                              # extend: clear targetingRelations for all
    remove-participant.ts                         # extend: strip removed id from all sources
  class-triggers/
    ability-targeting-effects.ts                  # NEW registry
    per-class/
      censor.ts                                   # rewrite isJudgedBy
      null.ts                                     # rewrite hasActiveNullField → hasActiveNullFieldOver
      tactician.ts                                # rewrite isMarkedBy

apps/web/src/
  components/
    TargetingRelationsCard.tsx                    # NEW — persistent summary card under heroic-resource block
    ParticipantRow.tsx                            # extend: outbound chip (source-only) + inbound chip (all viewers)
  ws/
    useSessionSocket.ts                           # extend: WS-mirror reflects SetTargetingRelation + UseAbility derived cascade

packages/shared/tests/
  targeting-relations.spec.ts                     # NEW schema tests

packages/rules/tests/
  intents/
    set-targeting-relation.spec.ts                # NEW
    use-ability.spec.ts                           # extend
    end-encounter.spec.ts                         # extend
    remove-participant.spec.ts                    # extend
  class-triggers/
    per-class/
      censor.spec.ts                              # extend / new
      null.spec.ts                                # extend / new
      tactician.spec.ts                           # extend / new
  slice-2b-integration.spec.ts                    # NEW
```

## UI surface

### Persistent summary card (P3-style, owner's sheet)

For Censor / Tactician / Null PCs, render `<TargetingRelationsCard>` as a sub-section under the class's heroic-resource block on `PlayerSheetPanel`, matching slice 2a's Maintenance precedent under Essence.

```
WRATH                                    7  ▲
├─ JUDGING
│  • Skeleton Captain                   [×]
└─ [+ Add target]
```

- Conditional rendering: card appears only for classes that have one of the three relation kinds (Censor → judged; Tactician → marked; Null → nullField). Class-to-relation mapping lives in a small constant (`CLASS_RELATION_KIND: Record<ClassId, TargetingRelationKind | null>`).
- Empty state: "Judging: none." / "Marked: none." / "In your Null Field: none."
- `[×]` dispatches `SetTargetingRelation { present: false }`.
- `[+ Add target]` opens a picker (Radix popover / Dialog matching the existing `apps/web/src/primitives/` aesthetic per memory `feedback_ui_is_prototype_until_overhaul`) listing valid candidates (current encounter foes for Null Field; for Judgment / Mark, canon-likely also foes — verify at plan time; if canon allows judging allies, the picker expands). Selecting one dispatches `SetTargetingRelation { present: true }`.
- Auto-set from UseAbility populates the card without picker interaction.
- 44pt minimum hit targets on `[×]` and `[+ Add target]` per CLAUDE.md.

### Outbound per-row chip (P2)

On the source's owner / director view, every other participant row sprouts a tappable outbound chip for each relation kind the source supports:

```
[Goblin Sniper]   HP 12/18   ◻ Judged   ◻ Mark
```

- Visible only to source's owner + director (trust-gated render).
- Filled state indicates the target is currently in the relation; outline state indicates not. Tap toggles via `SetTargetingRelation`.
- 44pt minimum hit target.
- Multiple-class PC (theoretical — none in v1) shows one chip per applicable kind.

### Inbound public chip (P4)

Every viewer (player, director, spectator) sees read-only inbound chips on participant rows for any active inbound relations:

```
[Goblin Sniper]   HP 12/18   ▪ Judged by Aldric  ▪ Marked by Korva
```

- Source-attribution text comes from `participant.name` of the source (the Participant schema's display field, `packages/shared/src/participant.ts:17`).
- Multiple inbound relations stack as separate chips; if a target accumulates ≥ 3 inbound chips it collapses to a count badge (`▪ ×3`) with tap-to-expand. Threshold tunable.
- Read-only — non-source viewers cannot tap to mutate.

### Trust-gated render

The outbound chip and the `TargetingRelationsCard` action affordances render only when `viewer.userId === source.ownerId` OR the viewer is the active director (checked via the existing `useIsActingAsDirector()` hook in `apps/web/src/lib/active-director.ts`). The inbound chip renders for everyone.

## Trust model — additions

| Intent | Trust |
|---|---|
| `SetTargetingRelation` | `actor.userId === source.ownerId` OR active-director. Rejected for other actors. |
| Derived `SetTargetingRelation` from `UseAbility` | inherits `UseAbility`'s actor (already enforced upstream) |

Per slice 2a's `feedback_lobby_do_canDispatch` discipline (commit `d7c315d`), the lobby-do.ts `SERVER_ONLY_INTENTS` set does NOT include `SetTargetingRelation` — players are authorized dispatchers.

## Testing strategy

### Unit tests (`packages/rules/tests/`)

- **`intents/set-targeting-relation.spec.ts`**
  - `present: true` on absent target adds; on present target is idempotent (no duplicate).
  - `present: false` on present target removes; on absent target is idempotent.
  - `sourceId === targetId` rejected.
  - Unknown `sourceId` / `targetId` rejected.
  - Permission: non-owner non-director rejected; owner accepted; director accepted.
  - All three `relationKind` values exercised.
- **`intents/use-ability.spec.ts`** (extension)
  - `ability.id === 'judgment'` with one target: emits derived `SetTargetingRelation` with `present: true`; if existing `judged` list non-empty, first emits `present: false` for each existing entry (`mode: 'replace'` cap-1).
  - `ability.id === 'mark'` with one target: emits derived `SetTargetingRelation { present: true }`; existing `marked` list preserved (`mode: 'add'`).
  - Unregistered `ability.id`: no derived intent emitted.
  - Empty `targetParticipantIds`: no derived intent emitted.
- **`intents/end-encounter.spec.ts`** (extension)
  - After EndEncounter, every participant's `targetingRelations` is `{ judged: [], marked: [], nullField: [] }`.
- **`intents/remove-participant.spec.ts`** (extension; create if doesn't exist)
  - After removal, the removed id no longer appears in any other participant's three relation arrays.
- **`class-triggers/per-class/censor.spec.ts`**
  - Wrath +1 fires only when damage source has the damager in `judged`, or damage target has the damager in `judged`.
  - Empty `judged` → no over-fire (regression test for slice 2a PS#7 bug).
- **`class-triggers/per-class/tactician.spec.ts`**
  - Focus +1 fires only when damage target has any participant in source's `marked` array.
  - Empty `marked` → no over-fire.
- **`class-triggers/per-class/null.spec.ts`**
  - Discipline +1 fires only when the main-action actor is in source's `nullField` array.
  - Empty `nullField` → no over-fire.
- **`class-triggers/ability-targeting-effects.spec.ts`** (NEW)
  - Imports the ability data and asserts `'judgment'` and `'mark'` keys exist in the ability registry. Fails loudly on data-pipeline rename.

### Schema tests (`packages/shared/tests/`)

- **`targeting-relations.spec.ts`**
  - Round-trip with empty + populated arrays.
  - Defaults: missing `targetingRelations` parses to `{ judged: [], marked: [], nullField: [] }`.
  - Rejection of unknown relation kind.
  - Schema accepts duplicate ids (reducer enforces uniqueness, not schema — same pattern as slice 2a's `maintainedAbilities`).

### UI tests (`apps/web/src/__tests__/`)

- **`TargetingRelationsCard.spec.tsx`**
  - Empty state renders for each relation kind.
  - Single + multi entries render with `[×]` per entry.
  - `[×]` tap dispatches `SetTargetingRelation { present: false }`.
  - `[+ Add target]` opens picker; picker selection dispatches `SetTargetingRelation { present: true }`.
  - Card conditionally renders based on `participant.className` → relation-kind mapping.
- **`ParticipantRow.spec.tsx`** (extension)
  - Outbound chip visible only when `viewer.userId === source.ownerId || viewer.role === 'director'`.
  - Inbound chip visible to all viewers.
  - Multi-inbound stacking; count-badge collapse at threshold.
  - Outbound chip tap dispatches `SetTargetingRelation`.

### Integration test

**`packages/rules/tests/slice-2b-integration.spec.ts`** — 4-PC encounter (Censor Aldric / Tactician Korva / Null Vex / Talent Eldra — Talent included as a non-targeting-relation control) over 2 rounds:

- **Round 1.**
  - Aldric uses *Judgment* on Goblin-A → derived intent populates `aldric.targetingRelations.judged = ['goblin-a']`.
  - Goblin-A damages Aldric → Censor Wrath trigger fires (judged-by-self damages-me path) → +1 wrath, latch flips.
  - Goblin-B damages Aldric → Wrath trigger does NOT fire (goblin-b not in judged).
  - Korva uses *Mark* on Goblin-A → `korva.targetingRelations.marked = ['goblin-a']`.
  - Eldra damages Goblin-A → Tactician Focus trigger fires (ally damages marked target) → Korva +1 focus.
  - Vex's `nullField` is empty → Goblin-A uses a main action → Discipline trigger does NOT fire.
  - Player playing Vex taps the outbound "Null Field" chip on Goblin-A's row → `SetTargetingRelation { sourceId: vex, relationKind: 'nullField', targetId: 'goblin-a', present: true }`.
  - Goblin-B uses a main action → does NOT fire (B not in Vex's nullField). Goblin-A uses a main action on its next turn → Discipline trigger fires (latch reset at round-start since slice 2a sets it per-round) → +1 discipline.
- **Round 2.**
  - Aldric uses *Judgment* on Goblin-C (different target) → cap-1 replace: first emits `present: false` for goblin-a, then `present: true` for goblin-c. Verify `judged === ['goblin-c']`.
  - Goblin-A damages Aldric → no Wrath gain (no longer judged).
  - Goblin-C damages Aldric → Wrath +1.
- **Mid-encounter participant removal.** Goblin-A killed and removed. Verify Korva's `marked` array no longer contains 'goblin-a'.
- **EndEncounter.** All three relations cleared for every participant. Verify `aldric.targetingRelations.judged === []`, `korva.targetingRelations.marked === []`, `vex.targetingRelations.nullField === []`.

## Constraints and risks

- **Cap-1 vs additive semantics for Judgment + Mark.** Plan must verify against the printed Heroes Book (per memory `user_has_printed_rulebook`) whether Judgment is cap-1 (re-cast replaces) and whether Mark accumulates or replaces. The registry encodes the answer; getting it wrong silently breaks canon math but is a one-line fix once verified. Defaults in this spec: Judgment `mode: 'replace'`, Mark `mode: 'add'`.
- **Ability-id matching is data-pipeline-dependent.** The override map keys on string ids. If the ingest pipeline ever renames Judgment or Mark abilities, the auto-set silently stops working. Manual chip remains as fallback but the player won't notice the regression. Mitigation: `ability-targeting-effects.spec.ts` imports the ability data and asserts both ids exist; the test fails loudly on rename.
- **Inbound chip visual noise in big encounters.** A heavily-marked goblin could accumulate 3+ inbound chips. Count-badge collapse threshold is `≥ 3` in v1; tunable. If still noisy, alternative is to hide all but the most-recent and surface the rest via tap-to-expand.
- **The Null predicate rename forces call-site updates.** `hasActiveNullField(source)` → `hasActiveNullFieldOver(target, source)`. Signature changed; one call site in `class-triggers/action-triggers.ts`. Caught at typecheck.
- **Participant-removal sweep is the easy-to-forget reducer change.** Without it, `targetingRelations` accumulates references to dead/removed participants. The integration test exercises this explicitly.
- **Self-targeting prohibition.** `sourceId === targetId` is rejected. No canon scenario judges/marks self; the constraint prevents accidental UI mis-clicks.
- **WS-mirror reflect for the derived-intent cascade.** Same pattern as slice 2a — WS reflect path must invoke the `UseAbility` derived `SetTargetingRelation` emission or optimistic UI desyncs. Plan task list includes the WS-mirror sweep explicitly.
- **Pre-slice-2b snapshot compat.** Default `targetingRelations` to `{ judged: [], marked: [], nullField: [] }` on every participant load; no D1 migration intent required.
- **Director visibility / multi-class concerns.** A director jumping behind the screen sees outbound chips for *every* PC's targeting relations. This is information-dense but appropriate for the director role; no special collapse / filter affordance in v1.
- **Cross-slice handoff to slice 2c.** Slice 2c's conditional attachments (Color Cloak conversion targets, Encepter aura participants) can extend `TargetingRelationKindSchema` with new kinds (`colorCloakConvertedBy`, `inEncepterAuraOf`, etc.) without re-shaping the schema. The tagged-map is the forward-compat seam.

## Acceptance

Slice 2b is done when:

1. **`Participant.targetingRelations` schema lands** with the three-array tagged-map shape; defaults populate cleanly on pre-slice-2b snapshots without D1 migration.
2. **`SetTargetingRelation` intent reducer** enforces all invariants (unique ids, no self-target, present/absent participants, owner/director trust). `present: true/false` is idempotent on already-present/already-absent state.
3. **`UseAbility` reducer emits derived `SetTargetingRelation`** for the two registered PHB ability ids: Judgment with `mode: 'replace'` (clears existing judged list before adding); Mark with `mode: 'add'` (additive). Unregistered abilities emit nothing.
4. **`EndEncounter` reducer clears** `targetingRelations` to empty arrays for every participant.
5. **Participant removal strips** the removed id from every other participant's three relation arrays.
6. **The three predicate stubs collapse** to one-line `.includes()` reads in `class-triggers/per-class/{censor,null,tactician}.ts`. Slice 2a's over-fire bugs are gone — verified by tests that assert empty-relation cases do NOT fire the trigger.
7. **`TargetingRelationsCard`** renders under the class heroic-resource block for Censor / Tactician / Null PCs; empty state, single + multi entries, `[×]` and `[+ Add target]` affordances work. Card does NOT render for other classes.
8. **`ParticipantRow` outbound chip** renders only for the source's owner + director; chip tap dispatches `SetTargetingRelation`. 44pt hit target.
9. **`ParticipantRow` inbound chip** renders for all viewers; source-attribution text is correct; multi-inbound stacking + count-badge collapse at threshold work.
10. **WS-mirror reflects** `SetTargetingRelation` and the `UseAbility` derived-intent cascade; optimistic UI stays in sync.
11. **`ability-targeting-effects.spec.ts` test** imports the ability data and asserts both PHB ability ids exist; fails loudly on rename.
12. **Canon doc updates:**
    - `docs/rules-canon.md` § 5.4 umbrella flips 🚧 → ✅.
    - § 5.4.1 Censor / § 5.4.5 Null / § 5.4.7 Tactician flip 🚧 → ✅ individually.
    - The "Note: auto-apply gated by the umbrella § 5.4 🚧 flip" footers on § 5.4.2 / § 5.4.3 / § 5.4.4 / § 5.4.6 / § 5.4.8 are removed.
13. **Slice 2a PS#7 gets a follow-up note** in its spec doc: "Closed by slice 2b commit `<sha>`." Historical record retained.
14. **`pnpm test`, `pnpm typecheck`, `pnpm lint` clean repo-wide.** All listed unit / schema / UI / integration tests pass.
15. **Phase 2b sub-epic table** does NOT change. 2b.0.1 is already ✅; slice 2b is a continuation of 2b.0.1's stub-closure, not a new sub-epic.

## Out-of-scope confirmations

- 2b.4 conditional / triggered attachments (slice 2c's brainstorm).
- Battlemap / grid positions / engine spatial math.
- Pray-to-the-Gods "instead of standard d3" semantics (slice 2c — slice 2a PS#5).
- Parser regex extraction for "judged by you" / "marked by you" effect lines.
- Auto-clear on canon Judgment / Mark duration (player-managed mid-encounter; `EndEncounter` clears all).
- NPC-side targeting relations (no monster heroic resources read these).
- Server-side dice rolling.
- Phase 2b non-tracker engine work (2b.1, 2b.2, 2b.3, 2b.7, 2b.8).

## PS — Execution-Time Corrections

Future post-shipping fixes layer the same way slice 1 / slice 2a's did: append a numbered entry to this PS section with a one-line symptom, a one-paragraph fix, and the relevant commit SHA. Once a follow-up entry has shipped *and* been verified in real use, leave it in place — the doc is the historical record, not a TODO list.

### Plan-time corrections (from plan self-review)

*(none yet)*

### Execution-time findings (per `feedback_post_shipping_fixes_ps_section`)

*(none yet)*
