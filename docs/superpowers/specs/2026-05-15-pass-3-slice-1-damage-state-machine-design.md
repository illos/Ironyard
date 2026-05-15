# Pass 3 Slice 1 — Damage state machine + per-trait overrides + cross-side trigger ordering

**Status:** Designed, awaiting plan.
**Parent:** [Pass 5 Layer 1 Pass 3 — Combat Tracker Realization umbrella](2026-05-15-phase-5-layer-1-base-pass-3-combat-tracker-realization-design.md).
**Successor:** Pass 3 Slice 2 — class-δ triggers + conditional attachments (spec'd separately).
**Scope notes:** brainstormed 2026-05-15. Engine-foundational slice — substrate for the rest of Pass 3. Folds in Phase 2b sub-epics 2b.5 (damage-engine state transitions § 2.7-2.9), 2b.6 (extended to a generic per-trait override pattern with five concrete plugs), 2b.9 (cross-side triggered-action ordering — Q10), and the § 4.10 critical-hit extra-main-action rule.

## One-line summary

Replace the engine's permissive `currentStamina ≥ 0 → max` stamina model with the canonical state machine (healthy / winded / dying / dead / unconscious / inert / rubble / doomed) backed by a generic per-trait override pattern that absorbs Revenant *Tough But Withered*, Hakaan *Doomsight* rubble, Hakaan *Doomsight* doomed (as a player-pressed intent), Title *Doomed* (Open-Action opt-in), and Curse of Punishment as five concrete plugs without N one-off code paths; ship the KO-interception path on `wouldHitDead` with attacker opt-in; ship `ResolveTriggerOrder` to close Q10's cross-side trigger order; ship the critical-hit extra-main-action rule from § 4.10; surface all of it on `ParticipantRow` as a state tag and on the player sheet as a `Become Doomed` button for Hakaan-Doomsight PCs.

## Goals

- Run the canon § 2.7-2.9 stamina state machine end-to-end: heroes go negative into dying when stamina ≤ 0 and die at stamina ≤ -windedValue. Auto-Bleeding (non-removable) on dying. Director creatures die at stamina ≤ 0 with no dying state.
- Ship the KO interception path (§ 2.9): at the moment damage would push a creature past their death threshold, the attacker may opt for KO instead. No damage applies, Unconscious + Prone conditions land, the next damage of any kind kills.
- Ship the generic `ParticipantStateOverride` pattern with five concrete plugs (Revenant inert, Hakaan rubble, Hakaan doomed, Title Doomed, Curse of Punishment). Each plug intercepts a specific transition or asserts an additional state-entry predicate.
- Close rule-questions.md Q10 (cross-side trigger order) by shipping `ResolveTriggerOrder` and a director-only modal that prompts when triggered actions from both sides fire on the same event.
- Wire the § 4.10 critical-hit extra-main-action rule: nat 19/20 on an ability used as a main action grants an extra main action immediately (even off-turn, even dazed).
- Lift the permissive `currentStamina > -windedValue` alive-check that 2b.0 shipped with into a precise state-machine read. Reify the `bodyIntact` flag that 2b.0.1 anticipated for Troubadour posthumous Drama.
- Extend the existing Bleeding-trigger discriminant surface to match canon (main action, triggered action, Might/Agility test, ability roll).
- Surface the state machine on the UI: participant-row state tag (Winded / Dying / Dead / KO / Inert / Rubble / Doomed); player-sheet `Become Doomed` button for Hakaan-Doomsight PCs; Title Doomed opt-in OA on `reachedZeroStamina` while conscious; director-only cross-side trigger resolution modal.

## Non-goals (deferred)

- **Death saves** — Draw Steel has no death-save mechanic. The umbrella spec's reference to "death saves" was D&D-flavored colloquial shorthand for the dying state itself; the natural dying → dead progression is via Bleeding damage when the dying hero acts. No `SaveAgainstDeath` intent ships in slice 1 (umbrella patched in same commit).
- **Visual polish for the state tags.** The minimal text-only tag ships in slice 1 (`DYING` / `DEAD` / `KO` / etc. on the row). Embellished treatments — winded ring around the Mode-C sigil, slain-foe skull emblem, color-cued dying glow — defer to slices 4 + 5.
- **Trait/title/complication registration.** The five concrete override plugs read participant state but slice 1 doesn't wire the trait/title/complication systems to *set* that state. Hakaan-Doomsight equip detection, Title-Doomed equip detection, CoP complication registration all sit in 2b.7 / 2b.8 character-build territory (out of umbrella). Slice 1 ships the mechanism + a manual director-applied path (`ApplyParticipantOverride` intent) for each plug; the canonical trait/title/complication paths light up once 2b.7/2b.8 land.
- **Predetermined Hakaan-doomed encounters.** Per the umbrella's per-slice clarification: the Hakaan-Doomsight player gets a `Become Doomed` button on their sheet that they can press any time during an encounter; director/player collaboration happens at the table, outside the app. No `MarkDoomedEncounter` intent.
- **Hakaan rubble auto-respawn at 12h.** Slice 1 ships the rubble state with the 12h clock as data (`override.regainsAtSessionMinute`), but the actual "12 hours of in-fiction time has passed" trigger is a director-side judgment call. The director dispatches `ClearParticipantOverride` (slice 1 ships this intent) when the table agrees. Same shape for Revenant inert.
- **Resurrection / revival paths.** Outside slice 1. Dead is dead in slice 1; revival items (Scroll of Resurrection) are post-encounter administration.
- **Cross-side trigger resolution beyond two parallel triggers.** The modal handles N pending triggered actions across both sides; canon-bare Q10 only asked about two, but the modal generalizes naturally. No special UI for chains (one trigger that produces another that produces another) — each fresh tie surfaces a fresh modal as the cascade runs.
- **Power-roll-edge-state effect of surprise** (canon § 4.1 — surprised creatures grant edge against, can't take triggered actions). Pass 2b1 noted these were deferred to the Phase 2b umbrella alongside the rest of `RollPower` edge/bane stacking; slice 1 doesn't pick them up either.

## Architecture

### Engine: stamina state machine

Canon § 2.12 (engine resolution order) and § 2.7-2.9 (state transitions) become the authoritative reference. `applyDamageStep` and `applyHeal` recompute the state after every stamina change.

**State enum (slice 1's `staminaState`):**

```ts
type StaminaState =
  | 'healthy'      // currentStamina > windedValue
  | 'winded'       // 0 < currentStamina ≤ windedValue
  | 'dying'        // -windedValue < currentStamina ≤ 0 (heroes only)
  | 'dead'         // currentStamina ≤ -windedValue (heroes) or currentStamina ≤ 0 (foes)
  | 'unconscious'  // KO opt-in: stamina at pre-killing-blow value + Unconscious + Prone, next hit kills
  | 'inert'        // Revenant override of dying
  | 'rubble'       // Hakaan-Doomsight override of dead
  | 'doomed';      // Hakaan-Doomsight or Title-Doomed override of dying/death
```

**Derivation rules** (run after every stamina mutation, by `recomputeStaminaState(participant)`):

1. If `participant.staminaOverride !== null`, the override decides the state:
   - `{ kind: 'inert' }` → state is `'inert'` while `currentStamina ≤ 0`. Above 0 the override clears (e.g. healed back).
   - `{ kind: 'rubble' }` → state is `'rubble'` while `currentStamina ≤ -windedValue`. Stamina above that returns to dying-or-better and the override clears.
   - `{ kind: 'doomed' }` → state is `'doomed'` until encounter end (where the override fires its `dieAtEncounterEnd` clause). Stamina value doesn't matter for the state, but `staminaDeathThreshold: 'staminaMax'` (Title Doomed) means stamina ≤ -staminaMax → dead-anyway. `'none'` (Hakaan) means stamina is decoupled from death entirely.
   - `{ kind: 'extra-dying-trigger' }` (CoP) doesn't drive state by itself — it's an additional entry predicate (see step 3).
2. Otherwise, hero (`kind === 'pc'`):
   - `currentStamina ≤ -windedValue` → `'dead'`.
   - `currentStamina ≤ 0` → `'dying'`.
   - `currentStamina ≤ windedValue` → `'winded'`.
   - else → `'healthy'`.
3. Otherwise, hero with `extra-dying-trigger` override + predicate satisfied (e.g. CoP + `recoveries.current === 0`) AND state would have been `healthy` or `winded` → upgrade to `'dying'`. (Stamina ≤ 0 path still flows through step 2's normal rules.)
4. Otherwise, director creature: `currentStamina ≤ 0` → `'dead'`; `currentStamina ≤ windedValue` → `'winded'`; else `'healthy'`. No `'dying'` for foes.

**Unconscious state**: only reachable via the KO opt-in path (see KO interception below). Not a natural transition.

**Recompute helper signature:**

```ts
function recomputeStaminaState(p: Participant): {
  newState: StaminaState;
  transitioned: boolean;  // newState !== p.staminaState
};
```

Every reducer that mutates stamina calls this and, when `transitioned` is true, emits a derived `StaminaTransitioned { participantId, from, to, cause }` intent — the substrate slice 2's class-δ triggers and slice 5's action effects subscribe to.

### Engine: state transition side-effects

When `StaminaTransitioned` fires, the dispatching reducer also handles the immediate side-effects per canon:

- `→ dying` (hero): apply a `Bleeding` condition instance with `removable: false` (existing `ConditionInstanceSchema` already has the field; the auto-Bleeding sets it). The Bleeding's `source` slot reads `'dying-state'` for log clarity.
- `→ dying` (foe): no-op — foes don't get a dying state per canon § 2.8.
- `→ dead`: clear all conditions (including the non-removable Bleeding). Set `bodyIntact = true` initially; ablation rules (force-move-extreme, vaporizing-damage from monster effects) clear it later — slice 1 doesn't ship those, just the field.
- `→ inert` / `→ rubble`: clear all conditions. Start the 12h recovery clock (data-only; director-triggered cleanup).
- `→ unconscious`: apply `Unconscious` and `Prone` conditions; set `speed: 0` derived flag (not stored — read from state).
- `→ healthy` from `→ winded` (healing past windedValue): no-op beyond the transition log.
- `→ winded` from `→ healthy`: no-op (just the log).
- `→ healthy` from `→ dying` (healed above 0): clear the non-removable Bleeding. Existing `ApplyHeal` reducer already documents this (`apply-heal.ts:9-10`); slice 1 implements the clear.

### Engine: KO interception (§ 2.9)

KO is an attacker-side opt-in at the moment of a damage-applying intent that would push the target into the dead state.

**Mechanic:**

1. The attacker dispatches `ApplyDamage` as today, but with a new optional `intent: 'kill' | 'knock-out'` payload field (default `'kill'`).
2. `applyDamageStep` runs the damage calculation through immunity / weakness / temp-stamina, then checks: would this damage push the target into `'dead'` state under normal stamina derivation?
3. If yes AND `intent === 'knock-out'`:
   - **Don't apply the damage at all.** Stamina stops at its pre-blow value.
   - Apply `Unconscious` + `Prone` conditions.
   - Set `staminaState = 'unconscious'`.
   - Emit a `KnockedUnconscious` log entry attributing the attacker.
4. If yes AND `intent === 'kill'` (default): apply the damage, recompute state → `'dead'`.
5. If no (damage doesn't kill): apply normally.

A creature already in `'unconscious'` state taking any further damage from any source → state derives to `'dead'` and damage applies normally. The "next hit kills" rule is enforced by treating any damage > 0 on an unconscious target as transitioning past the death threshold.

**New intent: `KnockUnconscious`** (alternate explicit dispatch path):

```ts
KnockUnconsciousPayloadSchema = z.object({
  targetId: z.string().min(1),
  attackerId: z.string().min(1).nullable(),  // null for environmental KO
}).strict();
```

Use case: out-of-combat narrative KO (sneak attack, captive restraint). Skips the ApplyDamage path entirely.

### Engine: state-override pattern

`Participant.staminaOverride: ParticipantStateOverride | null`. Discriminated union:

```ts
type ParticipantStateOverride =
  | { kind: 'inert'; source: 'revenant';
      instantDeathDamageTypes: DamageType[];  // ['fire'] per canon
      regainHours: number;                     // 12
      regainAmount: 'recoveryValue';
    }
  | { kind: 'rubble'; source: 'hakaan-doomsight';
      regainHours: number;                     // 12
      regainAmount: 'recoveryValue';
    }
  | { kind: 'doomed';
      source: 'hakaan-doomsight' | 'title-doomed' | 'manual';
      canRegainStamina: boolean;
      autoTier3OnPowerRolls: boolean;
      staminaDeathThreshold: 'none' | 'staminaMax';
      dieAtEncounterEnd: boolean;
    }
  | { kind: 'extra-dying-trigger';
      source: 'curse-of-punishment';
      predicate: 'recoveries-exhausted';
    };
```

**Source-driven setters** (each plug has a path to land):

- **Revenant inert** — when a Revenant hero transitions toward dying, the reducer checks for an `ancestry === 'revenant'` marker on the participant (slice 1 reads `character.ancestry.id` via the existing stamping path) and substitutes the override at the moment of `→ dying`. Override fires; state lands at `'inert'`.
- **Hakaan rubble** — when a Hakaan hero would transition to `'dead'` (and isn't currently `'doomed'`), the reducer substitutes the override at the moment of `→ dead`. Override fires; state lands at `'rubble'`. Done by checking `character.ancestry.id === 'hakaan'` AND `character.purchasedTraits.includes('doomsight')` (data already there from Phase 2 Epic 1.1).
- **Hakaan doomed** — player-pressed: a new intent `BecomeDoomed { participantId, source }` (player-owner-only when source is `hakaan-doomsight`). Reducer validates the participant is a Hakaan PC with Doomsight equipped, sets `staminaOverride = { kind: 'doomed', source: 'hakaan-doomsight', canRegainStamina: true, autoTier3OnPowerRolls: true, staminaDeathThreshold: 'none', dieAtEncounterEnd: true }`.
- **Title Doomed** — Open Action raised: when a PC with the Title *Doomed* equipped (read via the existing title-attachment system) transitions to `currentStamina ≤ 0` AND is conscious (state is `'dying'`, not `'unconscious'`), the reducer emits `RaiseOpenAction { kind: 'title-doomed-opt-in', participantId }`. The player claims → reducer sets `staminaOverride = { kind: 'doomed', source: 'title-doomed', canRegainStamina: false, autoTier3OnPowerRolls: true, staminaDeathThreshold: 'staminaMax', dieAtEncounterEnd: true }`.
- **Curse of Punishment** — when a CoP-affected character's `recoveries.current` transitions to 0 (via a `recoveries.current` mutation in Respite or recovery-spend paths), the reducer asserts the override. When recoveries refill (Respite increments), the override clears automatically per Q3 = A. The predicate is re-evaluated on every reducer pass that touches recoveries.

**Manual fallback (`ApplyParticipantOverride` intent — director-only)**: ships in slice 1 so the director can apply any of the four states by hand. Useful before the trait/title/complication systems are wired (i.e., for the entire span until 2b.7/2b.8 land), and as the table-side override for edge cases. Plus `ClearParticipantOverride { participantId }` (also director-only) for "12 hours has passed in fiction, the Hakaan is no longer rubble."

**`dieAtEncounterEnd`** is handled in the `EndEncounter` reducer: at encounter end, any participant whose `staminaOverride.kind === 'doomed' && staminaOverride.dieAtEncounterEnd` transitions to `'dead'` (sets `currentStamina = -staminaMax - 1` to make the state read clean, clears override).

### Engine: cross-side trigger ordering (Q10)

When a single triggering event would fire triggered actions from both sides, the engine collects all pending triggers, emits a `TriggersPending` log entry, and pauses the cascade.

**State addition:**

```ts
// CampaignState
pendingTriggers: PendingTriggerSet | null;

type PendingTriggerSet = {
  id: string;                      // ulid
  triggerEvent: TriggerEventDesc;  // e.g. { kind: 'damage-applied', targetId, attackerId, amount, type }
  candidates: Array<{
    participantId: string;
    triggeredActionId: string;     // the ability id
    side: 'heroes' | 'foes';
  }>;
  order: string[] | null;          // resolved order (participantIds) once director picks
};
```

`pendingTriggers` is non-null only while a resolution prompt is pending. The reducer dispatching the original triggering event:

1. Collects candidate triggered actions (per § 4.10 — only actions whose trigger predicate is satisfied).
2. If `candidates.length === 0` → no-op, continue.
3. If `candidates.length === 1` OR all candidates are same-side → resolve in-order without prompting (canon: same-side triggered-action order is the controlling player/director's choice; one-side-only cases just fire in dispatch order).
4. If candidates span both sides → set `pendingTriggers = { id, triggerEvent, candidates, order: null }` and stop cascade. The original event has already been applied (damage landed, etc.); only the *triggered responses* are paused.

**New intent: `ResolveTriggerOrder`** (director-only):

```ts
ResolveTriggerOrderPayloadSchema = z.object({
  pendingTriggerSetId: z.string().min(1),
  order: z.array(z.string().min(1)).min(1),  // participantIds in resolution order
}).strict();
```

Reducer:

1. Validates `state.pendingTriggers.id === pendingTriggerSetId`.
2. Validates the order set matches the candidate set exactly (same ids, no missing, no extras).
3. Sets `pendingTriggers.order = order`.
4. Emits derived `ExecuteTrigger { participantId, triggeredActionId, triggerEvent }` intents in order. Each `ExecuteTrigger` is a thin wrapper that dispatches the actual ability's effect intent (typically `RollPower`). If a triggered action's execution itself surfaces a new cross-side tie, a new `pendingTriggers` is set and the chain pauses again.
5. After the last `ExecuteTrigger`, sets `pendingTriggers = null`.

`pendingTriggers` is cleared at `EndEncounter` (defensive — shouldn't be set across encounters).

### Engine: critical hit extra-main-action (§ 4.10)

When `RollPower` resolves with a natural 19 or 20 AND the ability was used as a main action AND the actor is alive (any state but `'dead'`), the reducer emits a derived `GrantExtraMainAction { participantId }` intent.

The derived intent sets `participant.turnState.mainSpent = false` (the existing turn-state surface from § 4.10), effectively giving the actor a second main action this turn. Per canon, this works:
- **Off-turn** — even if the ability was a triggered action used off-turn that happened to count as a main action.
- **Even if dazed** — Dazed normally caps the creature to one action of any type per turn; the crit override punches through.

`GrantExtraMainAction` is server-only (the engine derives it; not client-dispatched).

Implementation note: `RollPower` already inspects the d10 dice for tier 3 auto-resolution at nat 19/20. The crit-extra-action hook fires off the same code path. The "used as a main action" check reads `ability.action === 'main'` (or whatever the existing field is — the per-slice plan verifies).

### Engine: Bleeding trigger discriminant extension

Existing `BleedingTrigger` (`condition-hooks.ts:159`):

```ts
type BleedingTrigger =
  | { kind: 'main_action' }
  | { kind: 'triggered_action' }
  | { kind: 'might_or_agility_roll' };
```

Slice 1 splits the third into two canonical categories per the user's verification:

```ts
type BleedingTrigger =
  | { kind: 'main_action' }
  | { kind: 'triggered_action' }
  | { kind: 'might_or_agility_test' }       // renamed for precision: tests only
  | { kind: 'ability_roll' };                // new: any ability roll regardless of characteristic
```

Callers update: `RollPower` dispatches the `ability_roll` trigger; `RollTest` (if present) dispatches `might_or_agility_test` when the test characteristic is Might or Agility, else doesn't fire Bleeding.

### Engine: schema additions to `Participant`

All additive; existing fields preserved. `currentStamina.min(0)` constraint relaxed to `int()` (allows negative).

```ts
// existing — bound relaxed
currentStamina: z.number().int(),  // was .int().min(0)

// new
staminaState: z.enum([
  'healthy', 'winded', 'dying', 'dead', 'unconscious', 'inert', 'rubble', 'doomed'
]).default('healthy'),

staminaOverride: ParticipantStateOverrideSchema.nullable().default(null),

bodyIntact: z.boolean().default(true),

triggeredActionUsedThisRound: z.boolean().default(false),  // § 4.10
```

`StaminaOverrideSchema` lives in `packages/shared/src/stamina-override.ts` as the discriminated-union Zod schema for `ParticipantStateOverride` above.

### Engine: schema addition to `CampaignState`

```ts
pendingTriggers: PendingTriggerSetSchema.nullable().default(null),
```

### Engine: new intents

| Intent | Trust | Notes |
|---|---|---|
| `BecomeDoomed { participantId, source }` | player-owner (Hakaan-Doomsight); active-director (manual fallback) | Sets `staminaOverride` to the doomed-config matching the source |
| `KnockUnconscious { targetId, attackerId? }` | active-director or attacker-owner | Out-of-combat explicit KO; bypasses ApplyDamage |
| `ApplyParticipantOverride { participantId, override }` | active-director | Manual fallback for any of the 4 overrides |
| `ClearParticipantOverride { participantId }` | active-director | Reverts to derived state |
| `ResolveTriggerOrder { pendingTriggerSetId, order }` | active-director | Q10 resolution |
| `GrantExtraMainAction { participantId }` | server-only | Crit derived intent |
| `ExecuteTrigger { participantId, triggeredActionId, triggerEvent }` | server-only | Cascade derived intent |
| `StaminaTransitioned { participantId, from, to, cause }` | server-only | Event substrate; emitted by reducers, consumed by slice 2 |

### Engine: existing intent changes

- `ApplyDamage` — payload extended with optional `intent: 'kill' | 'knock-out'` (default `'kill'`). Damage-step path branches per § 2.9. Stamina recompute fires; transition derived intents emit.
- `ApplyHeal` — clears `Bleeding-from-dying` instance when stamina rises above 0 (per § 2.8 + § 2.13). State recompute + derived intent emit.
- `EndEncounter` — sweeps `pendingTriggers = null`; resolves `dieAtEncounterEnd` doomed participants → dead.
- `Respite` — recoveries refill triggers state recompute; CoP override clears if predicate now false.
- `EndRound` — resets `triggeredActionUsedThisRound = false` on every participant (§ 4.10).

### Engine: trust model

- `BecomeDoomed` from Hakaan-Doomsight: `actor.userId === participant.ownerId` (PC owner) **OR** active director.
- `BecomeDoomed { source: 'manual' }`: active director only.
- `KnockUnconscious`: active director **OR** `actor.userId === attackerId.ownerId` (attacker dispatches their own KO).
- `ApplyParticipantOverride` / `ClearParticipantOverride`: active director only.
- `ResolveTriggerOrder`: active director only (canon-aligned with Q10 — the director resolves order).

### UI: `ParticipantRow` state tag

`apps/web/src/primitives/ParticipantRow.tsx` already renders a state-tag slot (currently used for `ACTED` / `SURPRISED` per Pass 2b1). Slice 1 extends the same slot with the eight canon states.

```
┌──────────────────────────────────────────────┐
│ KORVA  L5 · TACTICIAN  [DYING]   ████░░ -3/30│
└──────────────────────────────────────────────┘
```

- `WINDED` — text only, mono-uppercase, neutral cream tone.
- `DYING` — same text-only, but with the **foe-tone** color and a small `(Bleeding)` annotation appended.
- `DEAD` — foe-tone, struck-through participant name. Visual polish (skull emblem) defers to slice 5.
- `KO` — foe-tone with a sleeping-Z glyph (Unicode `💤` or fallback char). Name not struck-through.
- `INERT` — neutral muted tone with `(12h)` annotation.
- `RUBBLE` — neutral muted tone with `(12h)` annotation.
- `DOOMED` — bright hero-tone with a flame glyph (Unicode `🔥`) — the player is doomed but every roll auto-tier-3s, this is a *good* state mechanically until encounter end.

No new participant-row visual treatments beyond the slot text/glyph. Slice 4 (chip embellishment) and slice 5 (skull emblem, glow) carry the visual polish.

### UI: player-sheet `Become Doomed` button

`apps/web/src/pages/character/PlayerSheetPanel.tsx` adds a section visible only when the active character has Hakaan ancestry with the Doomsight purchased trait (`character.purchasedTraits.includes('doomsight') && character.ancestry.id === 'hakaan'`):

```
┌─────────────────────────────────────────┐
│ Doomsight                               │
│ Predetermine a heroic death.            │
│  [ Become doomed ]   (foe-tone button)  │
└─────────────────────────────────────────┘
```

The button dispatches `BecomeDoomed { participantId: <active char's participantId>, source: 'hakaan-doomsight' }`. Confirms via a small modal: "This sets your character to the doomed state — auto tier-3 on all power rolls, can't die from stamina, dies at encounter end. Continue?" — the player taps Yes. No undo path within the encounter (matches canon — once doomed, it's a one-way decision).

Disabled when: no active encounter, participant is already doomed, character isn't currently in the lobby's participants list, or the character is dead.

### UI: Title Doomed opt-in OA

When a non-Hakaan PC with the Title *Doomed* equipped transitions to `currentStamina ≤ 0` while conscious (state would be `'dying'` not `'unconscious'`), the engine raises `RaiseOpenAction { kind: 'title-doomed-opt-in', participantId }`. The OA appears in the existing OpenActionsList (shipped in 2b2a) on the player's view with the for-you signal. Claim → reducer sets the doomed override.

OA copy:

```ts
OPEN_ACTION_COPY['title-doomed-opt-in'] = {
  title: () => 'Embrace your doom?',
  body: (oa) => `Your stamina has hit 0. Per the *Doomed* title, you may become doomed — automatically obtain a tier 3 outcome on every power roll, but you can't regain Stamina, and you die at the end of the encounter.`,
  claimLabel: () => 'Become doomed',
};
```

The OA expires at `EndEncounter`. If the participant returns to `currentStamina > 0` (healed) before claiming, the OA expires immediately (predicate no longer satisfied).

### UI: cross-side trigger resolution modal

`apps/web/src/pages/combat/triggers/CrossSideTriggerModal.tsx` (new). Mounted by `DirectorCombat` when `state.pendingTriggers !== null && actor.userId === state.activeDirectorId`. Players see a passive "Director is resolving triggers..." pill on their sheet via existing chrome.

Layout (already mocked above in Q5):

- Header: "Resolve trigger order"
- Trigger description from `pendingTriggers.triggerEvent` rendered as a short prose line ("Korva took damage from Ash bolt", "Kaela became winded", etc.) via a `formatTriggerEvent()` helper in `apps/web/src/lib/format-trigger-event.ts`.
- Numbered list of candidates with drag-to-reorder via `dnd-kit` (already in the dependency graph from EncounterBuilder). Default order: foes first, then heroes (per Q5 decision).
- "Resolve in order" button — single primary, foe-tone (director-side cue).
- No cancel / dismiss — director has to resolve; pending triggers is a transactional pause.

Dispatched intent: `ResolveTriggerOrder { pendingTriggerSetId, order }`.

### Engine: damage-step rewrite

`packages/rules/src/damage.ts` `applyDamageStep` rewrites per § 2.12 + slice 1's additions:

```ts
export type DamageStepResult = {
  delivered: number;
  before: number;
  after: number;
  newParticipant: Participant;
  transitionedTo: StaminaState | null;   // null if no state change
  knockedOut: boolean;                    // true if intent === 'knock-out' and would-kill
};

export function applyDamageStep(
  target: Participant,
  amount: number,
  damageType: DamageType,
  intent: 'kill' | 'knock-out' = 'kill',
): DamageStepResult {
  // Steps 1-4 unchanged from today.
  let delivered = amount;
  delivered += sumMatching(target.weaknesses, damageType);
  delivered = Math.max(0, delivered - sumMatching(target.immunities, damageType));

  const before = target.currentStamina;

  // Step 5 (temp stamina) — not implemented yet; leave as TODO marker.
  // The existing code doesn't apply temp stamina; slice 1 doesn't add it.

  // Inert + fire = instant death (Revenant special rule)
  if (target.staminaOverride?.kind === 'inert'
      && target.staminaOverride.instantDeathDamageTypes.includes(damageType)
      && delivered > 0) {
    const newParticipant = { ...target, currentStamina: -target.maxStamina - 1, staminaState: 'dead' as const, staminaOverride: null };
    return { delivered, before, after: newParticipant.currentStamina, newParticipant, transitionedTo: 'dead', knockedOut: false };
  }

  // Compute would-be stamina before KO check.
  const wouldBe = before - delivered;

  // KO interception: if would push into dead and attacker opted for KO
  if (intent === 'knock-out' && wouldHitDead(target, wouldBe)) {
    const newParticipant = applyKnockOut(target);  // applies Unconscious + Prone, sets state='unconscious', stamina unchanged
    return { delivered: 0, before, after: before, newParticipant, transitionedTo: 'unconscious', knockedOut: true };
  }

  // Doomed: invulnerable to stamina death (depending on threshold)
  const damageAfterDoomedClamp = clampForDoomed(target, delivered, wouldBe);

  // Apply damage.
  const after = before - damageAfterDoomedClamp;
  const intermediate = { ...target, currentStamina: after };
  const { newState, transitioned } = recomputeStaminaState(intermediate);
  const newParticipant = transitioned
    ? applyTransitionSideEffects(intermediate, target.staminaState, newState)
    : intermediate;

  return {
    delivered: damageAfterDoomedClamp,
    before,
    after,
    newParticipant,
    transitionedTo: transitioned ? newState : null,
    knockedOut: false,
  };
}
```

Helpers (`wouldHitDead`, `applyKnockOut`, `clampForDoomed`, `recomputeStaminaState`, `applyTransitionSideEffects`) sit in `packages/rules/src/stamina.ts` (new file). `damage.ts` orchestrates; `stamina.ts` owns the state-machine primitives. Keeps each file focused and under ~150 lines.

### File organization

```
packages/shared/src/
├── participant.ts                            +staminaState +staminaOverride +bodyIntact
│                                             +triggeredActionUsedThisRound; currentStamina.min(0) removed
├── stamina-override.ts                       NEW — ParticipantStateOverrideSchema + types
├── pending-triggers.ts                       NEW — PendingTriggerSetSchema + types
├── trigger-event.ts                          NEW — TriggerEventDesc discriminated union
├── intents/
│   ├── become-doomed.ts                      NEW
│   ├── knock-unconscious.ts                  NEW
│   ├── apply-participant-override.ts         NEW
│   ├── clear-participant-override.ts         NEW
│   ├── resolve-trigger-order.ts              NEW
│   ├── grant-extra-main-action.ts            NEW (server-only)
│   ├── execute-trigger.ts                    NEW (server-only)
│   ├── stamina-transitioned.ts               NEW (server-only)
│   ├── apply-damage.ts                       +intent payload field
│   └── index.ts                              re-exports
└── open-action-copy.ts                       +title-doomed-opt-in copy

packages/rules/src/
├── stamina.ts                                NEW — state-machine primitives (recomputeStaminaState,
│                                             wouldHitDead, applyKnockOut, clampForDoomed,
│                                             applyTransitionSideEffects)
├── damage.ts                                 rewrite — orchestrate via stamina.ts
├── condition-hooks.ts                        BleedingTrigger discriminant split
├── intents/
│   ├── become-doomed.ts                      NEW reducer
│   ├── knock-unconscious.ts                  NEW reducer
│   ├── apply-participant-override.ts         NEW reducer
│   ├── clear-participant-override.ts         NEW reducer
│   ├── resolve-trigger-order.ts              NEW reducer
│   ├── apply-damage.ts                       branches on intent payload
│   ├── apply-heal.ts                         clears non-removable Bleeding on dying→healthy
│   ├── end-encounter.ts                      resolves dieAtEncounterEnd doomed; clears pendingTriggers
│   ├── end-round.ts                          resets triggeredActionUsedThisRound
│   ├── respite.ts                            CoP override clears if predicate now false
│   └── roll-power.ts                         emits GrantExtraMainAction on nat 19/20 main-action
├── permissions.ts                            trust for the new intents
└── reducer.ts                                dispatch cases for the new intents

apps/web/src/
├── primitives/
│   └── ParticipantRow.tsx                    state tag slot extended (8 states)
├── pages/
│   ├── character/
│   │   ├── PlayerSheetPanel.tsx              +Doomsight section for Hakaan-Doomsight PCs
│   │   └── DoomsightBecomeDoomedButton.tsx   NEW — button + confirm modal
│   └── combat/
│       ├── triggers/
│       │   ├── CrossSideTriggerModal.tsx     NEW — director-only modal
│       │   ├── TriggersPendingPill.tsx       NEW — passive "director resolving" pill
│       │   └── index.ts
│       └── DirectorCombat.tsx                mounts CrossSideTriggerModal when pendingTriggers
└── lib/
    └── format-trigger-event.ts               NEW — TriggerEventDesc → prose
```

## Testing strategy

### Unit tests (`packages/rules/tests/`)

- **`stamina.spec.ts`** (new) — `recomputeStaminaState` for every (currentStamina, override) input cell. Direct test of state-machine derivation.
- **`damage.spec.ts`** — extend existing with:
  - Hero takes damage past `currentStamina = 0` → state `'dying'`; Bleeding `removable: false` applied.
  - Hero takes damage past `-windedValue` → state `'dead'`; conditions cleared.
  - Foe takes damage past 0 → state `'dead'` directly (no dying).
  - KO opt-in at would-kill blow → damage not applied, state `'unconscious'`, Unconscious + Prone conditions land.
  - Unconscious target takes any further damage → state `'dead'`.
  - Revenant `'inert'` + fire damage → state `'dead'` directly, override cleared.
  - Hakaan rubble at `wouldHitDead` → state `'rubble'`, conditions cleared.
  - Doomed (Hakaan-source) + damage past `-windedValue` → state stays `'doomed'`, stamina goes below threshold but state doesn't flip.
  - Doomed (Title-source) + damage past `-staminaMax` → state `'dead'`, override cleared.
- **`heal.spec.ts`** — dying hero healed to `> 0` → state `'healthy'` or `'winded'`; non-removable Bleeding cleared.
- **`become-doomed.spec.ts`** (new) — Hakaan-Doomsight PC dispatches `BecomeDoomed` → override set; non-Hakaan PC rejected; PC without Doomsight trait rejected; dead PC rejected.
- **`knock-unconscious.spec.ts`** (new) — out-of-combat KO sets state and conditions; permissions enforced.
- **`apply-participant-override.spec.ts`** (new) — director can apply any of the four kinds; player rejected.
- **`resolve-trigger-order.spec.ts`** (new) — order validation (no missing, no extras, no duplicates); cascade executes in order; new tie pauses cascade with fresh `pendingTriggers`.
- **`end-encounter.spec.ts`** — doomed-Hakaan transitions to dead at encounter end; doomed-Title transitions to dead at encounter end; non-doomed dying participant stays dying across encounter boundary (returns to lobby).
- **`respite.spec.ts`** — CoP refilled → override clears → state recomputes from stamina.
- **`bleeding-trigger.spec.ts`** — new `ability_roll` discriminant fires; renamed `might_or_agility_test` fires on tests not ability rolls.
- **`crit-extra-action.spec.ts`** (new) — nat 19/20 on main-action ability emits `GrantExtraMainAction`; off-turn case; dazed case.

### Schema tests (`packages/shared/tests/`)

- `stamina-override.spec.ts` — all four discriminated variants parse; mismatched source/kind rejected.
- `pending-triggers.spec.ts` — schema accepts/rejects malformed payloads.

### UI tests (`apps/web/src/__tests__/` or co-located)

- `ParticipantRow.spec.tsx` — each of the 8 state tags renders correctly; `DOOMED` shows flame glyph; `KO` shows sleeping-Z.
- `DoomsightBecomeDoomedButton.spec.tsx` — button visible only for Hakaan-Doomsight PCs; confirm modal dispatches correct intent; disabled states.
- `CrossSideTriggerModal.spec.tsx` — director sees modal; players see passive pill; default order is foes-first; drag reorders; resolve dispatches with the new order.

### Integration test

`packages/rules/tests/slice-1-integration.spec.ts` — a 3-PC encounter:
- Hero 1 (Hakaan-Doomsight) takes damage past 0 → dying (no rubble yet — rubble fires at would-kill-dead, not dying).
- Hero 1 takes more damage past -windedValue → would be dead → rubble override fires → state `'rubble'`.
- Director dispatches `ClearParticipantOverride` after table agrees 12h passed → state recomputes from stamina (-staminaMax-1 → dead, since rubble doesn't restore stamina by itself; or stays at the rubble-entry stamina value if regainAmount fires when override clears — settled in slice plan).
- Hero 2 (Title-Doomed) takes damage to 0 → dying + Title-Doomed OA raised.
- Hero 2's owner claims the OA → override set to `doomed-title` → stamina-death-threshold reads `'staminaMax'`.
- Hero 2 takes massive damage past `-staminaMax` → state `'dead'`, override cleared.
- Hero 3 (Hakaan-Doomsight) presses `Become Doomed` button → override set to `doomed-hakaan`.
- Encounter ends → Hero 3 transitions to `'dead'` (dieAtEncounterEnd fires).

## Constraints and risks

- **`currentStamina.min(0)` relaxation is a schema-bound change.** Every loaded snapshot (pre-slice-1) had the `.min(0)` constraint. Relaxing to `.int()` is backwards-compatible at parse time but every consumer that *assumed* non-negative needs an audit. Slice 1 plan includes a grep sweep across `apps/web/src/` and `packages/rules/src/` for `currentStamina` references; consumers that need a max-with-zero floor (like UI percentage calculations) get explicit `Math.max(0, ...)`.
- **State transitions emitted as derived intents create cascade complexity.** A single `ApplyDamage` may now produce: `StaminaTransitioned`, `ApplyCondition (Bleeding)`, `RaiseOpenAction (title-doomed-opt-in)`. Slice 2 will add another layer (class-δ triggers reading these). The reducer's `derived: Intent[]` list per intent can grow large. Existing `reduce()` already handles this — slice 1 stress-tests it with the integration test.
- **The KO opt-in mechanic introduces a new payload field on `ApplyDamage`.** Pre-slice-1 dispatchers that don't set the field get `'kill'` as default — safe. New UI (the dispatching code in `roll-power.ts` or wherever damage is rolled) gains an "Attacker opts to knock out instead of kill" checkbox somewhere — slice 1 spec ships this as an option on the manual-roll-and-apply override flow (the existing manual damage entry path). Auto-dispatched damage uses `'kill'`. Combat-time KO opt-in surface (a button that appears at the moment damage would kill) is deferred to slice 2 or 4; this slice ships the engine path + the manual surface.
- **`pendingTriggers` blocks the cascade.** While set, the engine considers itself in a "paused" state — no further derived intents resolve until `ResolveTriggerOrder` fires. Risk: if the director walks away mid-resolution, the encounter is stuck. Mitigation: an admin escape hatch — director can dispatch `ResolveTriggerOrder` with `order: candidates.map(c => c.participantId)` (i.e., the trivial default-order resolution); the UI's "Resolve in order" button does exactly this on the default order. No timeout-auto-resolve (per Q5 decision).
- **Slice 1 doesn't ship the trait/title/complication wiring** that *automatically* sets the per-character override marker. Until 2b.7/2b.8 land, the user-facing experience is:
  - Hakaan-Doomsight: works (the button reads the existing purchased-trait data from Phase 2 Epic 1.1).
  - Hakaan rubble (the auto-fires-at-would-kill): works (same data path).
  - Revenant inert (auto-fires-at-dying): works (reads `character.ancestry.id === 'revenant'`).
  - Title Doomed: depends on `character.titles[]` carrying the equipped *Doomed* title — that data exists per Phase 2 Epic 2C's title attachment system. Works.
  - Curse of Punishment: complications aren't wired through the attachment engine yet (2b.8 territory). Slice 1 ships the override + the `ApplyParticipantOverride` manual path; the auto-fire-at-recoveries-exhausted is dormant until complication-attachment wiring lands. Director can apply manually.
- **The `'unconscious'` state value overlaps with the existing `Unconscious` condition.** Risk: callers querying "is this creature out?" need to know whether to read `staminaState === 'unconscious'` or `conditions.some(c => c.type === 'Unconscious')`. Resolution: state value is the authoritative *engine* read; the condition is the *UI/player-visible* surface. The state value gates the "next hit kills" rule.
- **Crit extra-main-action grants an action that may be impossible to use.** If the crit happens off-turn (e.g., a triggered ability rolls a nat 19), the creature can't use their second main action until their turn — but their turn may have already passed this round. Risk: action is silently lost. Canon doesn't clarify; the rulebook's wording suggests "immediately" means "right now" — which off-turn may not be feasible. Mitigation: per-slice plan defers off-turn-crit-action holding (an additional flag on participant) until the user can verify against the printed book. Slice 1 sets `mainSpent = false` and logs; the table adjudicates whether to use it now or hold.
- **`pendingTriggers` schema vs WS-mirror gap.** Same pattern as Pass 2b1 PS#1 + 2b2a PS#1: WS mirror bypasses Zod parsing. Slice 1 adds defensive `?? null` guards on every consumer that reads `pendingTriggers`.
- **`Bleeding` discriminant rename is a breaking change** for the (small) existing call sites. Slice 1 plan migrates them. The `might_or_agility_roll → might_or_agility_test` rename clarifies semantics; the new `ability_roll` is additive.
- **Conditions-cleared-on-death is a semantic call.** Canon doesn't explicitly say "all conditions clear when you die" but the engine has no path for an effect to interact with a dead participant. Slice 1 clears all conditions including non-removable Bleeding at the moment of `→ dead`. The `removable: false` flag exists to prevent in-life cure attempts, not to persist after death.
- **`StaminaTransitioned` is a derived-intent-only event** — no client-dispatchable form. Risk: WS-mirror needs to replay this for optimistic UI. Plan: WS-mirror's `reflect()` runs `recomputeStaminaState` after every state-mutating intent (same helper) and synthesizes the transition locally — matches the engine's behavior. Same pattern as other helper-derived state in 2b1 (`nextPickingSide`).

## Acceptance

Slice 1 is done when:

1. A hero whose `currentStamina` is reduced to ≤ 0 by `ApplyDamage` transitions to `staminaState: 'dying'` and gains a `Bleeding` condition with `removable: false` and `source: 'dying-state'`. The condition fires Bleeding-d6 damage on main_action / triggered_action / might_or_agility_test / ability_roll triggers when the dying hero acts.
2. A hero healed from `currentStamina < 0` to `> 0` transitions out of `'dying'`; the non-removable `Bleeding` is cleared.
3. A hero whose `currentStamina` drops to `≤ -windedValue` transitions to `'dead'`; all conditions clear.
4. A director creature at `currentStamina ≤ 0` transitions directly to `'dead'` (no dying state).
5. An attacker dispatching `ApplyDamage { intent: 'knock-out' }` at a would-kill blow stops the target at pre-blow stamina with `staminaState: 'unconscious'`, `Unconscious` + `Prone` conditions, and zero damage delivered. The next damage on that target transitions to `'dead'`.
6. A Revenant PC at `→ dying` substitutes the `inert` override; fire damage while inert transitions to `'dead'` immediately.
7. A Hakaan-Doomsight PC at `→ dead` (and not currently `'doomed'`) substitutes the `rubble` override.
8. A Hakaan-Doomsight PC pressing the `Become Doomed` button (on their sheet) at any time during an encounter sets `staminaOverride.kind === 'doomed'` with the Hakaan parameter set. Subsequent damage past `-windedValue` does not transition to dead; encounter end fires the `dieAtEncounterEnd` clause and the PC transitions to `'dead'`.
9. A non-Hakaan PC with the Title *Doomed* equipped, when `currentStamina` drops to ≤ 0 while conscious, sees a `title-doomed-opt-in` Open Action. Claiming it sets the doomed override with the Title parameter set (different `canRegainStamina` + `staminaDeathThreshold`). Encounter end fires the death transition.
10. A PC with the manual Curse-of-Punishment override (via `ApplyParticipantOverride`), when `recoveries.current` transitions to 0, has their state recomputed to `'dying'` regardless of stamina value. A subsequent Respite refilling recoveries clears the override and recomputes state from stamina.
11. The director can manually apply / clear any of the four override kinds via `ApplyParticipantOverride` / `ClearParticipantOverride`. Players can't dispatch these intents.
12. A natural 19 or 20 on `RollPower` for an ability used as a main action grants the actor an extra main action this turn via a derived `GrantExtraMainAction` intent. Works off-turn and while dazed. The intent sets `participant.turnState.mainSpent = false`.
13. When a single event would fire triggered actions from both sides, `state.pendingTriggers` is set, the cascade pauses, and the director sees the `CrossSideTriggerModal`. Players see a passive "Director resolving triggers..." pill. The director picks an order; `ResolveTriggerOrder` fires the cascade in that order. New cross-side ties during cascade surface a fresh modal.
14. Bleeding trigger discriminant set is `main_action | triggered_action | might_or_agility_test | ability_roll`. All callers (RollPower, RollTest if present, action-cost reducers) dispatch the correct discriminant.
15. `ParticipantRow` renders the appropriate state tag for each of the 8 states. The DOOMED tag shows a flame glyph; KO shows the sleeping-Z glyph; DEAD strikes through the name (visual polish for these defers to slices 4-5).
16. Pre-slice-1 snapshots load without crash: `staminaState` defaults to `'healthy'`, `staminaOverride` defaults to `null`, `bodyIntact` defaults to `true`, `triggeredActionUsedThisRound` defaults to `false`. State is recomputed for every participant on snapshot-load so existing dying/dead participants from old data render correctly.
17. `rule-questions.md` Q10 (cross-side trigger order) flips to ✅ with a pointer to this spec. Q16 (Revenant inert) flips to ✅. A new Q-entry for Hakaan-Doomsight / Title-Doomed mechanics is added and immediately closed ✅ with a pointer to this spec.
18. `pnpm test`, `pnpm typecheck`, `pnpm lint` clean repo-wide. Per-test-file additions listed under Testing strategy all pass.
19. Spot-check screenshots at iPad-portrait (810 × 1080) and iPhone-portrait (390 × 844): (a) dying hero with state tag + Bleeding chip; (b) dead foe row; (c) KO state with Z glyph; (d) doomed-Hakaan with flame glyph; (e) Doomsight button on Hakaan player sheet; (f) Title-Doomed OA in the OpenActionsList; (g) CrossSideTriggerModal mid-resolution.
20. Umbrella spec patched in the same commit: remove `SaveAgainstDeath` and `deathSaves` from cross-slice contracts; remove `hakaan-doomed-opt-in` from OA kind registry (Hakaan path is direct `BecomeDoomed` intent); add `BecomeDoomed`, `KnockUnconscious`, `ApplyParticipantOverride`, `ClearParticipantOverride`, `GrantExtraMainAction`, `ExecuteTrigger`, `StaminaTransitioned` to the new-intents table; reconcile the participant schema additions table with slice 1's flat-sibling decision.

## Out-of-scope confirmations

- Death saves (none in Draw Steel — Bleeding-d6 is the progression).
- Visual polish for state tags (slices 4 + 5).
- Trait/title/complication registration wiring (2b.7 / 2b.8 — out of umbrella).
- Predetermined Hakaan-doomed encounters (no engine support; collaboration outside the app).
- 12h auto-revival from inert / rubble (director-triggered via `ClearParticipantOverride`).
- Resurrection / revival item paths.
- Power-roll surprise edge/bane effects (deferred per Pass 2b1 spec).
- Off-turn-crit-action holding mechanism (verify against printed book in slice 2 or post-shipping).

## PS — post-shipping fixes

Future post-shipping fixes to Slice 1 layer the same way: append a numbered entry to this PS section with a one-line symptom, a one-paragraph fix, and the relevant commit SHA. Once a follow-up entry has shipped *and* been verified in real use, leave it in place — the doc is the historical record, not a TODO list.

### 1. Final-review fixes shipped at commit completion

After the slice 1 plan tasks shipped, a final code review against the 20 acceptance criteria surfaced six gaps; all closed in commits 1960d15 / 4c2fb12 / 7714817 / 673ddeb:

- **AC#5 unconscious-→-dead path missing in `applyDamageStep`** — added short-circuit before KO check (canon §2.9: any damage on an unconscious target kills immediately; `currentStamina` set to `-maxStamina - 1`, conditions cleared). Commit `1960d15`.
- **AC#13 `TriggersPendingPill` not mounted in player UI** — imported from `./triggers` barrel and rendered in a sub-header bar (`bg-ink-2 border-b`) between `InlineHeader` and `SplitPane` when `pendingTriggers !== null && !isActingAsDirector`. Mounted in `DirectorCombat.tsx`. Commit `4c2fb12`.
- **AC#18 two lint format errors** — `biome check --write` auto-fixed `pending-triggers.spec.ts` (multiline expect collapsed) and `intentDescribe.slice1.spec.ts` (array literal inlined). Commit `4c2fb12`.
- **WS-mirror `BecomeDoomed` config drift on `source: 'manual'`** — mirror was emitting `canRegainStamina:false, staminaDeathThreshold:'staminaMax'` for manual source; engine uses identical config for both sources (both get `canRegainStamina:true, staminaDeathThreshold:'none'` per canon §2.9). Aligned mirror to engine. Commit `7714817`.
- **WS-mirror `ApplyDamage` reflect didn't handle `intent:'knock-out'` or inert-fire** — replaced manual `recomputeStaminaState` path with shared `applyDamageStep(target, amount, damageType, intent)`. KO interception, inert-fire instant-death, and unconscious-→-dead all now handled optimistically client-side. Commit `7714817`.
- **`pendingTriggers` schema location mismatch (CampaignState top-level vs encounter)** — moved `pendingTriggers: PendingTriggerSet | null` from `CampaignState` to `EncounterPhase`. The server broadcasts `CampaignState` as JSON; the client `snapshotToEncounter` reads `enc.pendingTriggers` from the encounter sub-object. Before this fix, a snapshot reload would silently drop any in-flight pending-trigger state. Updated `resolve-trigger-order.ts` to read/write `state.encounter.pendingTriggers`, removed stale top-level clear from `end-encounter.ts` (encounter:null already destroys it), and updated all 21 test files to construct `EncounterPhase` with `pendingTriggers: null`. Commit `673ddeb`.

### 2. Deferred to follow-up (not blocking slice 1 acceptance)

- **AC#9 — ClaimOpenAction extends for title-doomed-opt-in.** Today, claiming the OA just removes it; the doomed override must be applied separately. Slice 1 integration test confirms the workaround (director applies via `ApplyParticipantOverride`). Either extend `applyClaimOpenAction` to recognize `kind: 'title-doomed-opt-in'` and apply the override, or amend AC#9 to match current behavior.
- **`appliedAtSeq: 0` on engine-generated conditions.** Bleeding-from-dying, Unconscious + Prone from KO all carry `appliedAtSeq: 0` because the helpers in `stamina.ts` don't have access to the reducer's seq. Either thread seq through the helper signatures, or accept that engine-generated conditions don't participate in save_ends seq ordering (they're all manual-duration anyway).
- **Heal-from-unconscious doesn't clear `Unconscious` / `Prone` conditions.** `applyTransitionSideEffects` clears Bleeding on heal but not Unconscious/Prone. Likely needs the same filter step.
- **`clampForDoomed` and `recoveryValue` helpers in `stamina.ts` are stubbed** for future use. Dead code in slice 1 until inert/rubble auto-revive (12h regain) or doomed-stamina-clamping land.
- **Reducer trust-check boilerplate** repeated across 5 new reducers. Future refactor candidate: a `requireActiveDirector(state, intent)` and `requireParticipant(state, id)` helper.
