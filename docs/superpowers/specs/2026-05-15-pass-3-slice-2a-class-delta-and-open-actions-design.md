# Pass 3 Slice 2a — Class-δ triggers, Maintenance, posthumous Drama, Psion toggles, Open Action raisers

**Status:** Designed, awaiting plan.
**Parent:** [Pass 5 Layer 1 Pass 3 — Combat Tracker Realization umbrella](2026-05-15-phase-5-layer-1-base-pass-3-combat-tracker-realization-design.md).
**Predecessor:** [Pass 3 Slice 1 — damage state machine + per-trait overrides + cross-side trigger ordering](2026-05-15-pass-3-slice-1-damage-state-machine-design.md).
**Successor:** Pass 3 Slice 2b — conditional / triggered attachments (2b.4 tracker subset; brainstormed separately).
**Scope notes:** brainstormed 2026-05-15. Engine-completion slice that finishes 2b.0.1 — the gain-trigger plumbing, Maintenance state machine, posthumous Drama, Psion toggles, and the Open Action raisers that 2b.0 stubbed. Lights up the 2b2a OpenActions chrome by populating the empty `OpenActionKindSchema` enum with the 5 new class-δ-driven kinds plus a Troubadour auto-revive kind. The umbrella's earlier `talent-strained-spend-confirm`, `psion-strained-opt-in`, and `psion-clarity-damage-opt-out` OA kinds are dropped in favor of a client-side modal pattern (P5 below).

## One-line summary

Close the chrome-vs-engine gap from 2b2a — wire the class-δ gain triggers for the 7 classes that have them (Censor, Fury, Tactician, Shadow, Null, Talent, Troubadour) plus Elementalist's within-10 essence trigger and Conduit's *Pray to the Gods*, on a hybrid dispatch substrate (slice-1 `StaminaTransitioned` subscribers for state-driven gains; per-reducer inline emission via a shared `evaluateActionTriggers` helper for action-driven gains); ship Elementalist *Maintenance* as `StartMaintenance` / `StopMaintenance` intents with auto-drop on negative-essence projection; ship Troubadour posthumous Drama via the slice-1 dying/dead state and a new `posthumousDramaEligible` flag, with an OA-gated auto-revive at 30 drama; ship 10th-level Psion toggles (rider opt-in + EoT clarity damage opt-out) as `UseAbility`-payload fields rather than OA kinds; ship the universal per-turn flag substrate as a tagged-map `perTurn` on participants plus an encounter-scoped `heroesActedThisTurn` set; surface Maintenance as a sub-section under the Essence readout on `PlayerSheetPanel` (P7 option B); ship a client-side modal primitive for strained-spend and start-maintain confirmations.

## Goals

