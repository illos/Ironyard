# Phase 2b sub-epic 2b.0 — Combat-resource framework foundation

**Status:** Designed, awaiting plan.
**Parent:** Phase 2b — Combat completeness ([phases.md](../../phases.md#phase-2b--combat-completeness)).
**Successor:** Sub-epic 2b.0.1 — Class δ triggers and class-internal affordances (follow-up).
**Scope notes:** none — designed inline through a brainstorming session on 2026-05-13.

## One-line summary

Wire the universal § 5 mechanics (Director's Malice generation at encounter and round boundaries; heroic resource preload from per-character Victories; per-turn universal gain via an extended `StartTurn` payload; end-of-encounter cleanup), refactor Victories to per-character, and ship the **Open Actions framework** as foundational scaffolding for the class-specific judgment prompts that follow in 2b.0.1.

## Goals

- Wire the encounter/round/turn boundary mechanics of canon § 5.3 / § 5.4 / § 5.5 so the Director can spend Malice and players can spend heroic resources from turn 1.
- Refactor Victories from a single party-wide field to a per-character counter per canon § 8.1.
- Ship the Open Actions framework: a unified, **non-blocking, lobby-visible list** of rule-driven options a human *may* act on. Each entry is claimable by the eligible actor (the targeted participant's owner or the active director); ignored entries auto-expire when the conditions that raised them pass (round end, encounter end). Built in 2b.0 with no consumers — first consumers (the four spatial triggers, Conduit's *Pray to the Gods*, etc.) land in 2b.0.1.
- Establish `packages/rules/src/heroic-resources.ts` as the engine-side source of structured class resource rules — a static table keyed on `HeroicResourceName`.

## Non-goals (move to sub-epic 2b.0.1)

- Class-specific δ gain triggers (Censor judged-target, Fury took-damage, Tactician marked-creature damaged, Troubadour winded-or-died, Null malice-spend, Shadow surge-damage, Elementalist within-10-squares spatial, Talent force-move broadcast, Conduit *Pray to the Gods*, Troubadour natural-19/20, Troubadour three-heroes-acted-this-turn).
- Elementalist *Maintenance* state machine (`StartMaintenance` / `StopMaintenance` intents; per-turn cost deduction; auto-drop when essence would go negative).
- Troubadour posthumous Drama gain + auto-revive at 30.
- Talent strained-spend confirmation UI + 10th-level Psion opt-into-strained / opt-out-of-clarity-damage toggles. Talent's strained mechanics are class-internal — they don't route through Open Actions; canon allows clarity to go negative and the engine already tracks that.
- Spatial-conditional trigger raisers themselves. The Open Actions framework exists in 2b.0 but the four spatial-trigger raisers are wired in 2b.0.1.
- OA copy registry entries (registry exists, ships empty).

## Carry-over to sub-epic 2b.5 (damage-engine state transitions)

- Strict winded / dying / dead state machine. In 2b.0 the alive-check is permissive: `currentStamina > -windedValue`. 2b.5 swaps the permissive helper for the formal state machine.
- `bodyIntact` semantics — used by Troubadour posthumous logic in 2b.0.1 but reified into the formal damage state by 2b.5.
- Q16 Revenant inert / 12h Stamina recovery (gated on 2b.5).

## Architecture

### Pipeline

```
StartEncounter
   ├─ For each PC participant:
   │   heroicResources = [{ name: <config.name>, current: character.victories }]
   ├─ malice.current = floor(averageVictoriesAlive(state))
   └─ Round 1 tick (inlined): malice.current += aliveHeroes + 1

StartRound (round N > 1)
   └─ malice.current += aliveHeroes + N

StartTurn { participantId, rolls?: { d3? } }
   ├─ If active participant is a PC:
   │   lookup HeroicResourceConfig for that PC's class
   │   apply baseGain.onTurnStart (flat amount or rolls.d3)
   └─ existing turn-state setup

EndTurn         → unchanged
EndRound        → existing teardown + auto-expire OAs whose expiresAtRound === currentRound
EndEncounter    → existing teardown + clear all OAs + zero every PC's heroicResources + zero every PC's surges

Respite         → each attending PC's character.victories increments per canon § 8.1
```

### Intent surfaces

**New intents:**

```ts
RaiseOpenAction { kind, participantId, expiresAtRound?, payload }   // server-only (in SERVER_ONLY_INTENTS)
ClaimOpenAction { openActionId, choice? }                            // player owner or active director
```

Note: there is no `DismissOpenAction` intent. Open Actions are non-blocking — an unclaimed entry simply auto-expires when its window passes (`expiresAtRound` hit, or `EndEncounter`). Players who don't want an entry just don't claim it.

**Extended intents:**

```ts
StartTurn { participantId, rolls?: { d3?: number } }   // payload now carries optional d3 for d3-classes
```

**Existing intents reused:** `StartEncounter`, `StartRound`, `EndRound`, `EndEncounter`, `Respite`.

### Schemas

`packages/shared/src/open-action.ts` (new):

```ts
export const OpenActionKindSchema = z.enum([
  // Empty in 2b.0. 2b.0.1 adds entries:
  //   'pray-to-the-gods'
  //   'spatial-trigger-elementalist-essence'
  //   'spatial-trigger-tactician-ally-heroic'
  //   'spatial-trigger-null-field'
  //   'spatial-trigger-troubadour-line-of-effect'
  //   …
]);

export const OpenActionSchema = z.object({
  id: z.string(),                              // ulid, client-generated
  kind: OpenActionKindSchema,
  participantId: z.string(),                   // who this is offered to
  raisedAtRound: z.number().int(),
  raisedByIntentId: z.string(),
  expiresAtRound: z.number().int().nullable(), // null = persist until claimed or EndEncounter
  payload: z.record(z.string(), z.unknown()),  // discriminated on kind
});

export type OpenAction = z.infer<typeof OpenActionSchema>;
```

`packages/shared/src/character.ts` extension:

```ts
victories: z.number().int().min(0).default(0),   // canon § 8.1, per-character
```

`packages/rules/src/heroic-resources.ts` (new):

```ts
export type HeroicResourceConfig = {
  name: HeroicResourceName;
  floor: 0 | { formula: 'negative_one_plus_reason' };  // only Clarity uses the formula
  ceiling: null;                                       // unbounded within an encounter
  baseGain: {
    onEncounterStart: 'victories';                     // universal (canon § 5.3 / § 5.4)
    onTurnStart:
      | { kind: 'flat'; amount: number }
      | { kind: 'd3' }
      | { kind: 'd3-plus'; bonus: number };            // stubbed; 2b.0.1 wires 10th-level Psion 1d3+2
  };
  // Stubbed for 2b.0.1:
  // classSpecificTriggers?: ClassTrigger[];
  // posthumous?: PosthumousConfig;
  // maintenance?: MaintenanceConfig;
};

export const HEROIC_RESOURCES: Record<HeroicResourceName, HeroicResourceConfig> = {
  wrath:      { name: 'wrath',      floor: 0, ceiling: null, baseGain: { onEncounterStart: 'victories', onTurnStart: { kind: 'flat', amount: 2 } } }, // Censor
  piety:      { name: 'piety',      floor: 0, ceiling: null, baseGain: { onEncounterStart: 'victories', onTurnStart: { kind: 'd3' } } },              // Conduit
  essence:    { name: 'essence',    floor: 0, ceiling: null, baseGain: { onEncounterStart: 'victories', onTurnStart: { kind: 'flat', amount: 2 } } }, // Elementalist
  ferocity:   { name: 'ferocity',   floor: 0, ceiling: null, baseGain: { onEncounterStart: 'victories', onTurnStart: { kind: 'd3' } } },              // Fury
  discipline: { name: 'discipline', floor: 0, ceiling: null, baseGain: { onEncounterStart: 'victories', onTurnStart: { kind: 'flat', amount: 2 } } }, // Null
  insight:    { name: 'insight',    floor: 0, ceiling: null, baseGain: { onEncounterStart: 'victories', onTurnStart: { kind: 'd3' } } },              // Shadow
  focus:      { name: 'focus',      floor: 0, ceiling: null, baseGain: { onEncounterStart: 'victories', onTurnStart: { kind: 'flat', amount: 2 } } }, // Tactician
  drama:      { name: 'drama',      floor: 0, ceiling: null, baseGain: { onEncounterStart: 'victories', onTurnStart: { kind: 'd3' } } },              // Troubadour
  clarity:    { name: 'clarity',    floor: { formula: 'negative_one_plus_reason' }, ceiling: null, baseGain: { onEncounterStart: 'victories', onTurnStart: { kind: 'd3' } } }, // Talent
};
```

### Module layout

- `packages/shared/src/open-action.ts` *(new)*
- `packages/shared/src/character.ts` *(extended — `victories` field)*
- `packages/shared/src/intents.ts` *(extended — `RaiseOpenAction`, `ClaimOpenAction`; `StartTurn` payload)*
- `packages/rules/src/heroic-resources.ts` *(new — config table + lookup helper)*
- `packages/rules/src/state.ts` *(extended — `openActions` field on `CampaignState`)*
- `packages/rules/src/state-helpers.ts` *(new or extended — `aliveHeroes(state)`, `averageVictoriesAlive(state)`, `sumPartyVictories(state)`)*
- `packages/rules/src/intents/raise-open-action.ts` *(new)*
- `packages/rules/src/intents/claim-open-action.ts` *(new)*
- `packages/rules/src/intents/start-encounter.ts` *(extended)*
- `packages/rules/src/intents/turn.ts` *(extended — `StartTurn` per-turn gain, `EndRound` OA expiry)*
- `packages/rules/src/intents/end-encounter.ts` *(extended)*
- `packages/rules/src/intents/respite.ts` *(extended — per-character Victories)*
- `packages/rules/src/permissions.ts` *(extended — OA gates, SERVER_ONLY addition)*
- `packages/shared/src/open-action-copy.ts` *(new — empty registry)*
- `apps/web/src/pages/combat/OpenActionsList.tsx` *(new — shared component; visible to everyone, Claim enabled only for eligible actor)*
- `apps/web/src/pages/combat/CombatRun.tsx` *(extended — mount the OpenActionsList; surface Malice in top bar)*
- `apps/web/src/pages/character/PlayerSheetPanel.tsx` *(extended — Victories chip, heroic resource display, mount OpenActionsList)*
- `apps/web/src/pages/character-wizard/` *(audit — Victories field shape if surfaced)*

### Trust boundary

- `RaiseOpenAction` is in `SERVER_ONLY_INTENTS` (alongside `JoinLobby`, `LeaveLobby`, `ApplyDamage`). The DO emits it as a derived intent from event-source intents; client-dispatched RaiseOpenAction is dropped at the envelope boundary.
- `ClaimOpenAction` accepts from (a) the targeted participant's owner, or (b) the active director. The reducer rejects other actors. There is no Dismiss intent — non-eligible users can read the OA list but cannot interact with entries; ignored entries auto-expire.
- `StartTurn`'s `rolls.d3` follows the same trust model as `RollPower`'s d10: client provides today, log records the actor, server-side roll generation is a Phase 4 swap.

### Canon backing

| Mechanic | Canon | Status |
|---|---|---|
| Per-character Victories | § 8.1 | ✅ |
| Encounter-start heroic resource preload (`gain = victories`) | § 5.3 (Talent) + § 5.4 (universal) | ✅ |
| Director's Malice initial preload `floor(avgVictoriesAlive)` | § 5.5 | ✅ |
| Director's Malice round tick `aliveHeroes + N` | § 5.5 | ✅ |
| Universal per-turn heroic resource gain | § 5.3 + § 5.4 (flat 2 or 1d3 per class) | ✅ |
| End-of-encounter heroic resource zeroing | § 5.4 lifecycle ("encounter-scoped, soft-reset") | ✅ |
| End-of-encounter surge zeroing | § 5.6 ("unspent surges lost at the end of combat") | ✅ |
| Open Actions framework | (engine — no Draw Steel rule; trust-model decision) | n/a |

## Slice breakdown

Seven slices. Slice 1 (Open Actions framework) is independent and can run in parallel with 2–6 once kicked off. Slices 4 and 5 depend on 2 + 3; 6 and 7 follow.

### Slice 1 — Open Actions framework *(medium)* — parallelizable

**Schema.** `OpenActionKindSchema` (empty enum), `OpenActionSchema` in `packages/shared/src/open-action.ts`.

**State.** Add `openActions: OpenAction[]` to `CampaignState`, initialized `[]`.

**Intents.** `RaiseOpenAction` (server-only) and `ClaimOpenAction` with Zod payloads + permission gates + reducer logic. There is no `DismissOpenAction` — Open Actions are non-blocking; ignored entries simply auto-expire. Reducers:
- `RaiseOpenAction` appends to `state.openActions`; assigns ulid id; stamps `raisedByIntentId` from `intent.causedBy ?? intent.id`.
- `ClaimOpenAction` removes the OA from `state.openActions` and returns derived intents based on kind (in 2b.0 the per-kind resolution map is empty — claims succeed and clear the OA but emit no derived effects until 2b.0.1 registers consumers).

**Lifecycle hooks.** Open Actions are non-blocking and never require a user to dismiss them. `EndRound` reducer auto-expires OAs whose `expiresAtRound === state.encounter.currentRound`. `EndEncounter` clears `state.openActions = []`. A claimed OA is removed by its `ClaimOpenAction` reducer.

**Copy registry.** `packages/shared/src/open-action-copy.ts` exports `OPEN_ACTION_COPY: Partial<Record<OpenActionKind, { title: (oa) => string; body: (oa) => string; claimLabel: (oa) => string }>>`. Ships empty.

**UI.** A single `OpenActionsList.tsx` component renders the full `state.openActions` list. Behavior:
- **Visible to everyone in the lobby** — directors and players see the same entries. The list is shared, not private.
- Each row renders title + body from the copy registry plus a Claim button.
- The Claim button is **enabled only for the eligible actor**: the targeted participant's owner, or the active director. For every other user the row is read-only (button rendered but disabled, with a tooltip explaining who can act).
- The component is mounted in two places — the director's combat-run screen (under or alongside the intent log rail) and the player's sheet panel rail. Identical contents; per-user enablement is the only behavioral difference.
- 2b.0 ships with the empty-state copy ("No open actions") since the kind enum is empty.

**Validation.** `RaiseOpenAction` rejected if `kind` not in registry; `ClaimOpenAction` rejected with `not_authorized` if actor is neither the participant's owner nor the active director, with `not_found` if `openActionId` doesn't exist.

**Tests.**
- Schema accept/reject for malformed OA payloads.
- `RaiseOpenAction` permission rejection from a player.
- `ClaimOpenAction` rejected when dispatched by a non-owner non-director.
- `EndRound` expires only OAs whose `expiresAtRound === currentRound`; leaves later-expiring OAs in place.
- `EndEncounter` clears the entire list.
- UI snapshot: empty state + sample-populated state (with sample-populated state including both an eligible-actor view with Claim enabled and a non-actor view with Claim disabled).

**Done when.** Two OA intents exist with reducers + tests; state holds an OA list; lifecycle hooks remove OAs at the right boundaries; the shared `OpenActionsList` component renders the same list for every user with per-user Claim enablement.

### Slice 2 — Victories refactor *(small/medium)*

**Schema.** `CharacterSchema.victories: z.number().int().min(0).default(0)` in `packages/shared/src/character.ts`.

**Respite extension.** Each attending PC's own `character.victories` increments by 1 (plus any director bonus, per § 8.1). The existing `xp += victories` conversion sources from the per-PC field; `state.partyVictories` is set to 0 only via the deprecated path.

**Helper.** `sumPartyVictories(state): number` in `packages/rules/src/state-helpers.ts` returns the sum of all PC participants' `victories`.

**Deprecation note.** `state.partyVictories` is kept in `CampaignState` for backwards compatibility until 2b.10 housekeeping. All new code reads `sumPartyVictories(state)` or the per-PC field directly. A code comment on the field explains the deprecation.

**Wizard.** No new wizard step. New characters default to `victories: 0` via the Zod default.

**UI.** Small "Victories: N" chip on `PlayerSheetPanel`, visible alongside the existing stamina / recoveries chips.

**Tests.**
- `Respite` increments each attending PC's per-character `victories`; non-attending PCs are unaffected.
- `sumPartyVictories(state)` matches the legacy `state.partyVictories` value when all PCs are present.
- Encounter-start preload (slice 4) reads each PC's own value, not the party sum.

**Done when.** `character.victories` is a first-class per-character field, populated by `Respite`, surfaced on the player sheet, and read by the encounter-start preload.

### Slice 3 — Heroic resource config table *(small)*

**Files.** `packages/rules/src/heroic-resources.ts` with the `HeroicResourceConfig` type, `HEROIC_RESOURCES` map, and a `getResourceConfigForParticipant(state, participant)` helper that joins on the participant's class (via the participant → character → class lookup).

**Tests.** Every `HeroicResourceName` enum value has a config entry. Each config's `baseGain.onTurnStart` matches canon § 5.4.1–5.4.8 + § 5.3 (Censor 2, Conduit 1d3, Elementalist 2, Fury 1d3, Null 2, Shadow 1d3, Tactician 2, Troubadour 1d3, Talent 1d3). Clarity's floor formula is `{ formula: 'negative_one_plus_reason' }`.

**Done when.** All 9 configs exist; lookup helper works against the active participant's class; tests cover canon shapes.

### Slice 4 — Encounter + round Malice generation *(medium)* — depends on 2 + 3

**Helpers.** Add to `state-helpers.ts`:
- `aliveHeroes(state): Participant[]` — filters `participants` to `kind === 'pc' && currentStamina > -windedValue(p)`. Permissive in 2b.0; 2b.5 replaces.
- `averageVictoriesAlive(state): number` — `floor(sum(aliveHeroes.victories) / aliveHeroes.length)`, returns 0 if no PCs.

**StartEncounter reducer.** Extend the PC materialization pass so each PC's `heroicResources` is seeded with a single entry: `{ name: config.name, current: character.victories }`. After materialization, set `encounter.malice.current = floor(averageVictoriesAlive(state))` and inline the round-1 tick: `+= aliveHeroes(state).length + 1`.

**StartRound reducer (round N > 1).** Add `encounter.malice.current += aliveHeroes(state).length + currentRound`.

**Tests.**
- Canon worked example: 5 PCs all with `victories = 3`, encounter starts → malice = `floor(15/5) + 5 + 1 = 9`. Round 2 → `+ 5 + 2 = 16`. Round 3 → `+ 5 + 3 = 24`. (Matches canon § 5.5 worked example.)
- Hero "death" (currentStamina ≤ -windedValue) drops them from the alive count; subsequent round ticks add `aliveHeroes + N` with the smaller alive count.
- Empty PC roster (edge case — there's no game without PCs): encounter starts → `averageVictoriesAlive` returns 0; round-1 tick adds `0 + 1 = 1`. The reducer does not special-case the empty-roster path; the value is whatever the formula yields.
- Heroic resource preload uses each PC's own `victories`, not the average.

**Done when.** Canon § 5.5 worked example matches the reducer's output; per-PC heroic resource preload is correct; alive-check is permissive but documented.

### Slice 5 — Per-turn heroic resource gain *(small)* — depends on 3

**Payload extension.** `StartTurnPayloadSchema` adds `rolls: z.object({ d3: z.number().int().min(1).max(3) }).optional()`.

**StartTurn reducer.** If the active participant is a PC:
- Look up `HEROIC_RESOURCES[config.name]` via `getResourceConfigForParticipant`.
- Branch on `config.baseGain.onTurnStart`:
  - `{ kind: 'flat', amount }` → reject if `rolls?.d3` is set; otherwise `participant.heroicResources[0].current += amount`.
  - `{ kind: 'd3' }` → reject if `rolls?.d3` is unset; otherwise `+= rolls.d3`.
  - `{ kind: 'd3-plus' }` → reject in 2b.0 (`reason: 'not_yet_supported'`) — 10th-level Psion path is stubbed for 2b.0.1.

**Tests.**
- Each class gets the correct per-turn gain on `StartTurn` (one test per class).
- Flat-class with `rolls.d3` set → rejected.
- d3-class with `rolls.d3` absent → rejected.
- d3 value out of range (0, 4) → schema rejection.
- Gain is additive — applies even when `current` is already non-zero.
- Talent's negative clarity is tolerated — gain applies normally even if `current < 0` (the floor formula doesn't clamp).

**Done when.** Each class's per-turn gain fires correctly via `StartTurn`; payload validation is strict.

### Slice 6 — End-of-encounter cleanup *(small)*

**EndEncounter reducer.** For each PC participant:
- `heroicResources[*].current = 0` (positive and negative both reset).
- `surges = 0`.

Existing partial Clarity wiring at `turn.ts:272` (end-of-turn negative-clarity damage dispatch) is untouched. That's a per-turn mechanic and belongs to 2b.0.1's Talent slice; it doesn't conflict with the encounter-end zeroing.

**Tests.**
- After `EndEncounter`, every PC has `heroicResources[*].current === 0` for any pool that existed.
- A Talent with `clarity = -3` at encounter end → 0 after.
- Surges zero on every PC.

**Done when.** All heroic resources and surges reset cleanly at encounter end.

### Slice 7 — Integration + UI surfacing *(medium)*

**End-to-end test** in `packages/rules/tests/heroic-resources.spec.ts`: materialize a 5-PC party (one each of Censor, Conduit, Fury, Tactician, Talent), run a 3-round encounter:
- Encounter start: every PC's pool seeded from their `victories`; Malice = `floor(avg) + alive + 1`.
- Round 2 / 3: Malice ticks correctly.
- Each `StartTurn` (with appropriate `rolls.d3` payload for d3-classes) adds the configured gain.
- `EndEncounter`: all PCs at 0; surges at 0; OAs cleared (empty in 2b.0).

**Director UI.**
- Top bar Malice display alongside round / victories (extends the existing combat-run top bar component; the plan author resolves the exact component name).
- Per-PC heroic resource chip on the participant card in the left column.
- `OpenActionsList` mounted under the intent log rail (empty in 2b.0).

**Player sheet UI.**
- Heroic resource component shaped to the class (chip for flat-gain classes, slightly more complex display for Talent showing the negative-floor formula).
- Victories chip alongside stamina / recoveries.
- `OpenActionsList` mounted (same component as the director side; per-user Claim enablement is the only difference). Empty in 2b.0.

**Done when.** Integration test passes; Director sees Malice on the top bar; players see their heroic resource and victories on the sheet.

## Sequencing notes

- **Slice 1 is independent.** Can run in parallel with slices 2–6 from the start.
- **Slices 4 and 5 depend on 2 + 3.** Need the per-character victories field and the config table in place.
- **Slice 6 is independent** but ships last to consolidate the cleanup.
- **Slice 7 is the integration cap** — runs after 1–6 to verify the end-to-end behavior and surface the UI.
- **Slice ordering for landing:** 1 (parallel) + 2 → 3 → 4 → 5 → 6 → 7. Five sequential landings on the engine side, one parallel landing on the OA framework.

## Testing strategy

- **Unit tests** in `packages/rules/tests/intents/` covering each extended intent: `start-encounter`, `start-round`, `start-turn`, `end-encounter`, `respite`, `raise-open-action`, `claim-open-action`.
- **Integration test** at `packages/rules/tests/heroic-resources.spec.ts` — 5-class encounter cycle, all 9 classes' baseline gain shapes verified at least once across the suite.
- **Schema tests** — every `HeroicResourceName` has a config entry; `OpenActionSchema` rejects malformed payloads; `StartTurnPayloadSchema` rejects out-of-range d3.
- **Permission tests** — server-only enforcement on `RaiseOpenAction`; owner-or-director gating on `ClaimOpenAction`.
- **UI snapshot tests** for `OpenActionsList` (empty state, sample-populated state with eligible-actor view showing enabled Claim button, sample-populated state with non-actor view showing disabled Claim button).
- **No canon doc edits in 2b.0** — § 5 parent flag flip belongs to 2b.10 housekeeping, after 2b.0 + 2b.0.1 both ship.

## Deferred work

### Deferred to sub-epic 2b.0.1 (the immediate follow-up)

- All class-specific δ gain triggers.
- Elementalist *Maintenance* state machine.
- Troubadour posthumous Drama gain + auto-revive at 30.
- Talent strained-spend confirm UI + 10th-level Psion opt-outs.
- Conduit *Pray to the Gods* (uses the OA framework but its raiser sits with the rest of the Conduit class triggers).
- The four spatial-trigger raisers and the OA copy registry entries.

### Deferred to sub-epic 2b.5 (damage-engine state transitions)

- Strict winded / dying / dead state machine (replaces 2b.0's permissive `currentStamina > -windedValue` alive-check).
- `bodyIntact` semantics formalization (2b.0.1 uses a simple participant flag; 2b.5 reifies it).
- Q16 Revenant inert / 12h Stamina recovery.

### Deferred to sub-epic 2b.10 (canon housekeeping)

- Remove `state.partyVictories` from `CampaignState` once all callers migrate to `sumPartyVictories(state)`.
- Flip § 5 parent flag to ✅ in `rules-canon.md`.

## Acceptance

Sub-epic 2b.0 is done when:

1. `OpenAction` framework — schema, state field, two intents (`RaiseOpenAction` / `ClaimOpenAction`), permission gates, lifecycle hooks, and a shared lobby-visible `OpenActionsList` component — exists with tests.
2. Every PC has a `character.victories` counter that `Respite` increments correctly per canon § 8.1.
3. `StartEncounter` preloads each PC's heroic resource pool from their per-character victories.
4. `StartEncounter` + `StartRound` generate Malice per canon § 5.5 — `floor(averageVictoriesAlive)` preload, `aliveHeroes + N` per-round tick. Canon worked example matches.
5. `StartTurn` applies the universal per-turn gain for all 9 classes, with the `rolls.d3` payload extension for d3-classes and strict payload-shape validation.
6. `EndEncounter` zeros every PC's heroic resources (positive and negative) and surges.
7. Repo-wide `pnpm test`, `pnpm typecheck`, `pnpm lint` clean.

## Open detail

None — all decisions made during the brainstorming pass on 2026-05-13 are captured above.
