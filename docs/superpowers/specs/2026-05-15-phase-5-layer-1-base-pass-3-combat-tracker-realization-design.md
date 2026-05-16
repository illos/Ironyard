# Phase 5 Layer 1 (Base) — Pass 3: Combat Tracker Realization

**Status:** Designed, awaiting per-slice brainstorms.
**Parent:** Phase 5 — UI rebuild ([phases.md](../../phases.md#phase-5--ui-rebuild)). Pass 1 ([spec](2026-05-14-phase-5-layer-1-base-pass-1-design.md)) shipped tokens + primitives + role-aware shell on 2026-05-14. Pass 2a ([spec](2026-05-14-phase-5-layer-1-base-pass-2a-content-gating-design.md)) shipped content gating + Turn flow + role-asymmetric chrome. Pass 2b1 ([spec](2026-05-14-phase-5-layer-1-base-pass-2b1-zipper-initiative-design.md)) shipped zipper initiative + per-row reticle targeting. Pass 2b2a ([spec](2026-05-14-phase-5-layer-1-base-pass-2b2a-combat-tracker-design.md)) shipped tracker chrome deepening.
**Sub-slices:** Five slice specs land separately. See § Per-slice index.
**Phase-2b umbrella:** This Pass folds in tracker-relevant items from the Phase 2b sub-epic table — 2b.0.1, 2b.4 (combat-tracker subset only), 2b.5, 2b.6 (extended), 2b.9, 2b.11. See [phases.md § Phase 2b — Combat completeness](../../phases.md#phase-2b--combat-completeness). The non-tracker Phase 2b sub-epics (2b.1, 2b.2, 2b.3, 2b.7, 2b.8) ship under their own brainstorms outside this Pass.
**Scope notes:** brainstormed 2026-05-15. The umbrella exists because the tracker today is a Frankenstein — chrome ~80% of Pass-5 quality, engine ~10% of Phase-2b completeness. Half the OpenActions chrome shipped in 2b2a fires only on fixtures because the class-δ triggers that would populate it haven't shipped. Layer 2 pack-color hooks plumb into nothing. Layer 3 effects haven't started. Folding the remaining tracker work into one umbrella lets us sequence engine + UI dependencies cleanly across sub-epics that today live in three roadmaps.

## One-line summary

Close the gap between tracker chrome quality and tracker engine completeness across five dependency-sequenced sub-slices: (1) the canonical damage state machine § 2.7-2.9 with a generic per-trait override pattern that absorbs Revenant inert, Hakaan rubble + doomed, Title *Doomed*, and Curse of Punishment as concrete plugs, plus § 4.10 cross-side trigger ordering; (2) every § 5 class-δ gain trigger, Elementalist *Maintenance*, Troubadour posthumous Drama, Talent strained-spend confirm UI, Psion toggles, the Open Action raisers and copy registry that populate the chrome 2b2a left empty, plus the combat-tracker subset of 2b.4 conditional/triggered attachments; (3) minion squads — one row + one turn-flow for N minions, EncounterBuilder grouping, consecutive-act semantics in zipper initiative; (4) the embellished Mode-C chip (D2), the open-design Mode-B nav surface (D3), and the per-row pack-color tinting that lights up Layer 2's plumbed hook; (5) the Layer 3 action-effect framework with five plugs — damage-type ember borders, slain-foe skull emblem, crit-hit pack-accent screen flash, condition animation-in, active-turn pulse expansion.

## Goals

- Make the OpenActions chrome from 2b2a *do something* at the table — populate the empty `OpenActionKindSchema` enum with the real spatial / class-internal kinds and fire them from the engine's event hooks.
- Run the damage state machine end-to-end (winded / dying / dead / unconscious / inert / rubble / doomed + KO interception), with a generic per-trait override pattern that absorbs the known concrete cases (Revenant inert, Hakaan rubble, Hakaan doomed, Title Doomed, CoP) without N one-off code paths. Draw Steel has no death-save mechanic — Bleeding-d6 on dying-hero actions is the natural dying-to-dead progression.
- Close Q10 (cross-side trigger order) by shipping a `ResolveTriggerOrder` intent + prompt UI; close Q16 (Revenant inert) which has been gating on 2b.5 since the Phase 2b umbrella was written.
- Collapse minion swarms from N-row drag to one squad row with one turn-flow — the highest-impact tracker simplification on the board.
- Light up the embellished Mode-C active-character chip (winded ring / hero-token pips / heroic-resource readout) and settle the Mode-B nav surface design that's been open since Pass 2b2c was deferred.
- Light up Layer 2's per-row `pack-X` hook with real per-PC `colorPack` data so the rails finally differentiate PCs by their character color.
- Ship the Layer 3 action-effect framework with five concrete plugs that read engine state and roll outcomes — the first phase-5 quality bar where the app stops feeling like a survey form.

## Non-goals (deferred to other passes / phases)

- **Encounter builder C1 (monster previews) / C2 (threat budget) / C3 (picker filtering).** Shelved (Pass 2b2b territory).
- **Phase 2b non-tracker engine work:** 2b.1 (per-echelon stat-mod, level+N immunity, title benefit slot), 2b.2 (stacking + magic-damage-bonus), 2b.3 (kit completeness — ranged/distance/disengage bonuses), 2b.7 (class-feature choice pipeline — Conduit Prayers, Censor Domains), 2b.8 (ancestry signature-trait engine gaps).
- **Layer 2 picker UIs:** theme picker, pack-color picker, light theme palette. Slice 4 consumes pack-color once `Character.colorPack` exists; the picker that sets it is non-tracker work.
- **Phase 1.5 DB persistence for active context.** Orthogonal.
- **Server-side dice rolling.** Trust model stays as-is (canon-trust + active-director-override); Phase 4 swap.

## Naming + status

`Pass 5 Layer 1 Pass 3 — Combat Tracker Realization`. Continues the Pass-5 numbering through Pass 1 → 2a → 2b1 → 2b2a → 3. The subtitle disambiguates: this is the pass where the tracker stops being a Frankenstein. Pass 5 Layer 1's center of gravity is the tracker; Pass 3 is its realization.

The cross-phase nature (engine work from Phase 2b folded under a Phase-5 chrome-anchored name) is intentional. Naming continuity beats phase-purity — the tracker is the unit of work, not the phase.

## Cross-slice contracts

The schema, intent, and state-shape additions that span more than one slice. Locked here so per-slice specs reference these rather than re-debate them.

### `Participant` stamina state surface (slice 1, read by slices 2 + 5)

Settled in slice 1 brainstorm 2026-05-15: flat-sibling layout. Today's `Participant` schema carries flat `currentStamina: number` (with `min(0)` constraint) + `maxStamina: number` + a nested `recoveries: { current, max }` object + a `recoveryValue: number`. Slice 1:

- Relaxes the `currentStamina.min(0)` constraint to `.int()` (allows negative values for dying per canon § 2.8).
- Adds sibling fields `staminaState`, `staminaOverride`, `bodyIntact`, `triggeredActionUsedThisRound`.
- Preserves the existing `recoveries: { current, max }` + `recoveryValue` shape unchanged.

The contract this umbrella commits to:

```ts
// Existing — bound relaxed
currentStamina: number;                     // can go negative; floor at -maxStamina
maxStamina:     number;

// New siblings — slice 1
staminaState:   'healthy' | 'winded' | 'dying' | 'dead' | 'unconscious' | 'inert' | 'rubble' | 'doomed';
staminaOverride: ParticipantStateOverride | null;
bodyIntact:     boolean;
triggeredActionUsedThisRound: boolean;
```

**No death-save field** — Draw Steel has no death-save mechanic. The dying → dead progression is driven by Bleeding-d6 damage on dying-hero actions. The umbrella's earlier reference to "death saves" was D&D-flavored colloquial shorthand and is corrected here.

`staminaState` is derived from `currentStamina` + `maxStamina` + `staminaOverride` via `recomputeStaminaState(participant)`. Reducers that mutate stamina call it and, when the state changes, emit `StaminaTransitioned { participantId, from, to, cause }` as a derived intent — the substrate slice 2's class-δ triggers and slice 5's action-effect framework subscribe to.

### `ParticipantStateOverride` discriminated union (slice 1)

```ts
type ParticipantStateOverride =
  | { kind: 'inert'; source: 'revenant';
      instantDeathDamageTypes: DamageType[];     // ['fire'] per canon
      regainHours: number;                        // 12
      regainAmount: 'recoveryValue';
    }
  | { kind: 'rubble'; source: 'hakaan-doomsight';
      regainHours: number;                        // 12
      regainAmount: 'recoveryValue';
    }
  | { kind: 'doomed';
      source: 'hakaan-doomsight' | 'title-doomed' | 'manual';
      canRegainStamina: boolean;                  // false for Title Doomed; true for Hakaan
      autoTier3OnPowerRolls: boolean;             // true for both (canon-clarified: ability rolls and power rolls are the same umbrella)
      staminaDeathThreshold: 'none' | 'staminaMax';  // 'none' for Hakaan; 'staminaMax' for Title
      dieAtEncounterEnd: boolean;                 // true for both
    }
  | { kind: 'extra-dying-trigger';
      source: 'curse-of-punishment';
      predicate: 'recoveries-exhausted';
    };
```

New variants land as 2b.7/2b.8 trait/title/complication work surfaces more sources. Slice 1 ships with these five concrete plugs.

### Open Action kind registry (populated in slices 1 + 2)

`OpenActionKindSchema` (today empty per 2b.0) gains real entries:

Added by slice 1 (damage-state opt-in):
- `title-doomed-opt-in` — offered to non-Hakaan PCs with the *Doomed* title equipped at `reachedZeroStamina` if conscious.

Note: Hakaan-Doomsight does NOT use the OA framework. Per slice 1 brainstorm decision, the Hakaan PC's `Become Doomed` is a direct player intent (`BecomeDoomed { participantId, source: 'hakaan-doomsight' }`) dispatched from a button on the player sheet, available any time during an encounter. Director/player collaboration about *when* to press the button happens at the table, outside the app.

Added by slice 2 (class-δ raisers and class-internal affordances):
- `spatial-trigger-elementalist-essence`
- `spatial-trigger-tactician-ally-heroic`
- `spatial-trigger-null-field`
- `spatial-trigger-troubadour-line-of-effect`
- `pray-to-the-gods` — Conduit class-internal raise
- `troubadour-auto-revive`

Each gets a copy-registry entry. The 2b2a chrome (already shipped) starts having content the first time slice 1 lands (doomed opt-ins), with the bulk arriving in slice 2.

Originally three additional kinds were planned (`talent-strained-spend-confirm`, `psion-strained-opt-in`, `psion-clarity-damage-opt-out`) and were dropped in slice 2a brainstorm — see PS 1 below.

### New intents

| Intent | Slice | Notes |
|---|---|---|
| `BecomeDoomed` | 1 | Hakaan-Doomsight player-pressed (or director-applied with `source: 'manual'`); sets doomed override |
| `KnockUnconscious` | 1 | Out-of-combat explicit KO; bypasses ApplyDamage |
| `ApplyParticipantOverride` | 1 | Director-only manual override application (covers all 4 kinds) |
| `ClearParticipantOverride` | 1 | Director-only override revert |
| `ResolveTriggerOrder` | 1 | Q10 — payload `{ pendingTriggerSetId, order: string[] }`; director-only |
| `GrantExtraMainAction` | 1 | Server-only derived intent fired on nat 19/20 main-action `RollPower` |
| `ExecuteTrigger` | 1 | Server-only derived cascade step during cross-side trigger resolution |
| `StaminaTransitioned` | 1 | Server-only derived event; substrate for slice 2 + slice 5 |
| `StartMaintenance` / `StopMaintenance` | 2 | Elementalist sustained-ability state machine |
| `PickSquadNext` | 3 | Squad-aware extension of `PickNextActor`; one squad picks → all members act consecutively |

`ApplyDamage`'s payload also gains an optional `intent: 'kill' | 'knock-out'` field (slice 1) for the KO interception path.

### Participant schema additions (across slices)

| Field | Slice | Notes |
|---|---|---|
| `staminaState` + `staminaOverride` (flat siblings) | 1 | Extends existing `currentStamina` / `maxStamina`; relaxes `currentStamina.min(0)` to allow negative for dying. No `deathSaves` field — Draw Steel has no death-save mechanic. |
| `triggeredActionUsedThisRound` | 1 | § 4.10; round-tick reset at `EndRound` |
| `perEncounterFlags` | 2 | `{ tookDamageThisRound: boolean, forceMovedThisTurn: boolean, ... }` — class-δ triggers + conditional attachments read this |
| `bodyIntact` | 1 | Reified from 2b.0's permissive flag; Troubadour posthumous reads it |
| `colorPack` (also on Character) | 4 | Stamped at `StartEncounter` from Character; nullable + class-derived default |
| `squadId` OR `SquadParticipant` entity | 3 | Open design — settled in slice 3 brainstorm |

### Character schema additions

| Field | Slice | Notes |
|---|---|---|
| `colorPack: 'lightning' \| 'shadow' \| 'fireball' \| 'chrome' \| null` | 4 | Nullable; null falls back to class-derived default in the stamping path |

### Touch list — what each slice modifies

| File / surface | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| `packages/shared/src/participant.ts` (stamina, perEncounterFlags, squadId, colorPack) | • | • | • | • | |
| `packages/shared/src/character.ts` (colorPack) | | | | • | |
| `packages/shared/src/open-action.ts` (kind enum) | | • | | | |
| `packages/shared/src/intents/` (new intents above) | • | • | • | | |
| `packages/rules/src/intents/start-encounter.ts` (stamping) | • | | | • | |
| `packages/rules/src/intents/{turn,end-round,end-encounter}.ts` | • | • | • | | |
| `packages/rules/src/intents/apply-damage.ts` (state transitions) | • | | | | |
| `packages/rules/src/attachments/applier.ts` (per-encounter re-eval) | | • | | | |
| `apps/web/src/primitives/ParticipantRow.tsx` | • (state tag) | | • (squad row) | • (pack class wiring) | • (decoration slot) |
| `apps/web/src/pages/combat/combat-header/InlineHeader.tsx` (Mode-C chip) | | | | • | |
| `apps/web/src/pages/combat/EncounterBuilder.tsx` (squad grouping) | | | • | | |
| `apps/web/src/pages/combat/action-effects/` (new tree) | | | | | • |
| `docs/rules-canon.md` (status flips) | • | • | • | | |
| `docs/rule-questions.md` (Q10, Q16, Q-doomed closures) | • | | | | |

## Per-slice index

Each slice ships through its own brainstorm → spec → plan → subagent-driven-development cycle. The slice specs land as their own files under `docs/superpowers/specs/`.

### Slice 1 — Damage state machine + cross-side triggers (engine foundation)

**Folds in:** 2b.5 (full), 2b.6 (extended to "per-trait damage-state overrides"), 2b.9 (Q10 cross-side trigger ordering), § 4.10 critical-hit extra-main-action rule.

**Engine deliverables:** (per [slice 1 spec](2026-05-15-pass-3-slice-1-damage-state-machine-design.md))
- Stamina state machine: healthy / winded / dying / dead / unconscious / inert / rubble / doomed per § 2.7-2.9.
- Dying state with auto-Bleeding (`removable: false`, `source: 'dying-state'`). **No death saves** — Draw Steel doesn't have them; the Bleeding-d6 hook on dying-hero actions is the natural progression toward dead.
- KO interception (§ 2.9): `ApplyDamage.intent: 'kill' | 'knock-out'` payload field; opt-in at a would-kill blow stops damage, applies Unconscious + Prone conditions, next damage kills.
- `ParticipantStateOverride` generic mechanism with five concrete plugs:
  - **Revenant inert** (intercepts `→ dying` automatically when `character.ancestry.id === 'revenant'`)
  - **Hakaan rubble** (intercepts `→ dead` automatically when `character.ancestry.id === 'hakaan'` + Doomsight equipped + not currently doomed)
  - **Hakaan doomed** — direct `BecomeDoomed` player intent from the sheet button (no OA, no predetermination — collaboration happens at the table)
  - **Title *Doomed*** — `title-doomed-opt-in` Open Action raised at `reachedZeroStamina` while conscious; player claims to enter doomed state
  - **Curse of Punishment** — `recoveries-exhausted` predicate enters dying state regardless of stamina; clears automatically when recoveries refill (Q3 = A)
- Cross-side triggered-action ordering via `ResolveTriggerOrder` intent + `CrossSideTriggerModal` director-only modal with foe-first default order, drag-to-reorder, single resolve button (Q10 closed).
- Critical-hit rule: nat 19/20 on `RollPower` for a main-action ability grants `GrantExtraMainAction` derived intent (even off-turn, even dazed).
- Bleeding-trigger discriminant extension: `main_action | triggered_action | might_or_agility_test | ability_roll` (renames `might_or_agility_roll` for precision and adds `ability_roll`).

**UI surface in slice 1 (minimal):**
- `ParticipantRow` state tag adds new values: `WINDED`, `DYING`, `DEAD`, `KO` (with 💤 glyph), `INERT (12h)`, `RUBBLE (12h)`, `DOOMED` (with 🔥 glyph).
- `DoomsightBecomeDoomedButton` on `PlayerSheetPanel` for Hakaan-Doomsight PCs.
- `CrossSideTriggerModal` (director-only) + passive `TriggersPendingPill` for players.
- *Visual polish* for state tags ships in slices 4 + 5 (chip embellishment, skull emblem, glow).

**Verified during slice 1 brainstorm:**
- Death saves: not in Draw Steel canon. Dying → dead is purely Bleeding-d6 progression on actions.
- CoP recoveries-refill: dying clears automatically when predicate de-asserts (option A).
- KO interception: damage doesn't apply at all; stamina stops at pre-blow value (option A).
- Hakaan Doomsight: player-pressed button, always available, no encounter-predetermination logic in engine.

**Closes:** rule-questions Q10, Q16, new Q-doomed (Hakaan + Title doomed mechanics). Phase 2b acceptance criterion #3.

### Slice 2 — Class-δ triggers + conditional attachments

**Folds in:** 2b.0.1 (full), 2b.4 combat-tracker subset only.

**Engine deliverables — 2b.0.1:**
- Class-specific δ gain triggers, all "first time per round" except where noted:
  - **Censor Wrath** — judged-target damages you, or you damage judged-target
  - **Fury Ferocity** — took damage; first-time-per-encounter winded or dying
  - **Tactician Focus** — mark-damage, ally-uses-heroic-ability
  - **Shadow Insight** — deal damage with surges
  - **Null Discipline** — enemy uses main action in Null Field, Director spends Malice
  - **Talent Clarity** — force-move broadcast
  - **Troubadour Drama** — three-heroes-acted-this-turn, winded (any hero), nat-19/20-in-line-of-effect, hero-dies (+10)
- Elementalist *Maintenance* state machine: `StartMaintenance` / `StopMaintenance` intents; per-turn cost deduction; auto-drop when essence would go negative.
- Troubadour posthumous Drama gain (reads slice 1's clean dying/dead state) + auto-revive at 30 drama.
- Talent strained-spend confirm UI (modal raised as Open Action `talent-strained-spend-confirm`).
- 10th-level Psion opt-in-strained / opt-out-of-clarity-damage toggles (`psion-strained-opt-in`, `psion-clarity-damage-opt-out` Open Actions).
- Psion 1d3+2 per-turn gain (the `d3-plus` baseGain variant stubbed in 2b.0).
- Open Action raisers for the four spatial triggers (Elementalist within-10, Tactician ally-heroic, Null Field, Troubadour line-of-effect) and Conduit *Pray to the Gods*.
- OA copy registry populated for every new kind.

**Engine deliverables — 2b.4 tracker subset:**
- `AttachmentCondition` extended beyond `kit-has-keyword` / `item-equipped` to include runtime predicates the applier re-evaluates mid-encounter.
- Concrete conditional/triggered attachments:
  - Devil *Wings* (only-while-flying)
  - Color Cloak triggered weakness conversion
  - Orc *Bloodfire Rush* (round you took damage)
  - Encepter aura
  - Mortal Coil +1 main action (turn-economy modifier)
- `Participant.perEncounterFlags` field added with the relevant entries (`tookDamageThisRound`, `forceMovedThisTurn`, etc.) — reset by `EndTurn` / `EndRound` as appropriate.

**UI surface:**
- OpenActions chrome from 2b2a starts firing real content. Empty-state goes away once class-δ triggers fire.
- Strained-spend modal (Talent).
- Maintenance toggle UI (Elementalist).

**Closes:** Phase 2b acceptance criterion #1 (every § 5 sub-section runs end-to-end). Half of acceptance criterion #2 (§ 10.16 mid-encounter-eval entries).

### Slice 3 — Minion squads

**Folds in:** 2b.11 (full).

**Engine deliverables:**
- Squad data model: schema decision settled in slice brainstorm — either `participant.squadId: string | null` (one row, member set), or new `SquadParticipant` entity (one row representing N minions). Both supported by canon § 8.6 initiative groups; the schema choice affects how damage targeting works (per-minion within squad vs. squad-wide).
- Squad-level action economy: one main action / one maneuver / one move / one triggered action per turn, regardless of member count.
- Consecutive-act semantics: when a squad is picked in zipper initiative, all members act on the same turn (canon § 8.6 + canon § 4.1 interaction).
- `PickSquadNext` intent extending the `PickNextActor` pattern from Pass 2b1.

**UI surface:**
- Brand-new squad-row primitive in `ParticipantRow` — aggregate stamina visualization (e.g. "12/15 minions @ 8 HP each" or per-minion pip strip; settled in slice brainstorm).
- EncounterBuilder grouping UI (drag minions into a squad; squad rename; squad delete).
- Per-minion damage targeting within a squad row.

**Closes:** 2b.11 sub-epic. Composes with Pass 2b1's side-aware picker without schema rework (per 2b1 spec § "forward-compatible with future minion-squads epic").

### Slice 4 — Chrome deepening + pack-color rails

**Folds in:** D2 (originally Pass 2b2c), D3 (originally Pass 2b2c), Layer 2 pack-color tracker hookup.

**Engine deliverables (minimal):**
- `Character.colorPack: 'lightning' | 'shadow' | 'fireball' | 'chrome' | null` field. Nullable; null resolves to a class-derived default at stamp time (mapping settled in slice brainstorm).
- `StartEncounter` stamping path extended to copy `character.colorPack ?? defaultPackForClass(character.classId)` → `participant.colorPack`.

**UI deliverables:**
- **D2 — embellished Mode-C active-character chip.** Three visual treatments composited:
  - Winded ring around the sigil (reads `stamina.state === 'winded'` from slice 1; degrades to `current ≤ floor(max/2)` if slice 1 not yet shipped — same defensive pattern used elsewhere).
  - Hero-token pip count (small pip row reading the session's hero-token pool).
  - Heroic-resource readout (mini variant of slice-2's class-δ display).
- **D3 — Mode-B nav surface beyond Foes.** Open design — slice brainstorm chooses between Templates, Approvals queue, Sessions, or a tabbed combiner. The shape of the eventual nav is not pre-decided here.
- **Pack-color rail tinting.** `PartyRail` passes `participant.colorPack` to `ParticipantRow`'s existing `pack` prop. Each PC row picks up its own `pack-X` class; resource pips and accent rings read `--pk` per row instead of the global `--accent`.

**Closes:** D2 + D3 carry-overs from Pass 2b2c. Layer 2 tracker-side dependency for the bigger pack-color-picker work later.

### Slice 5 — Action effects (Layer 3)

**Folds in:** Layer 3 action-effect work entirely (combat-tracker scope only).

**Engine deliverables:** none. Slice 5 is purely presentational. Reads engine state and roll outcomes; never writes.

**UI deliverables:**
- **Action-effect framework primitive.** Event-driven decoration layer. Subscribes to derived intents emitted by other slices (`StaminaTransitioned`, `RollPower` outcomes, `ApplyCondition`, `StartTurn`); renders overlay components on participant cards / roll buttons / screen. Each effect individually toggleable per the phases.md accessibility note.
- **Five concrete plugs:**
  - **Ember/flame border on Roll button per damage type** — one parameterized component, eight damage-type configs (fire, cold, lightning, holy, corruption, psychic, poison, sonic). Reads `ability.powerRoll.damageType`.
  - **Slain foe skull emblem** — reads slice 1's `StaminaTransitioned → dead` event; layers onto the participant card.
  - **Crit-hit screen flash** — reads `RollPower` outcomes (nat 19/20); flashes in attacker's `--pk` (slice 4 pack color).
  - **Condition animation-in** — reads `ApplyCondition` events; condition chips animate onto cards instead of snap-mounting.
  - **Active-turn pulse expansion** — extends the small Pass 2a PS #5 `ironyard-turn-pulse` keyframe into a richer breathing-glow treatment. `prefers-reduced-motion` fallback maintained.

**Closes:** Phase 5 Layer 3 first concrete payoff. Acceptance criterion #6.

## Sequencing notes

**Default order:** 1 → 2 → (3 ∥ 4) → 5.

**Dependency rationale:**
- Slice 1 ships the substrate that slices 2 + 5 read. Building Fury winded-trigger or Troubadour posthumous Drama on 2b.0's permissive `currentStamina > -windedValue` helper would require rewriting once slice 1's formal state machine lands. Same for Layer 3's skull emblem.
- Slice 2 wants slice 1's `StaminaTransitioned` events for clean class-δ wiring; can ship on the permissive helpers if there's appetite, but rework risk is real.
- Slice 3 is independent of slices 1 + 2. The squad row depends only on Pass 2b1's side-aware picker (shipped).
- Slice 4 is mostly independent. D2's winded ring reads slice 1's `stamina.state` but degrades gracefully to derivation. Pack-color stamping is independent.
- Slice 5 reads slice 1 (dead state, stamina transitions) + slice 4 (pack color for crit flash). Last to ship for cleanest fit.

**Parallelization candidates:**
- Slices 3 and 4 can ship in either order or in parallel — neither blocks the other.
- Per-slice work itself stays on master (no worktrees per slice — confirmed preference).
- Cross-slice parallelization via worktree-isolated agents is the user's optional shortcut for disjoint slices; not the default.

**Per-slice cadence:**
1. Per-slice brainstorm with full visual companion access (especially slices 3, 4, 5 which have heavy visual decisions).
2. Per-slice spec written to `docs/superpowers/specs/2026-MM-DD-pass-3-slice-N-<topic>-design.md`.
3. Per-slice plan written via the writing-plans skill.
4. Implementation via subagent-driven-development on master.
5. Post-shipping fixes appended as numbered PS entries to the per-slice spec (per memory `feedback_post_shipping_fixes_ps_section.md`).

## Constraints and risks

- **The umbrella crosses phase boundaries.** Phase 2b is engine work; Phase 5 is UI rebuild. Folding tracker-relevant engine sub-epics under a Phase-5 chrome-anchored name is intentional but produces a status-tracking quirk: `docs/phases.md`'s Phase 2b table will flip 🚧 → ✅ on 2b.0.1, 2b.4 (partial), 2b.5, 2b.6, 2b.9, 2b.11 as this Pass ships, while the per-slice specs live under the Phase-5 spec directory. Acceptable — same pattern as Pass 2b1 introducing 2b.11 to the Phase 2b table while shipping under Pass 5 Layer 1.
- **Slice 1's generic-override pattern absorbs more sources than originally scoped.** What started as "2b.6 Revenant inert" expanded to five distinct override plugs (Revenant inert, Hakaan rubble, Hakaan doomed × 2 entry paths, Title Doomed, CoP). Risk: scope creep on slice 1. Mitigation: the architecture is *one mechanism* with five configs, not five mechanisms — net code volume is smaller than five one-off branches. Per-slice brainstorm pressure-tests this assumption before locking the spec.
- **The 2b2a chrome contract is now load-bearing.** OpenActions row component, condition palette, AbilityCard tier-grid all rely on schema shapes that slice 2 will populate. Any post-2b2a chrome change forces a slice 2 update; any slice 2 schema change risks a chrome rework. Mitigation: cross-slice contracts section above pins the OA kind enum + perEncounterFlags shape as the only schema surface slice 2 adds, and they're additive.
- **Mode-B nav (D3) is unresolved.** Slice 4's brainstorm has to settle Templates vs Approvals vs Sessions vs combiner. Risk: spec-writing gets blocked on a design call that should have been made earlier. Mitigation: the umbrella explicitly flags this as a per-slice brainstorm decision; doesn't gate this spec.
- **Slice 5's framework primitive is new ground.** No existing event-bus pattern in `apps/web/src/` — `useSessionSocket`'s reflect path is the closest analog but it's intent-input-driven, not event-output-driven. Risk: slice 5 ends up spending half its budget on the framework before the first effect renders. Mitigation: per-slice brainstorm scopes the framework to the minimum needed for the five concrete plugs; no premature generality.
- **Cross-side trigger ordering UX (Q10) is unspecified.** Slice 1 ships `ResolveTriggerOrder` + a director prompt, but the prompt's shape (list of pending triggers, side-grouped headers, drag-to-reorder, etc.) is a design call. Mitigation: per-slice brainstorm.
- **Hakaan doomed is a direct player intent**, not an Open Action — per slice 1 brainstorm 2026-05-15. The Hakaan PC's sheet shows a `Become Doomed` button (visible when Hakaan ancestry + Doomsight purchased trait equipped) that dispatches `BecomeDoomed { source: 'hakaan-doomsight' }` directly. Director/player collaboration about when to press happens at the table, outside the app. No `hakaan-doomed-opt-in` OA kind is registered. The Title *Doomed* path *is* an OA (`title-doomed-opt-in`) because the title's trigger condition (`reachedZeroStamina` while conscious) is engine-detectable and the OA framework is the right "you can now do this" surface; the OA enum gains this single entry in slice 1.
- **Curse of Punishment recovery-refill clearing the dying state** is unverified. Slice 1's brainstorm asks the user to verify against the printed book.
- **Hakaan doomed spontaneous opt-in is gated on "Director's approval"** (canon flavor text). The Open Action implementation translates this to: the OA appears in the dying participant's list as a normal claim; canon-trust handles the Director-approval semantics at the table. Engine doesn't gate the claim on director consent; if the table wants stricter enforcement, the director can simply reject and the player doesn't claim.
- **Backwards compat for pre-Pass-3 snapshots.** Pre-Pass-3 encounters load with flat `currentStamina`/`maxStamina` + nested `recoveries: { current, max }` + `recoveryValue`. Slice 1's loader populates `staminaState` by running `recomputeStaminaState` over each participant; `staminaOverride` defaults to `null`; `bodyIntact` defaults to `true`; `triggeredActionUsedThisRound` defaults to `false`. Slice 4's `colorPack` defaults to `null` on existing characters → resolved to class-default at next encounter start. Slice 3's `squadId` is null on existing participants → they render as non-squad rows. No D1 migration intent required.

## Acceptance (umbrella-level)

Pass 3 is done when:

1. Every § 5 sub-section (resources, malice, surges) runs end-to-end at the table with no manual intervention. Closes Phase 2b acceptance criterion #1.
2. The damage state machine § 2.7-2.9 runs end-to-end. The five concrete per-trait state-override plugs work (Revenant inert, Hakaan rubble, Hakaan doomed ×2 entry paths, Title Doomed, CoP). Closes Phase 2b acceptance criterion #3.
3. `rule-questions.md` closures: Q10 (cross-side trigger order), Q16 (Revenant inert), Q-doomed (Hakaan + Title Doomed mechanics) — all flipped to ✅ or closed-with-pointer-to-canon-section.
4. The combat-tracker subset of 2b.4 conditional/triggered attachments folds correctly (Devil Wings while-flying, Color Cloak weakness conversion, Bloodfire Rush, Encepter aura, Mortal Coil) — slice 2 fixture sweep verifies each.
5. Minion squads ship: encounter builder groups N minions into a squad, the tracker renders one squad row, zipper initiative picks the squad and all members act consecutively. A 12-row goblin patrol encounter loads as 1-2 squad rows.
6. Mode-C chip carries winded ring + hero-token pip count + heroic-resource readout (D2 closed). Mode-B nav surface ships with whatever D3 settled on in slice 4's brainstorm.
7. Pack-color rail tinting visible: a 4-PC party with 4 different `colorPack` values renders 4 visually distinguished hero rows.
8. Layer 3 action-effect framework ships with all five plugs (ember border per 8 damage types, skull emblem, crit screen flash, condition animation-in, active-turn pulse expansion). Each effect individually toggleable.
9. `pnpm test`, `pnpm typecheck`, `pnpm lint` clean repo-wide. Per-slice acceptance criteria all satisfied.
10. `docs/phases.md` Phase 2b sub-epic table reflects 🚧 → ✅ for: 2b.0.1, 2b.4 (combat-tracker subset), 2b.5, 2b.6 (extended), 2b.9, 2b.11. Remaining 🚧 entries (2b.1, 2b.2, 2b.3, 2b.7, 2b.8) are outside this Pass's scope.

## Out-of-scope confirmations

- Encounter builder C1/C2/C3 (monster previews / threat budget / picker filtering) — Pass 2b2b territory.
- Phase 2b non-tracker engine: 2b.1, 2b.2, 2b.3, 2b.7, 2b.8.
- Layer 2 picker UIs (theme picker, pack-color picker, light theme palette).
- Phase 1.5 DB persistence for active context.
- Server-side dice rolling.

## Per-slice spec file naming

Slice specs land at:
- `docs/superpowers/specs/2026-MM-DD-pass-3-slice-1-damage-state-machine-design.md`
- `docs/superpowers/specs/2026-MM-DD-pass-3-slice-2-class-delta-conditional-attachments-design.md`
- `docs/superpowers/specs/2026-MM-DD-pass-3-slice-3-minion-squads-design.md`
- `docs/superpowers/specs/2026-MM-DD-pass-3-slice-4-chrome-pack-color-design.md`
- `docs/superpowers/specs/2026-MM-DD-pass-3-slice-5-action-effects-design.md`

Each slice's `Parent:` field links back to this umbrella spec.

## PS — post-shipping patches

### PS 1. Slice 2a brainstorm drop — strained / Psion OA kinds

Slice 2a brainstorm 2026-05-15 reframed the Talent strained-spend and Psion
toggle flows as client-side modals (`StrainedSpendModal`) rather than OAs.
The OA framework is the wrong primitive for synchronous single-actor self-
spends; the player is the dispatcher and already knows the state. Dropped
kinds: `talent-strained-spend-confirm`, `psion-strained-opt-in`,
`psion-clarity-damage-opt-out`. The 10th-level Psion toggles ride in the
`UseAbility` payload (`talentStrainedOptInRider`,
`talentClarityDamageOptOutThisTurn`); the strained-spend confirmation is a
client-side `StrainedSpendModal`.

### PS 2. Slice 2 split into 2a / 2b / 2c

The umbrella's original Slice 2 entry (above, § "Slice 2 — Class-δ triggers
+ conditional attachments") folded 2b.0.1 (full) + 2b.4 combat-tracker
subset into one slice. Execution split it into three:

- **Slice 2a — class-δ triggers + Open Action raisers** (shipped 2026-05-15,
  43 commits). Closed 2b.0.1 modulo three permissive predicate stubs
  documented in slice-2a PS#7 (`isJudgedBy`, `isMarkedBy`,
  `hasActiveNullField`).
- **Slice 2b — targeting relations** (brainstormed 2026-05-15,
  [spec](2026-05-15-pass-3-slice-2b-targeting-relations-design.md)).
  Closes the three slice-2a stubs by introducing a player-managed
  `Participant.targetingRelations` tagged-map (judged / marked / nullField)
  driven by per-row chip toggles, auto-derived from `UseAbility` for
  Judgment + Mark via an ability-id registry. Flips canon § 5.4 umbrella +
  § 5.4.1 / § 5.4.5 / § 5.4.7 from 🚧 → ✅. Pure stub-closure plus a small
  UI surface; no battlemap / no engine spatial.
- **Slice 2c — 2b.4 conditional attachments** (yet to be brainstormed).
  Devil *Wings* (only-while-flying), Color Cloak triggered weakness
  conversion, Orc *Bloodfire Rush* (round you took damage), Encepter aura,
  Mortal Coil +1 main action. Carries the architectural lift the umbrella
  flagged ("2b.4 is the deepest architectural change…may want to split
  further"): extending `AttachmentCondition` with runtime predicates +
  introducing a mid-encounter re-evaluation seam in the applier. Also
  picks up the slice-2a deferrals (Pray-to-the-Gods "instead of standard
  d3" per slice 2a PS#5; etc.).

The umbrella acceptance criteria (§ "Acceptance") and per-slice index
references to "Slice 2" should be read as "Slices 2a + 2b + 2c collectively"
until the umbrella is renumbered in a future sweep.