- Make the OpenActions chrome from 2b2a *do something at the table for the heroic-resource pipeline.* Populate 6 of the 9 empty OA kinds (the four spatial triggers, `pray-to-the-gods`, and `troubadour-auto-revive`) and their copy registry entries.
- Run every § 5 sub-section end-to-end for the 9 classes — the per-class δ gain triggers, the Talent strained mechanics, the Troubadour posthumous mechanic, the Elementalist Maintenance mechanic, the 10th-level Psion toggles, and the Psion `1d3+2` per-turn variant.
- Lift the kickoff's tentative `Participant.perEncounterFlags: { tookDamageThisRound, forceMovedThisTurn, markedTargetDamaged }` sketch into a forward-compatible substrate that slice 2b's conditional attachments + future class-feature work read from. Locking the schema now means no migrations later.
- Ship the dispatch architecture as a hybrid: slice-1's `StaminaTransitioned` derived-intent substrate carries the state-driven triggers (Fury winded/dying, Troubadour winded/died); each action reducer gets a one-line `evaluateActionTriggers(state, event)` helper call that owns the event-kind switch.
- Surface Maintenance + strained-spend + start-maintain choices on the player sheet as the same client-side modal primitive — synchronous, single-actor, intent-payload-driven. Avoid the OA framework for these (it's the wrong primitive for synchronous self-spends).
- Close Phase 2b acceptance criterion #1 (every § 5 sub-section runs end-to-end) modulo the slice-2a-deferred items below.

## Non-goals (deferred)

- **2b.4 conditional / triggered attachments.** Devil *Wings* (only-while-flying), Color Cloak triggered weakness conversion, Orc *Bloodfire Rush* (round you took damage), Encepter aura, Mortal Coil +1 main action. Schema slots + flag write-paths land here so 2b doesn't migrate, but the `AttachmentCondition` extension + the applier re-evaluation cadence are slice 2b's brainstorm.
- **Non-δ-gain `perTurn` flag consumers.** Tactician mark push-shift bonus, Conduit lightning curse, Null Reactive Slide, Fury shift / push / grab / slide / knock-prone surge generators, Censor Exorcist judgment, Shadow Ash Burn / corruption space. Slice 2a writes these flags on every qualifying event so the consumers can read them when they ship, but the consumers themselves are class-feature / ability work outside slice 2a.
- **Conduit Pray-on-3 domain-effect grant.** "Activate a domain effect of your choice" per § 5.4.2 is class-feature-choice territory ([Q18](../../rule-questions.md#q18-class-feature-choice-slots--pipeline-gap-) / 2b.7). Slice 2a ships pray-on-3 as `+2 piety` only; the domain effect is a logged skip on the claim path.
- **Server-side rolling for d3 (per-turn gain, pray, etc.).** Trust model unchanged from existing — client provides; Phase 4 swap.
- **The 8th-level Talent damage-on-spend bonus** ("when you spend clarity, you can spend an additional clarity to deal 1 damage per spent clarity") and other clarity-spend modifiers beyond the 10th-level Psion toggles. Out of slice 2a.
- **The `forceMovedThisTurn` recipient flag.** No class triggers on "first time on a turn that you were force-moved" — Talent's *Telekinetic Push* per-turn limit lives on the active-effect record, not on participant state. Skipped per the user's canon sweep 2026-05-15.
- **Off-turn-crit-action holding mechanism** (verify against printed book — slice 1 PS deferral).
- **The kickoff's `troubadourWindedTriggerUsed` etc. as participant flags.** Renamed to `troubadourAnyHeroWindedTriggered` / `troubadourThreeHeroesTriggered` / `troubadourReviveOARaised` and kept on participant for per-Troubadour latches (since two Troubadours each get independent latches).

## Architecture

### Schema additions

**`Participant` additions (all additive, all defaulted):**

```ts
// packages/shared/src/participant.ts (extended)

perEncounterFlags: PerEncounterFlagsSchema.default(defaultPerEncounterFlags()),
posthumousDramaEligible: z.boolean().default(false),
psionFlags: PsionFlagsSchema.default({ clarityDamageOptOutThisTurn: false }),
maintainedAbilities: z.array(MaintainedAbilitySchema).default([]),
```

```ts
// packages/shared/src/per-encounter-flags.ts (new)

export const PerTurnEntrySchema = z.object({
  scopedToTurnOf: z.string().min(1),                  // ParticipantId whose EndTurn resets this entry
  key: PerTurnFlagKeySchema,
  value: z.union([z.boolean(), z.number(), z.array(z.string())]),
}).strict();

export const PerTurnFlagKeySchema = z.enum([
  // Slice 2a writes these (consumers in 2a or later):
  'damageDealtThisTurn',                              // scope: dealer; consumers: Tactician mark bonus, Conduit lightning curse (future)
  'damageTakenThisTurn',                              // scope: target; consumer: Null Reactive Slide (future)
  'forcedMovementApplied',                            // scope: actor; value: { push?, pull?, slide?, grab?, shift?, knockedProne? }; consumer: Fury surge generators (future)
  'usedJudgmentThisTurn',                             // scope: actor; consumer: Censor Exorcist (future)
  'movedViaAbilityThisTurn',                          // scope: actor; consumer: Null surge generator (future)
  'nullFieldTriggeredThisTurn',                       // scope: Null hero; consumer: Null surge generator (future)
  'teleportedAdjacentToThisTurn',                     // scope: actor; value: Set<enemyId> (as string[]); consumer: Shadow Ash Burn (future)
  'passedThroughSpaceThisTurn',                       // scope: actor; value: Set<enemyId>; consumer: Shadow corruption space (future)
]);

export const PerEncounterFlagsSchema = z.object({
  perTurn:      z.object({ entries: z.array(PerTurnEntrySchema).default([]) }).default({ entries: [] }),
  perRound:     PerRoundFlagsSchema.default(defaultPerRoundFlags()),
  perEncounter: PerEncounterLatchesSchema.default(defaultPerEncounterLatches()),
}).strict();
```

```ts
// PerRoundFlagsSchema (flat record, reset for all participants at EndRound)

export const PerRoundFlagsSchema = z.object({
  tookDamage:                    z.boolean().default(false), // Fury Ferocity; slice-2b Bloodfire reader
  judgedTargetDamagedMe:         z.boolean().default(false), // Censor Wrath
  damagedJudgedTarget:           z.boolean().default(false), // Censor Wrath
  markedTargetDamagedByAnyone:   z.boolean().default(false), // Tactician Focus δ-gain
  dealtSurgeDamage:              z.boolean().default(false), // Shadow Insight
  directorSpentMalice:           z.boolean().default(false), // Null Discipline (per-Null latch)
  creatureForceMoved:            z.boolean().default(false), // Talent Clarity (per-Talent latch)
}).strict();
```

```ts
// PerEncounterLatchesSchema (flat record, reset at EndEncounter)

export const PerEncounterLatchesSchema = z.object({
  firstTimeWindedTriggered:           z.boolean().default(false), // Fury
  firstTimeDyingTriggered:            z.boolean().default(false), // Fury
  troubadourThreeHeroesTriggered:     z.boolean().default(false),
  troubadourAnyHeroWindedTriggered:   z.boolean().default(false),
  troubadourReviveOARaised:           z.boolean().default(false),
}).strict();
```

```ts
// MaintainedAbilitySchema

export const MaintainedAbilitySchema = z.object({
  abilityId: z.string().min(1),
  costPerTurn: z.number().int().min(1),
  startedAtRound: z.number().int().min(1),
}).strict();
```

```ts
// PsionFlagsSchema

export const PsionFlagsSchema = z.object({
  clarityDamageOptOutThisTurn: z.boolean().default(false),
}).strict();
```

**`EncounterPhase` addition:**

```ts
// packages/shared/src/encounter.ts (extended)

perEncounterFlags: z.object({
  perTurn: z.object({
    heroesActedThisTurn: z.array(z.string()).default([]),  // Set<ParticipantId> serialized as array
  }).default({ heroesActedThisTurn: [] }),
}).default({ perTurn: { heroesActedThisTurn: [] } }),
```

The encounter-scoped `heroesActedThisTurn` is universally turn-scoped (single owner = the currently-acting participant). Not tagged. Cleared at `StartTurn`.

### Reset semantics

| Tempo | Site | Action |
|---|---|---|
| Per-turn (participant) | `EndTurn { participantId }` | For every participant: `perEncounterFlags.perTurn.entries = entries.filter(e => e.scopedToTurnOf !== participantId)` |
| Per-turn (encounter) | `StartTurn` | `state.encounter.perEncounterFlags.perTurn.heroesActedThisTurn = []` |
| Per-turn (Psion) | `EndTurn { participantId }` | `participant.psionFlags.clarityDamageOptOutThisTurn = false` |
| Per-round (participant) | `EndRound` | For every participant: `perEncounterFlags.perRound = defaultPerRoundFlags()` |
| Per-encounter (participant) | `EndEncounter` | For every participant: `perEncounterFlags.perEncounter = defaultPerEncounterLatches()`; also clear `maintainedAbilities = []`; clear `posthumousDramaEligible` if `staminaState === 'dead'` |

The tagged-map filter at `EndTurn` is O(participants × entries-per-participant) but entries-per-participant is bounded by ~8 (one per `PerTurnFlagKey`) and most are zero in practice.

### Class-δ trigger dispatch (P2 hybrid)

Two paths, distinguished by event source.

**State-driven path — `StaminaTransitioned` subscribers.**

```ts
// packages/rules/src/class-triggers/stamina-transition.ts

type StaminaTransitionTrigger = {
  match: (event: StaminaTransitionedPayload, state: CampaignState) => boolean;
  fire:  (event: StaminaTransitionedPayload, state: CampaignState) => Intent[];
};

const STAMINA_TRANSITION_TRIGGERS: StaminaTransitionTrigger[] = [
  furyFirstTimeWindedTrigger,            // class === 'fury', to === 'winded', latch unflipped → GainResource ferocity +1d3 + flip
  furyFirstTimeDyingTrigger,             // class === 'fury', to === 'dying', latch unflipped → GainResource ferocity +1d3 + flip
  troubadourAnyHeroWindedTrigger,        // any-PC to === 'winded', troubadour latch unflipped → for each Troubadour: GainResource drama +2 + flip
  troubadourHeroDiesTrigger,             // any-PC to === 'dead' → for each Troubadour: GainResource drama +10 (no latch)
  troubadourPosthumousFlagSetter,        // class === 'troubadour', to === 'dead' → set posthumousDramaEligible
];

export function evaluateStaminaTransitionTriggers(
  event: StaminaTransitionedPayload,
  state: CampaignState,
): Intent[] {
  return STAMINA_TRANSITION_TRIGGERS.flatMap(t => t.match(event, state) ? t.fire(event, state) : []);
}
```

Slice 1's emission site (`applyTransitionSideEffects` in `packages/rules/src/stamina.ts`) calls `evaluateStaminaTransitionTriggers` after computing the side-effects array and appends the returned derived intents.

**Action-driven path — per-reducer helper call.**

```ts
// packages/rules/src/class-triggers/action-triggers.ts

export type ActionEvent =
  | { kind: 'damage-applied'; dealerId: ParticipantId | null; targetId: ParticipantId; amount: number; type: DamageType }
  | { kind: 'ability-used'; actorId: ParticipantId; abilityId: string; abilityCategory: AbilityCategory; abilityKind: AbilityKind; sideOfActor: 'heroes'|'foes' }
  | { kind: 'surge-spent-with-damage'; actorId: ParticipantId; surgesSpent: number; damageType: DamageType }
  | { kind: 'creature-force-moved'; sourceId: ParticipantId | null; targetId: ParticipantId; subkind: 'push'|'pull'|'slide'; distance: number }
  | { kind: 'main-action-used'; actorId: ParticipantId }
  | { kind: 'malice-spent'; amount: number }
  | { kind: 'roll-power-outcome'; actorId: ParticipantId; abilityId: string; naturalValues: number[]; ... };

export function evaluateActionTriggers(state: CampaignState, event: ActionEvent): Intent[] { /* switch on kind */ }
```

Each action reducer's body ends with:

```ts
const triggerEffects = evaluateActionTriggers(state, { kind: 'damage-applied', dealerId, targetId, amount, type });
return { state, derived: [...existingDerived, ...triggerEffects] };
```

Inside `evaluateActionTriggers`, the switch branches by `kind`. Each branch iterates `state.participants` filtered by relevant class membership, runs the per-class predicate, and emits `GainResource` (or `RaiseOpenAction` for spatial kinds) derived intents. The per-class predicate consults `perEncounterFlags.perRound` / `perEncounter` for the relevant latch, gains the resource, and emits a flag-mutation derived intent (or mutates state directly — settled in the plan).

**One event → multiple gains.** When one event triggers multiple classes (e.g., `ApplyDamage` where the dealer is a Censor's judged target AND the target is a Fury), iteration is over `state.participants` in array order; each PC's matching triggers fire in registration order in `STAMINA_TRANSITION_TRIGGERS` / the per-kind switch. All derived intents append in deterministic order. No Q10-style cross-side prompting — these are independent resource gains, not cross-side reactions.

**Why hybrid:** state-driven gains naturally fit slice-1's existing subscriber substrate at zero new infrastructure cost. Action-driven gains keep the reducer change to one line per relevant reducer (the `evaluateActionTriggers` call). A pure event-bus would add subscribe/unsubscribe ceremony for 13 triggers — not worth slice-2 budget. A pure per-reducer-inline emission would put class-aware code in every reducer; this hybrid keeps it in one directory (`packages/rules/src/class-triggers/`).

### Spatial OA pattern (P4)

The four spatial gain triggers + Conduit *Pray to the Gods* are mediated by Open Actions. The engine never asserts spatial truth (per CLAUDE.md "grid view is Phase 4+ stretch") — it raises the OA with full event context; the eligible actor (participant owner or active director) claims if geography permits.

| OA kind | Source event | Latch | Note |
|---|---|---|---|
| `spatial-trigger-elementalist-essence` | `ApplyDamage` non-untyped non-holy | per-round, per-Elementalist | OA raised for every Elementalist with latch unflipped |
| `spatial-trigger-tactician-ally-heroic` | `UseAbility` ally + heroic category | per-round, per-Tactician | "ally" = same side, not self |
| `spatial-trigger-null-field` | `MarkActionUsed` action='main', actor side ≠ Null's side | per-round, per-Null-with-active-Null-Field | requires Null Field to have been activated (a separate active-ability state read) |
| `spatial-trigger-troubadour-line-of-effect` | `RollPower` outcome contains a natural 19/20 | no latch (fires every time) | OA payload carries the rolling participant + the natural value |
| `pray-to-the-gods` | `StartTurn` for a Conduit PC | once per turn, derived from turn boundary | raised at StartTurn before the d3 gain applies |

**Flow.** Source reducer fires → `evaluateActionTriggers` iterates PCs → for each PC whose class has a matching spatial trigger AND whose per-round latch is unflipped → emit `RaiseOpenAction { kind, participantId, payload: { eventContext } }`. OA lands in `state.openActions` with the standard slice-1 lifecycle. Player or director claims → `ClaimOpenAction { openActionId }` → reducer's per-kind case dispatches `GainResource` derived intent + flips the per-round latch via a `WriteFlag` derived intent (or direct state mutation).

**Re-raising / spam control.** Once the per-round latch flips (via claim), no new OAs of that kind raise for that PC until `EndRound`. Multiple qualifying events between encounter start and the first claim each raise their own OA — player picks the one that applies geographically and claims it. Unclaimed OAs auto-expire at `EndRound` (slice 1 framework). The Troubadour LoE nat-19/20 case has no latch — every qualifying roll raises a fresh OA; the Troubadour claims as many as apply for +3 drama each.

**Pray to the Gods (`pray-to-the-gods`):**

Special-cased among the OA kinds — raised at `StartTurn` for the Conduit PC, *before* the standard 1d3 piety gain applies. The OA's body asks the player whether to pray. Claim path resolves the canon § 5.4.2 pray table:

| `prayD3` (claim payload) | Outcome |
|---|---|
| 1 | Conduit gains +1 piety AND takes `1d6 + level` psychic damage (cannot be reduced — `ApplyDamage` with `bypassDamageReduction: true`) |
| 2 | +1 piety |
| 3 | +2 piety. Domain-effect-of-your-choice is a logged skip (see Non-goals) |

The OA's claim payload carries `{ prayD3: 1|2|3, prayDamage?: { d6: number } }`. If `prayD3 === 1`, `prayDamage.d6` is required.

Skip path: player ignores the OA → it auto-expires at `EndTurn` (special-cased to expire at end-of-current-turn rather than `EndRound`; one-line check in `EndTurn`). The standard 1d3 gain still applies at `StartTurn` (i.e., engine doesn't gate the gain on the OA — gain fires immediately, pray modifies retroactively if claimed).

Actually — to avoid retroactive mutation: the standard 1d3 fires at `StartTurn` *unless* the Pray OA is claimed before it. Cleaner: the StartTurn d3 gain is dispatched as a derived intent after the OA-raise step; if the player claims pray within the same intent batch, the d3 path is bypassed in favor of the pray resolution. **Implementation detail flagged for the plan:** decide between (a) gain-then-modify-on-claim, or (b) defer gain until OA resolves or expires. (a) is simpler; (b) is cleaner mid-turn. Settle in plan.

### Talent strained-spend client modal (P5)

No OA kinds for strained spending — the umbrella's three OA registrations (`talent-strained-spend-confirm`, `psion-strained-opt-in`, `psion-clarity-damage-opt-out`) are dropped. Reason: the OA framework is the wrong primitive for synchronous, single-actor self-spends. The player is the dispatcher; they already know they're about to strain. The OA roundtrip adds latency without information value, and director visibility is preserved via the `UseAbility` log entry carrying the toggle values.

**Client-side modal — `StrainedSpendModal.tsx`** — pops on the player's screen before dispatching `UseAbility` for any Talent ability with a clarity cost where `(currentClarity < 0) || (currentClarity - cost < 0)`. The modal shows:

- Projected clarity-after-spend
- "You'll be strained — the Strained: rider on this ability will fire" (informational; rider fires per [Q1](../../rule-questions.md#q1-strained-sub-effect-timing-) regardless)
- For 10th-level Psions only:
  - **Opt INTO Strained rider this spend** toggle (visible only when `currentClarity ≥ 0 && currentClarity - cost ≥ 0` — i.e., the spend doesn't strain, so the rider wouldn't fire otherwise)
  - **Opt OUT of EoT clarity damage this turn** toggle (visible whenever the Psion will be strained at EoT — `currentClarity - cost < 0`)
- [Cancel] / [Confirm] buttons

`UseAbility` payload extensions:

```ts
// packages/shared/src/intents/use-ability.ts (extended)

talentStrainedOptInRider?: boolean,              // 10th-level Psion: opt INTO rider when not-yet-strained
talentClarityDamageOptOutThisTurn?: boolean,     // 10th-level Psion: opt OUT of EoT clarity damage this turn
startMaintenance?: boolean,                      // Elementalist: also start maintaining this ability
```

Reducer:

- **Rider firing.** When the ability's `Strained:` rider is present in the parsed effect text, the reducer fires it if `(clarityBeforeSpend < 0) || (clarityAfterSpend < 0) || (talentStrainedOptInRider === true)`. The opt-in is only meaningful when the first two predicates are both false.
- **EoT damage opt-out.** If `talentClarityDamageOptOutThisTurn === true`, set `participant.psionFlags.clarityDamageOptOutThisTurn = true` (reset at `EndTurn` regardless). The existing Talent EoT-damage dispatch at `turn.ts:272` reads this flag and skips the damage emission for that turn.

Non-Psion Talents see the modal too, but without the toggle UI — just the projected-clarity readout and a Confirm button. Effectively a "you're about to become strained" confirmation. Could be skipped entirely for non-Psions, but the consistency of always-showing-for-strained-spends is worth the one extra click.

### Troubadour posthumous Drama + auto-revive (P6)

**Posthumous gain mechanics:**

- `Participant.posthumousDramaEligible: boolean` — set to `true` when a Troubadour transitions to `staminaState === 'dead'` (via the `troubadourPosthumousFlagSetter` subscriber on `StaminaTransitioned`). Cleared at `EndEncounter` for any participant still at `staminaState === 'dead'` (locks in canon "no future encounters"). Cleared on auto-revive claim.
- Drama gain triggers (3-heroes-acted-this-turn, any-hero-winded, hero-dies, LoE-nat-19/20) all check `(participantClass === 'troubadour' && (staminaState !== 'dead' || (posthumousDramaEligible === true && bodyIntact === true)))` as their gating predicate. Per-turn 1d3 doesn't fire — dead participants don't take turns.
- `bodyIntact` is the slice-1 carry-over flag (vaporizing damage / extreme force-move can clear it; slice 1 doesn't ship those, this is the first consumer).

**Auto-revive OA — `troubadour-auto-revive`:**

- New OA kind. Raised when a Troubadour's drama gain crosses 30 (the `GainResource` reducer inspects the resulting value; one OA per encounter, latched by `troubadourReviveOARaised`).
- Owner-or-director claimable (standard OA permission).
- Persists until claimed or `EndEncounter`. If `EndEncounter` fires first → revive missed; canon's "still dead at end of encounter" path takes effect.
- Claim → derived `TroubadourAutoRevive` server-only intent.

**`TroubadourAutoRevive` reducer:**

- `participant.currentStamina = 1`
- `participant.heroicResources[<dramaIndex>].value = 0`
- `participant.posthumousDramaEligible = false`
- `participant.perEncounterFlags.perEncounter.troubadourReviveOARaised = false` (defensive; OA is already claimed)
- `recomputeStaminaState(participant)` from slice 1 runs → state recomputes from `'dead'` to whatever stamina = 1 derives to (typically `'winded'`).
- Emit log entry "Aldrin returned to life with 1 stamina."

**Edge cases (PS-noted, implementation must handle):**

- Troubadour at drama ≥ 20 dies via `+10 hero-dies` self-trigger crossing 30 in the same death event. The flow is: `StaminaTransitioned → dead` → `troubadourPosthumousFlagSetter` runs → `troubadourHeroDiesTrigger` fires +10 drama → `GainResource` reducer detects cross-30 → raises auto-revive OA in the same derived-intent batch.
- Body destroyed (`bodyIntact = false`) after the OA was already raised — OA stays claimable. The threshold-reached snapshot is what matters.

### Elementalist Maintenance state machine (P7 + intent surface)

**New intents:**

- **`StartMaintenance { participantId, abilityId, costPerTurn }`** — player-owner or active-director. Reducer appends to `participant.maintainedAbilities`. Rejected if the participant isn't an Elementalist, if the ability doesn't exist on the participant's sheet, if the ability isn't a sustainable-eligible ability, or if it's already being maintained.
- **`StopMaintenance { participantId, abilityId }`** — player-owner or active-director. Reducer removes the entry. Idempotent (no-op if not maintained).

**Auto-drop chain:** at `StartTurn` for an Elementalist, after the +2 essence gain and the +1 first-damage-in-10sq gain (if claimed via spatial OA — could be claimed later in the round, so don't gate auto-drop on it):

```
projectedEssence = currentEssence + perTurnBaseGain  // d3-plus variant handled here
for each maintainedAbility in maintainedAbilities (descending costPerTurn):
  if projectedEssence - costPerTurn < 0:
    dispatch derived StopMaintenance for this ability
  else:
    projectedEssence -= costPerTurn
  // ability remains maintained
participant.heroicResources[essenceIndex].value = projectedEssence
```

Canon-trust: "you cannot maintain an ability that would make you earn a negative amount." The descending-cost iteration drops the most expensive first (preserves the most maintenances; alternative: drop the most-recently-started; settle in plan). Each drop dispatches its own log entry attributed to the Elementalist.

**`UseAbility` integration:** when an Elementalist uses an ability that's sustainable-eligible (a data flag on the ability — already in the parsed effect text via the `sustained` keyword detection), the client-side modal (sister to the strained-spend modal) surfaces a "Maintain this ability?" toggle. If yes, `UseAbility` dispatches with `startMaintenance: true`, and the reducer emits a derived `StartMaintenance { participantId, abilityId, costPerTurn }` after the ability resolves. `costPerTurn` comes from the ability's parsed maintenance-cost field; if not parseable, the modal shows a manual-entry input (homebrew-friendly per memory `feedback_regex_over_grammars_for_effect_text`).

**`EndEncounter` integration:** `participant.maintainedAbilities = []` for every participant (encounter-scoped per canon § 5.4 "encounter-scoped, soft-reset").

### Conduit *Pray to the Gods* (`pray-to-the-gods` OA)

See Spatial OA Pattern section above for the OA flow. Key additions to other intents:

**`StartTurn` extension:** payload gains optional `prayD3` and `prayDamage` for the claim-resolution case. The base `StartTurn` reducer for a Conduit:

1. If `pray` not yet claimed for this turn, emit `RaiseOpenAction { kind: 'pray-to-the-gods', participantId, payload: {} }`.
2. Apply standard +1d3 piety gain using `rolls.d3` payload value (existing 2b.0 path).
3. *If the player later claims `pray-to-the-gods` within this turn*, the claim reducer adjusts the piety value: undo the standard d3 gain, apply the pray-d3 outcome instead. This is the (a) gain-then-modify-on-claim approach noted above. Alternative (b) would defer the standard gain — flagged for plan resolution.

### Psion 1d3+2 + toggles

**`d3-plus` baseGain variant** stubbed in 2b.0 → wired in 2a:

```ts
// packages/rules/src/heroic-resources.ts (extended)

talent: {
  name: 'clarity',
  floor: { formula: 'negative_one_plus_reason' },
  ceiling: null,
  baseGain: {
    onEncounterStart: 'victories',
    onTurnStart: { kind: 'd3-plus', bonus: 2 },  // 10th-level Psion only; level-gated at lookup
  },
  // …
}
```

The `getResourceConfigForParticipant(state, participant)` helper checks participant level + class-feature (Psion at level 10) and returns the `d3-plus` variant for qualifying Talents; otherwise returns the standard `d3` variant. `StartTurn` reducer's d3-plus branch reads `rolls.d3` from payload, computes `gain = rolls.d3 + 2`, applies.

**Strained-rider opt-in / EoT-damage opt-out** — handled in the `UseAbility` reducer per the P5 section. Pure payload-driven; no OAs.

### `ApplyDamage` payload extension

```ts
// packages/shared/src/intents/apply-damage.ts (extended)

bypassDamageReduction?: boolean,   // defaults false; skips immunity/weakness pipeline
```

Damage-step orchestrator (`packages/rules/src/damage.ts:applyDamageStep`) branches:

```ts
if (intent.bypassDamageReduction === true) {
  delivered = amount;  // skip immunity + weakness
} else {
  delivered += sumMatching(target.weaknesses, damageType);
  delivered = Math.max(0, delivered - sumMatching(target.immunities, damageType));
}
```

The pray-on-1 case dispatches `ApplyDamage { dealerId: null, targetId: conduitId, amount: rolledD6 + level, type: 'psychic', bypassDamageReduction: true }`. Per canon "cannot be reduced," this bypasses both immunity and weakness pipelines. (Verify the immunity-bypass reading with the user; my read is "any reduction" = "neither immunity nor weakness apply" — but flag for the plan author to double-check.)

### OA copy registry sweep

```ts
// packages/shared/src/open-action-copy.ts (extended)

OPEN_ACTION_COPY['spatial-trigger-elementalist-essence'] = {
  title: () => 'Were you within 10 squares?',
  body: (oa) => `${formatParticipantName(oa.payload.targetId)} just took ${oa.payload.amount} ${oa.payload.type} damage. If you or anyone was within 10 squares, claim for +1 essence.`,
  claimLabel: () => 'Gain 1 essence',
};

OPEN_ACTION_COPY['spatial-trigger-tactician-ally-heroic'] = {
  title: () => 'Was the heroic ability within 10 squares?',
  body: (oa) => `${formatParticipantName(oa.payload.actorId)} just used ${formatAbilityName(oa.payload.abilityId)} (heroic). If they were within 10 squares of you, claim for +1 focus.`,
  claimLabel: () => 'Gain 1 focus',
};

OPEN_ACTION_COPY['spatial-trigger-null-field'] = {
  title: () => 'Was the enemy in your Null Field?',
  body: (oa) => `${formatParticipantName(oa.payload.actorId)} used a main action. If they were in the area of your Null Field, claim for +1 discipline.`,
  claimLabel: () => 'Gain 1 discipline',
};

OPEN_ACTION_COPY['spatial-trigger-troubadour-line-of-effect'] = {
  title: () => 'Was that in your line of effect?',
  body: (oa) => `${formatParticipantName(oa.payload.actorId)} rolled a natural ${oa.payload.naturalValue}. If they were within your line of effect, claim for +3 drama.`,
  claimLabel: () => 'Gain 3 drama',
};

OPEN_ACTION_COPY['pray-to-the-gods'] = {
  title: () => 'Pray to the gods?',
  body: () => `Roll 1d3 to pray instead of taking your standard piety gain. 1: +1 piety but take 1d6 + level psychic damage that can't be reduced. 2: +1 piety. 3: +2 piety.`,
  claimLabel: () => 'Pray',
};

OPEN_ACTION_COPY['troubadour-auto-revive'] = {
  title: () => 'Return to life?',
  body: (oa) => `You've reached 30 drama posthumous. You can come back to life with 1 stamina and 0 drama.`,
  claimLabel: () => 'Return to life',
};
```

`formatParticipantName` / `formatAbilityName` are existing helpers (slice-1 already uses `formatTriggerEvent`); extend if needed.

### New intents (table)

| Intent | Trust | Notes |
|---|---|---|
| `StartMaintenance { participantId, abilityId, costPerTurn }` | player-owner or active-director | Append to `maintainedAbilities`; rejected if already maintained or not Elementalist |
| `StopMaintenance { participantId, abilityId }` | player-owner or active-director | Remove from `maintainedAbilities`; idempotent |
| `TroubadourAutoRevive { participantId }` | server-only | Derived from `ClaimOpenAction { kind: 'troubadour-auto-revive' }` |

### Existing intent extensions

- **`ApplyDamage`** — `+bypassDamageReduction?: boolean`
- **`UseAbility`** — `+talentStrainedOptInRider?: boolean`, `+talentClarityDamageOptOutThisTurn?: boolean`, `+startMaintenance?: boolean`
- **`StartTurn`** — `+rolls.prayD3?: 1|2|3`, `+rolls.prayDamage?: { d6: number }`, `+prayToTheGods?: boolean`. Note: the existing `rolls.d3` from 2b.0 stays for the standard per-turn gain. The new `prayD3` is distinct (consumed only on `pray-to-the-gods` claim path).
- **`ClaimOpenAction`** — payload schema extended per kind with the 6 new kinds' choice payloads.
- **`GainResource`** (slice 1 existing) — on drama gain to a Troubadour that crosses 30 + `posthumousDramaEligible === true` + `troubadourReviveOARaised === false`, emit derived `RaiseOpenAction { kind: 'troubadour-auto-revive' }` + flip the latch.

### File organization

```
packages/shared/src/
├── participant.ts                +perEncounterFlags, posthumousDramaEligible, psionFlags, maintainedAbilities
├── per-encounter-flags.ts        NEW — PerEncounterFlagsSchema + sub-schemas + defaults + types
├── maintained-ability.ts         NEW — MaintainedAbilitySchema + type
├── psion-flags.ts                NEW — PsionFlagsSchema + type
├── encounter.ts                  +perEncounterFlags on EncounterPhase
├── open-action.ts                +6 new kinds in OpenActionKindSchema
├── open-action-copy.ts           +6 new entries
├── intents/
│   ├── start-maintenance.ts      NEW — payload + Zod schema
│   ├── stop-maintenance.ts       NEW — payload + Zod schema
│   ├── troubadour-auto-revive.ts NEW — server-only payload
│   ├── apply-damage.ts           +bypassDamageReduction in payload schema
│   ├── use-ability.ts            +talentStrainedOptInRider, talentClarityDamageOptOutThisTurn, startMaintenance
│   ├── start-turn.ts             +prayD3, prayDamage, prayToTheGods
│   └── index.ts                  re-export the new intents

packages/rules/src/
├── class-triggers/
│   ├── stamina-transition.ts     NEW — 5 subscribers (Fury winded, Fury dying, Troubadour winded, Troubadour died, Troubadour-posthumous-eligible setter)
│   ├── action-triggers.ts        NEW — evaluateActionTriggers + ActionEvent discriminated union + per-class registries
│   ├── per-class/
│   │   ├── censor.ts             NEW — Censor Wrath triggers
│   │   ├── fury.ts               NEW — Fury Ferocity took-damage trigger (winded/dying live in stamina-transition.ts)
│   │   ├── tactician.ts          NEW — Tactician Focus marked-target trigger + ally-heroic spatial OA raiser
│   │   ├── shadow.ts             NEW — Shadow Insight surge-damage trigger
│   │   ├── null.ts               NEW — Null Discipline malice-spend trigger + null-field-main-action spatial OA raiser
│   │   ├── talent.ts             NEW — Talent Clarity force-move trigger
│   │   ├── troubadour.ts         NEW — Troubadour Drama three-heroes trigger + LoE-19/20 spatial OA raiser + drama-cross-30 OA raiser
│   │   ├── elementalist.ts       NEW — Elementalist Essence within-10 spatial OA raiser
│   │   └── conduit.ts            NEW — Conduit Pray to the Gods OA raiser
│   └── index.ts                  NEW — barrel
├── heroic-resources.ts           +d3-plus baseGain wiring; +extraGainTriggers populated where they're table-driven
├── stamina.ts                    applyTransitionSideEffects calls evaluateStaminaTransitionTriggers
├── damage.ts                     applyDamageStep branches on bypassDamageReduction
├── intents/
│   ├── start-maintenance.ts      NEW reducer
│   ├── stop-maintenance.ts       NEW reducer
│   ├── troubadour-auto-revive.ts NEW reducer
│   ├── apply-damage.ts           +bypassDamageReduction branch + perTurn flag writes (damageDealtThisTurn, damageTakenThisTurn) + perRound flag writes (tookDamage on target, damagedJudgedTarget if applicable, etc.) + evaluateActionTriggers call
│   ├── use-ability.ts            +heroesActedThisTurn write + Talent toggle handling + Maintenance derived dispatch + evaluateActionTriggers call
│   ├── roll-power.ts             +dealtSurgeDamage perRound flag + LoE 19/20 OA raise + evaluateActionTriggers call
│   ├── push.ts / pull.ts / slide.ts (or whatever force-move reducers are named)
│   │                             +creatureForceMoved perRound flag + forcedMovementApplied perTurn counter + evaluateActionTriggers call
│   ├── mark-action-used.ts       +main-action-in-Null-Field OA raise + evaluateActionTriggers call
│   ├── gain-malice.ts            +directorSpentMalice perRound flag (on malice spend; verify file name — may be spend-malice instead) + evaluateActionTriggers call
│   ├── start-turn.ts             +Elementalist maintenance cost deduction chain + Pray-to-the-gods OA raise for Conduits + d3-plus per-turn gain + Psion EoT-damage-opt-out flag carry-over + heroesActedThisTurn reset
│   ├── end-turn.ts               +per-turn tagged-map entry filter (for participantId) + Talent EoT clarity damage with Psion opt-out + heroesActedThisTurn cleared
│   ├── end-round.ts              +per-round flag reset
│   ├── end-encounter.ts          +per-encounter flag reset + posthumousDramaEligible clear for still-dead participants + maintainedAbilities cleared for every participant
│   ├── claim-open-action.ts      +6 new kind cases (spatial gains, pray, auto-revive)
│   └── gain-resource.ts          +on-drama-cross-30 raise troubadour-auto-revive OA (latched) +general perEncounter latch handling for δ-gains
├── permissions.ts                +trust for the new intents
└── reducer.ts                    +dispatch cases for the new intents

apps/web/src/
├── primitives/
│   └── (existing — used)
├── pages/character/
│   ├── PlayerSheetPanel.tsx              +Maintenance sub-section under Essence block (P7 option B)
│   ├── EssenceBlock.tsx                  NEW or extended — Maintenance list + auto-drop warning glyph + net-per-turn readout
│   ├── StrainedSpendModal.tsx            NEW (P5 client-side)
│   ├── StartMaintenanceModal.tsx         NEW (sister to StrainedSpendModal — first-Use toggle)
│   └── PsionToggles.tsx                  NEW or inlined — the two 10th-level Psion toggle inputs (used inside StrainedSpendModal)
├── pages/combat/
│   └── (no new top-level mount — OAs already rendered from 2b2a chrome)
└── lib/
    └── format-open-action.ts             +6 new kind cases for body/title interpolation (per kind)

docs/
├── rules-canon.md                        flip § 5.3, § 5.4.1–5.4.8, § 5.5 status entries that slice 2a closes (full slate of class-δ gains, Maintenance, posthumous Drama)
├── rule-questions.md                     no changes (Q1/Q2/Q3 already resolved; Q18 stays 🟡)
└── phases.md                             flip 2b.0.1 🚧 → ✅
```

### Cross-slice handoff to slice 2b

Slice 2a's flag write-paths are forward-compatible with slice 2b. Specifically:

- `participant.perEncounterFlags.perRound.tookDamage` — slice 2a sets this on every `ApplyDamage` where the target is the participant. Slice 2b's Orc *Bloodfire Rush* reads it.
- `participant.perEncounterFlags.perTurn.entries` with various `key` values — slice 2a writes them all. Slice 2b's consumers (when class-features land) read them.
- `AttachmentCondition` extension to runtime predicates is slice 2b's brainstorm.

### Trust model — additions

| Intent | Trust |
|---|---|
| `StartMaintenance` | `actor.userId === participant.ownerId` (player-owner) OR active director |
| `StopMaintenance` | same as `StartMaintenance` |
| `TroubadourAutoRevive` | server-only (in `SERVER_ONLY_INTENTS`) |
| `ClaimOpenAction { kind: 'troubadour-auto-revive' }` | owner-or-director (standard OA permission) |
| `ClaimOpenAction { kind: 'spatial-trigger-*' }` | owner-or-director |
| `ClaimOpenAction { kind: 'pray-to-the-gods' }` | owner-or-director |

## Testing strategy

### Unit tests (`packages/rules/tests/`)

- **`class-triggers/stamina-transition.spec.ts`** — each of the 5 subscribers' match/fire logic: Fury winded latch, Fury dying latch, Troubadour winded encounter-latch, Troubadour hero-dies (+10, no latch), posthumous-eligible setter.
- **`class-triggers/action-triggers.spec.ts`** — `evaluateActionTriggers` for each `ActionEvent` kind:
  - `damage-applied` → fires Censor wrath (judged-target dmg by/to), Fury ferocity (took damage), Tactician focus (marked-target damaged), no-op if no qualifying PC
  - `ability-used` → fires Tactician ally-heroic spatial OA raise (if any Tactician), updates `heroesActedThisTurn`, fires Troubadour three-heroes-trigger when set hits ≥ 3 with latch unflipped
  - `surge-spent-with-damage` → fires Shadow insight
  - `creature-force-moved` → fires Talent clarity
  - `main-action-used` → fires Null discipline null-field spatial OA raise (if any Null with active field, actor on opposite side)
  - `malice-spent` → fires Null discipline director-malice latch
  - `roll-power-outcome` (nat 19/20) → fires Troubadour LoE spatial OA raise (no latch — every time)
- **`class-triggers/per-class/<class>.spec.ts`** — one spec per class file with table-driven cases covering the predicate logic.
- **`intents/start-maintenance.spec.ts`** — happy path appends; rejected for non-Elementalist; rejected for duplicate ability id; permission check.
- **`intents/stop-maintenance.spec.ts`** — removes; idempotent; permission check.
- **`intents/troubadour-auto-revive.spec.ts`** — sets stamina to 1, resets drama, clears flag, recomputes state.
- **`intents/apply-damage.spec.ts`** — extend existing: `bypassDamageReduction: true` skips both immunity and weakness; multi-type damage with bypass.
- **`intents/use-ability.spec.ts`** — extend with: Talent strained spend with `optInRider: true` fires rider even when clarity stays ≥ 0; `optOutOfClarityDamage: true` sets the per-turn flag; `startMaintenance: true` emits derived `StartMaintenance` intent for Elementalist sustained ability.
- **`intents/start-turn.spec.ts`** — extend with: Elementalist maintenance auto-drop chain (3 maintained abilities, +2 gain projected to -1 → drop highest-cost → re-check); Conduit Pray OA raise; Talent's d3-plus variant for 10th-level Psion.
- **`intents/end-turn.spec.ts`** — extend with: per-turn tagged-map entries scoped to ending participant get filtered; Psion `clarityDamageOptOutThisTurn` cleared; Talent EoT clarity damage skipped when opt-out set.
- **`intents/end-round.spec.ts`** — extend with: per-round flags reset for every participant.
- **`intents/end-encounter.spec.ts`** — extend with: per-encounter latches reset; `posthumousDramaEligible` cleared for still-dead participants; `maintainedAbilities = []` for everyone.
- **`intents/claim-open-action.spec.ts`** — extend with: each new kind's claim resolution emits the right derived intents (`GainResource` for spatial, special handling for pray-on-1/2/3, `TroubadourAutoRevive` for auto-revive).
- **`intents/gain-resource.spec.ts`** — drama cross-30 with `posthumousDramaEligible: true` and unflipped revive-latch emits `RaiseOpenAction { kind: 'troubadour-auto-revive' }`; cross-30 with latch already flipped is a no-op; cross-30 with `posthumousDramaEligible: false` (alive Troubadour) is a no-op.

### Schema tests (`packages/shared/tests/`)

- **`per-encounter-flags.spec.ts`** — round-trip with mixed tagged-map entries; defaults; rejection of malformed `scopedToTurnOf`.
- **`open-action.spec.ts`** — `OpenActionKindSchema` accepts all 6 new kinds; copy registry has an entry for each.
- **`maintained-ability.spec.ts`** — schema rejection of zero / negative `costPerTurn`.

### UI tests (`apps/web/src/__tests__/` or co-located)

- **`PlayerSheetPanel.spec.tsx`** — Maintenance sub-section renders under Essence; empty state ("Maintaining: none"); single + multiple maintained abilities; net per-turn readout; stop button dispatches `StopMaintenance`.
- **`StrainedSpendModal.spec.tsx`** — modal appears on strained-spend; projected-clarity-after readout; Psion toggles visible only for 10th-level Psion; toggle states; Cancel doesn't dispatch; Confirm dispatches `UseAbility` with toggle values.
- **`StartMaintenanceModal.spec.tsx`** — appears on first Use of sustained-eligible Elementalist ability; Confirm dispatches `UseAbility { startMaintenance: true }`.
- **OA list snapshot tests** — each of the 6 new kinds renders title / body / claim button correctly; disabled states for non-eligible actors.

### Integration test

**`packages/rules/tests/slice-2a-integration.spec.ts`** — a 4-PC encounter (Fury Talia / Troubadour Aldrin / Elementalist Korva / Talent Eldra) running 3 rounds:

- **Round 1.** Korva uses *Storm Aegis* (sustained, 2 essence/turn) — `StartMaintenance` dispatched. Talia takes 8 damage from a goblin — Fury `tookDamage` per-round flag set, +1d3 ferocity gained, latch flipped. Eldra spends 4 clarity (with 2 in pool, ending at -2) — strained modal flow, no Psion toggles (Eldra is 5th level), spend applies, rider fires. Aldrin uses *Inspiring Word* — `heroesActedThisTurn` adds Aldrin. Two more heroes use abilities → set hits 3 → Troubadour three-heroes-trigger fires → +2 drama → latch flipped.
- **Round 2.** Korva at `StartTurn`: essence at 3 → +2 gain → projected 5 → -2 (Storm Aegis) → ends at 3. No auto-drop. Talia takes more damage but the per-round `tookDamage` latch is set (we're on round 2 now — actually wait, latches reset at `EndRound`; `tookDamage` per-round latch was flipped in round 1, reset at end of round 1, so it's unflipped in round 2 — re-flip on this damage event). +1d3 ferocity again. Aldrin (Troubadour) becomes winded → `troubadourAnyHeroWindedTriggered` fires for Aldrin himself → +2 drama → latch flipped.
- **Round 3.** Aldrin reduced past `-windedValue` → `staminaState = 'dead'` → `posthumousDramaEligible` set. +10 drama from `troubadourHeroDiesTrigger`. Drama goes from (say) 18 → 28. Eldra rolls a natural 20 (per-class, Talent) — Troubadour LoE OA raised. Director / player claims — +3 drama → 31, cross-30 → auto-revive OA raised. Aldrin's player claims → stamina to 1, drama to 0, state recomputes to `winded`.
- **EndEncounter.** Korva's `maintainedAbilities` cleared. Everyone's per-encounter latches reset. All resources reset to 0 per § 5.4 lifecycle.

Plus a separate test for the auto-drop chain: an Elementalist with two maintained abilities (2 + 3 essence/turn) at essence = 1, gain +2 → projected 3 → -3 (drop one) → projected 0 → -2 (auto-drop second) → final 0.

## Constraints and risks

- **`perEncounterFlags` is a load-bearing schema addition.** Slice 2b reads it; future class-feature work reads it. The tagged-map shape locks now without migration cost — but if it turns out to be wrong (e.g., "on a turn" universally means "currently-active turn" rather than scoped-to-a-specific-participant's-turn, per the alternate interpretation flagged in P3), the entries would need re-shaping. Mitigation: the tagged-map handles both interpretations correctly — write sites pick `scopedToTurnOf` based on canon read; if all writes use `state.activeTurnParticipantId`, the model collapses to "current-turn" semantics for free.
- **The action-triggers evaluator is the slice's most-touched code site.** Every action reducer calls it. Getting the `ActionEvent` discriminated union right matters. The plan should pin the union early and verify the per-reducer call sites land before the per-class trigger registrations.
- **Pray-on-1 `bypassDamageReduction` reading.** Canon "cannot be reduced" — my read bypasses both immunity and weakness. The plan author should verify against the printed Heroes Book before locking the reducer behavior; if "cannot be reduced" means only "can't be reduced below the base value" (i.e., immunity bypassed but weakness still adds), the reducer branches differently. Flagged for plan-time verification.
- **`StartMaintenance` cost-per-turn parsing.** Sustained-ability cost is parsed from the ability's effect text. If the parser doesn't extract it cleanly, the StartMaintenance modal must surface a manual-entry input (homebrew-friendly per memory). Plan should verify that the existing ability-data pipeline emits `maintenanceCost?: number` on parsed abilities; if not, slice 2a adds the parser path.
- **Auto-drop policy** (descending cost vs most-recently-started) — settle in plan with reference to canon. Canon doesn't specify; my read is descending cost preserves the most maintenances. User confirmation when plan author proposes.
- **Pray-to-the-gods gain-then-modify-on-claim vs defer-gain.** The (a) gain-then-modify approach has a wrinkle: if the player claims pray AFTER doing something else on their turn that read piety value, the read was off the un-prayed value. The (b) defer-gain approach is correct but adds a new "piety not yet computed" intermediate state. Plan should pick; (a) is simpler if we accept the read-staleness.
- **Backwards compat for pre-slice-2a snapshots.** Load with `perEncounterFlags` defaulting to empty/zero everywhere; `posthumousDramaEligible: false`; `psionFlags: { clarityDamageOptOutThisTurn: false }`; `maintainedAbilities: []`. No D1 migration intent required. Slice-2b consumers reading `perEncounterFlags.perRound.tookDamage` will see `false` on old snapshots — correct default.
- **WS-mirror reflect needs to handle the new derived-intent cascade.** Same pattern as slice 1 PS#1: WS mirror bypasses Zod parsing and needs to invoke `evaluateActionTriggers` / `evaluateStaminaTransitionTriggers` in its reflect path to keep optimistic UI in sync. Plan must include a WS-mirror sweep.
- **Umbrella spec patches required.** The umbrella's Open Action kind registry lists `talent-strained-spend-confirm`, `psion-strained-opt-in`, and `psion-clarity-damage-opt-out` as additions for slice 2. Slice 2a drops all three in favor of the client-side modal pattern. The umbrella spec gets a PS-style note in the same commit as slice 2a's first patch.
- **Reducer trust-check boilerplate** — same pattern as slice 1 PS#2: `requireParticipant(state, id)`, `requirePlayerOwnerOrDirector(state, intent, participantId)` helpers would help, but the slice doesn't take the refactor.
- **`SpendMalice` vs `gain-malice` -negation reducer shape.** The kickoff's class-trigger for Null *Discipline* (Director-spends-Malice) hooks malice-spending events. Plan must verify whether spending Malice is a dedicated `SpendMalice` intent or happens inline in `UseAbility` (when an ability has a Malice cost). Either way, one write site, one event-kind branch in `evaluateActionTriggers`.

## Acceptance

Slice 2a is done when:

1. **Class-δ gain triggers for the 7 classes (Censor, Fury, Tactician, Shadow, Null, Talent, Troubadour) fire correctly.** Each class's spec exercises every canon-listed extra gain trigger and verifies the resource pool gains the correct amount with the correct latch behavior (per-round vs per-encounter; first-time vs every-time).
2. **Elementalist Essence within-10 spatial OA raises on every qualifying `ApplyDamage` event (non-untyped non-holy) for every Elementalist with the per-round latch unflipped.** Claim fires `GainResource { participant, name: 'essence', amount: 1 }` + flips the latch.
3. **Tactician Focus ally-heroic spatial OA raises** on every qualifying `UseAbility` event for ally + heroic-category abilities, for every Tactician with the per-round latch unflipped. Claim → +1 focus + flip.
4. **Null Discipline null-field spatial OA raises** on every enemy main-action event for every Null with an active Null Field ability and per-round latch unflipped. Claim → +1 discipline + flip.
5. **Troubadour Drama LoE-19/20 spatial OA raises** on every nat-19/20 `RollPower` outcome for every Troubadour (no latch — every time). Claim → +3 drama.
6. **Conduit Pray-to-the-Gods OA raises at `StartTurn`** for every Conduit. Claim path resolves the canon pray table (1→+1 piety + 1d6+level psychic damage bypassing reduction; 2→+1; 3→+2 + skipped-domain-effect logged). Skip path → standard 1d3 gain applies.
7. **Elementalist Maintenance state machine.** `StartMaintenance` appends; `StopMaintenance` removes; `StartTurn` deducts `sum(costPerTurn)` after gains; auto-drop chain runs when projected essence would go negative; `EndEncounter` clears `maintainedAbilities`.
8. **Troubadour posthumous Drama.** Death sets `posthumousDramaEligible`; gain triggers fire normally while dead + bodyIntact; drama cross-30 raises `troubadour-auto-revive` OA (latched); claim restores stamina to 1, drama to 0, recomputes state. `EndEncounter` while still dead clears the flag.
9. **10th-level Psion features.** `d3-plus` baseGain applies for Psion-level Talents; rider opt-in fires Strained: rider even when clarity stays ≥ 0; EoT clarity damage skips when opt-out set for the turn.
10. **Per-encounter flag substrate.** Tagged-map `perTurn` entries set/read/reset correctly per their `scopedToTurnOf` field; per-round flat record set/read/reset at `EndRound`; per-encounter latches set/read/reset at `EndEncounter`. Encounter-scoped `heroesActedThisTurn` set populated by `UseAbility`; reset at `StartTurn`.
11. **`UseAbility` extensions.** Payload accepts the new optional toggle fields; reducer dispatches derived `StartMaintenance` when `startMaintenance: true`; rider firing predicate is `(before<0 || after<0 || optInRider)`; EoT damage opt-out persists in `psionFlags` until next `EndTurn`.
12. **`ApplyDamage` extension.** `bypassDamageReduction: true` skips both immunity and weakness in `applyDamageStep`. Verified against Pray-on-1 path.
13. **OA copy registry.** All 6 new kinds have title + body + claimLabel entries; body interpolates payload values correctly; existing slice-1 `title-doomed-opt-in` copy is verified still present.
14. **`PlayerSheetPanel` Maintenance sub-section.** Renders under Essence block; empty state when no maintained abilities; per-ability rows with stop buttons; net per-turn readout; auto-drop warning glyph when projected essence-next-turn ≤ 0.
15. **`StrainedSpendModal` + `StartMaintenanceModal`** — both client-side, both dispatch `UseAbility` with the right payload toggles, both styled per `apps/web/src/primitives/` + `apps/web/src/theme/` per memory `feedback_ui_is_prototype_until_overhaul`.
16. **Pre-slice-2a snapshots load without crash.** All new fields default to safe values; `recomputeStaminaState` on every participant; no migrations.
17. **Trust model.** New intents (`StartMaintenance`, `StopMaintenance`) accept from player-owner or active-director; rejected from other actors. `TroubadourAutoRevive` is in `SERVER_ONLY_INTENTS`. OA claims for the 6 new kinds accept owner-or-director.
18. **Umbrella spec patch shipped in the same commit as slice 2a's first patch.** Drop `talent-strained-spend-confirm`, `psion-strained-opt-in`, `psion-clarity-damage-opt-out` from the OA kind registry; note the client-side-modal substitution.
19. **`docs/rules-canon.md` § 5.3 / § 5.4.1–5.4.8 / § 5.5 status entries flip** for the parts slice 2a closes (the per-class δ gains, Maintenance, posthumous Drama, surges already ✅).
20. **`pnpm test`, `pnpm typecheck`, `pnpm lint` clean repo-wide.** Per-test-file additions listed under Testing strategy all pass.
21. **`docs/phases.md` Phase 2b sub-epic table flips 2b.0.1 🚧 → ✅.**

## Out-of-scope confirmations

- 2b.4 conditional / triggered attachments (slice 2b's brainstorm).
- Non-δ-gain `perTurn` flag consumers (future class-feature / ability work).
- Conduit Pray-on-3 domain-effect grant (Q18 / 2b.7 territory).
- Server-side dice rolling.
- Encounter builder C1/C2/C3 (Pass 2b2b territory).
- Phase 2b non-tracker engine work (2b.1, 2b.2, 2b.3, 2b.7, 2b.8 — outside Pass 3 umbrella).
- Off-turn-crit-action holding mechanism (slice 1 PS deferral).

## PS — Execution-Time Corrections

Future post-shipping fixes to Slice 2a layer the same way slice 1's did: append a numbered entry to this PS section with a one-line symptom, a one-paragraph fix, and the relevant commit SHA. Once a follow-up entry has shipped *and* been verified in real use, leave it in place — the doc is the historical record, not a TODO list.

### Plan-time corrections (from plan self-review)

1. **EncounterPhase location.** `EncounterPhase` is a TS type in `packages/rules/src/types.ts`, NOT a Zod schema in `packages/shared/src/encounter.ts`. Task 4 corrected in the plan before execution.
2. **Server-only flag-write intents.** Enumerated as concrete intents: `SetParticipantPerRoundFlag`, `SetParticipantPerTurnEntry`, `SetParticipantPerEncounterLatch`, `SetParticipantPosthumousDramaEligible`.
3. **New per-round latches** added to `PerRoundFlagsSchema`: `allyHeroicWithin10Triggered`, `nullFieldEnemyMainTriggered`, `elementalistDamageWithin10Triggered`.

### Execution-time findings (per `feedback_post_shipping_fixes_ps_section`)

1. **`Math.random` purity contract restoration.** Task 10's initial implementation called `Math.random()` inside `packages/rules/src/class-triggers/stamina-transition.ts`, violating the engine's purity contract. Fixed in commit `8a779b1`: removed `rollFerocityD3` helper; added `StaminaTransitionTriggerContext { actor; rolls: { ferocityD3? } }` parameter to `evaluateStaminaTransitionTriggers`. Mirrored for the action-triggers evaluator in Task 11 fix (commit `101c993`).

2. **`actor: ctx.actor` propagation in trigger emitters.** Task 10's initial emitters synthesized `actor: { userId: 'server', role: 'director' }` literals — lied about attribution and synthesized director authority. Same commit `8a779b1` fixed by threading `ctx.actor` through emissions. All slice-2a class triggers now correctly attribute derived intents to the originating intent's actor.

3. **EndRound wipe over-reach.** Task 3's fixture-fixup commit (`fc651c8`) added 4 lines to `apps/web/src/ws/useSessionSocket.ts:238-241` that wiped slice-2a fields on EndRound. Fixed in commit `74eeca7`: those fields (`posthumousDramaEligible`, `psionFlags`, `maintainedAbilities`, `perEncounterFlags`) have their own reset scopes (revive / EndTurn / per-encounter); EndRound should only reset `perEncounterFlags.perRound`. Task 34 (WS-mirror) confirmed Task 25's authoritative EndRound semantics.

4. **Fury Ferocity damage-only filter.** Task 16's initial wiring would throw on heal-into-winded for a Fury (latch unflipped + apply-heal supplies no `ferocityD3`). Fixed in commit `0549f80`: added `event.cause !== 'damage'` filter to both Fury Ferocity matchers in `stamina-transition.ts`. Also defensively applied to Troubadour any-hero-winded matcher (heal-into-winded shouldn't reward drama; canon "becomes winded" reads as a threat-pressure event). Troubadour hero-dies and posthumous-flag matchers remain unfiltered (death has multiple legitimate causes).

5. **Pray-to-the-Gods "undo standard d3" deferred to slice 2c.** Task 27 (`claim-open-action.ts`) currently implements pray as an ADDITIVE piety gain on top of the standard StartTurn d3 — over-counts by 1-2 piety per pray claim. Proper "instead of" semantics requires either persisting StartTurn `rolls.d3` outcome in encounter state or deferring the standard gain until pray-OA expiry. Deferred to slice 2c; documented TODO in `claim-open-action.ts`.

6. **`Participant.side` doesn't exist (plan typo).** Plan source at lines 2125/2181 referenced `p.side` / `actor.side` for ally / enemy checks. The codebase derives side via `participantSide(p)` helper (`packages/rules/src/state-helpers.ts:53`), which returns 'heroes' for `kind === 'pc'`, 'foes' for monsters. Tasks 13, 15 used the correct derivation; Tasks 11/22 use `event.sideOfActor` from the ActionEvent payload.

7. **Permissive helper stubs for Slice 2b/2c follow-up:**
   - `isJudgedBy` (Censor) — TODO Slice 2b/2c — Judgment target tracking
   - `isMarkedBy` (Tactician) — TODO Slice 2b/2c — Mark target tracking
   - `hasActiveNullField` (Null) — TODO Slice 2b/2c — active-ability lookup
   - Until these land, the 3 affected triggers over-fire and the canon entries are flagged manual-override.

8. **`hasPsionFeature` heuristic.** Task 17 used `participant.level >= 10` as the interim Psion-feature gate (since Q18 class-feature-choice schema isn't shipped). Over-includes 10th-level Talents who choose non-Psion features. Rewire when Q18 lands.

9. **`apps/api/src/lobby-do.ts` SERVER_ONLY_INTENTS hard-code.** Pre-existing tech debt unrelated to slice 2a — lobby-do.ts has its own hardcoded `SERVER_ONLY_INTENTS` set of 4 intents that doesn't consume the engine's `SERVER_ONLY_INTENTS` from `@ironyard/shared`. Task 29 added the engine-level `canDispatch` but the lobby boundary doesn't yet use it. Server-only intents Task 6/10/12/21 added are not enforced at the lobby boundary today. Follow-up task to wire `lobby-do.ts` to consume `canDispatch` + the shared SERVER_ONLY_INTENTS.

10. **`StrainedSpendModal` integration deferred.** Task 31's modal was shipped with comprehensive tests but not wired to PlayerSheetPanel. The player-side ability-card click currently routes to RollPower (not UseAbility); wiring requires building a new UseAbility dispatch surface (Talent detection + clarity cost metadata + Psion check). Out-of-scope for slice 2a. TODO in PlayerSheetPanel.tsx.

11. **`OpenActionsList.tsx` fallback duplication.** Task 33 created `apps/web/src/lib/format-open-action.ts` but the inline fallback logic in `OpenActionsList.tsx` was left in place. Follow-up: replace inline logic with `formatOpenAction()` call.

12. **`DirectorCombat.tsx` stub state.** Task 25 + 17 coordination updated DirectorCombat to call `getResourceConfigForParticipant` with a synthesized stub state. Stub is sufficient today (helper only reads `p.className` and `p.level`) but brittle if future heroic-resource variants read other state fields. Follow-up: thread the real CampaignState from useSessionSocket.
