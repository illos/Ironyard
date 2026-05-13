# Phase 2 Epic 2C — Interactive UI + Runtime Intents

**Status:** Designed, awaiting plan.
**Predecessor:** Phase 2 Epic 2B — `CharacterAttachment` activation engine ([spec](2026-05-12-phase-2-epic-2b-attachment-engine-design.md), [plan](../plans/2026-05-12-phase-2-epic-2b-attachment-engine.md)).
**Successor:** Phase 3 — collaborative campaign capabilities (next phase, not next epic).
**Scope notes consumed:** [`docs/superpowers/notes/2026-05-12-epic-2c-scope.md`](../notes/2026-05-12-epic-2c-scope.md).

## One-line summary

The character sheet becomes interactive — players equip/unequip items, use consumables, and take respites; directors push items to players. The `CharacterAttachment` engine from 2B drives re-derivation from each new mutation, and § 10.8's weapon-damage-bonus engine variant lands so kit-keyword leveled treasures compute correct tier-scaled damage.

## Goals

- Inventory mutations dispatch through the intent reducer; runtime re-derives via the existing `deriveCharacterRuntime` → `applyAttachments` pipeline.
- Consumables and director-pushed items work end-to-end for the effect kinds backed by existing intents (`ApplyHeal`, `RollPower`).
- `Respite` intent grows to match canon § 11: stamina restoration, heroic-resource floor reset, 3-safely-carry warning (new canon § 10.17 drafted in this epic), Wyrmplate damage-type change (canon § 10.3).
- § 10.8 weapon-damage-bonus engine variant lands so kit-keyword leveled treasures compute correct tier-scaled damage on Strikes and Melee+Weapon / Ranged+Weapon abilities.
- Item + title override coverage sweep — every equip-able item with a static stat fold has an override entry, no equipped item produces a wrong runtime number for any fresh PC at level 1–10.

## Non-goals

See [Deferred work](#deferred-work) for the explicit list. Headline items:

- **Revenant inert / 12h Stamina recovery** (Q16) — depends on damage-engine § 2.7+ winded/dying state transitions, which do not exist yet. Respite for a Revenant at negative-winded is narrated manually.
- **Q18 class-feature choice pipeline** — Conduit Prayers/Wards, Censor Domains. Separate engine epic.
- **UseConsumable `duration` / `two-phase` branches** — need a temp-buff state machine the engine doesn't have. Fall through to the unknown-fallback path.
- **Ranged-distance / disengage kit-bonus variants** — § 10.8 covers tier-scaled melee + ranged *damage* only; distance and disengage bonuses are unparsed and unmodelled.
- **§ 10.10 treasure-bonus stacking** — engine sums duplicate bonuses today; canon flags "only higher applies" but resolves over a separate engine fix.
- **Party-sheet items / `TransferItem`** — Phase 3.

## Architecture

### Pipeline (unchanged from 2B)

`deriveCharacterRuntime` remains a thin orchestrator over `collectAttachments → deriveBaseRuntime → applyAttachments`. 2C adds mutation paths upstream and a new effect-variant downstream:

```
intent dispatch (EquipItem, UnequipItem, UseConsumable, PushItem, Respite)
                          ↓
        reducer mutates character.inventory[] / character state
                          ↓
              deriveCharacterRuntime re-runs
                          ↓
    derived runtime streams to clients; sheet re-renders
```

### Intent surfaces

New intents:

```ts
EquipItem    { characterId, inventoryEntryId }
UnequipItem  { characterId, inventoryEntryId }
UseConsumable { characterId, inventoryEntryId, targetParticipantId? }
PushItem     { targetCharacterId, itemId, quantity? }    // director-only
```

Extended intent:

```ts
Respite (now: stamina restoration; heroic-resource floor reset;
              3-safely-carry warning; Wyrmplate damage-type change prompt)
```

Existing intents reused: `ApplyHeal`, `RollPower`, `SwapKit`, `SetStamina`, `SetResource`.

### Module layout

- `packages/rules/src/intents/equip-item.ts`
- `packages/rules/src/intents/unequip-item.ts`
- `packages/rules/src/intents/use-consumable.ts`
- `packages/rules/src/intents/push-item.ts`
- `packages/rules/src/intents/respite.ts` *(extended)*
- `packages/rules/src/attachments/effects/weapon-damage-bonus.ts` *(new effect variant)*
- `packages/data/overrides/items.ts` *(populated)*
- `packages/data/overrides/titles.ts` *(populated)*
- `apps/web/src/pages/combat/inventory/InventoryPanel.tsx` *(new)*
- `apps/web/src/pages/combat/inventory/ItemRow.tsx` *(new)*
- `apps/web/src/pages/combat/inventory/UseConsumableButton.tsx` *(new)*
- `apps/web/src/pages/combat/inventory/BodySlotConflictChip.tsx` *(new)*
- `apps/web/src/pages/combat/inventory/SafelyCarryWarning.tsx` *(new)*
- `apps/web/src/pages/combat/inventory/SwapKitModal.tsx` *(new)*
- `apps/web/src/pages/combat/RespiteConfirm.tsx` *(new)*
- `apps/web/src/pages/director/PushItemModal.tsx` *(new)*

### Trust boundary

Players dispatch `EquipItem` / `UnequipItem` / `UseConsumable` / `Respite` for their own character. Director-permitted members can dispatch `PushItem` against any character. The reducer rejects `PushItem` from non-directors and rejects player intents that target another player's character. Same trust model as 2A/2B: friend-group, no anti-cheat, audited via the intent log.

### Canon backing

| Intent / surface | Canon | Status |
|---|---|---|
| `EquipItem` / `UnequipItem` | § 10 attachment activation, § 10.6–10.13 per category | ✅ |
| `UseConsumable` instant branch | § 2.13 healing pipeline | ✅ |
| `UseConsumable` attack / area branches | § 1 power roll, § 2 damage application | ✅ |
| `PushItem` | (engine — no Draw Steel rule; trust-model decision) | n/a |
| `Respite` core | § 11 | ✅ |
| `Respite` 3-safely-carry warning | new § 10.17 *(drafted in Slice 4)* | 🚧 → ✅ in Slice 4 |
| `Respite` Wyrmplate change | § 10.3 (footnote: change at respite) | ✅ |
| `weapon-damage-bonus` effect | § 10.8 | 🚧 → ✅ in Slice 5 (executed before Slice 6) |

## Slice breakdown

Six slices, mapped 1:1 to the 2C.1–2C.6 labels from the scope notes. **Execution order is 1 → 2 → 3 → 4 → 6 → 5** — Slice 6 (§ 10.8 engine variant) lands before Slice 5 (override sweep) finishes so leveled-treasure overrides compute correct damage values.

### Slice 1 — Inventory display + Equip/Unequip + SwapKit picker UI *(medium)*

**Intents.** `EquipItem`, `UnequipItem`. Reducer toggles `character.inventory[N].equipped: boolean` and re-derives via `deriveCharacterRuntime`.

**UI.** New `InventoryPanel` rendered in the sheet (likely in `DetailPane.tsx` for in-combat, or in the character review screen). Four category sections: artifacts, leveled treasures, consumables, trinkets. Each row shows item name + per-category metadata (echelon, kit keyword, body slot). Equipped items visually distinct. Equip/Unequip button per row dispatches the appropriate intent.

**Body-slot conflict chip.** For trinkets, if two equipped trinkets share a body slot, both rows show a warning chip. Doesn't block equip — surfaces only.

**SwapKit picker.** Modal triggered from the sheet's kit display. Lists kits from `kits.json`, dispatches existing `SwapKit { kitId }`. The intent already rejects mid-encounter, so the modal can be triggered from the sheet whenever.

**Validation.** `EquipItem` rejected if the inventory entry doesn't exist or is already equipped. `UnequipItem` rejected if the entry isn't equipped. No category-level equip limit (the body-slot chip is informational only).

**Tests.** Unit tests for the two intents (mutation correctness, validation failures). Integration test: equip a stat-fold item, runtime reflects the bonus; unequip, bonus disappears. Snapshot test on `InventoryPanel` for the four-section layout.

**Done when.** Sheet shows inventory by category; equip/unequip toggles the equipped flag via intent and re-derives; body-slot conflict chip surfaces; SwapKit modal dispatches the existing intent.

### Slice 2 — `UseConsumable` intent + UI *(medium)*

**Intent.** `UseConsumable { characterId, inventoryEntryId, targetParticipantId? }`. Branches on the consumable's parsed `effectKind`:

- `instant` → derives `ApplyHeal { targetId: targetParticipantId ?? characterId, amount: <parsed-from-consumable> }`.
- `attack` → derives `RollPower` with the consumable as ability source (uses its parsed power-roll shape).
- `area` → derives `RollPower` against the area target.
- `duration` / `two-phase` / `unknown` → no derived effect; log entry surfaces the consumable's raw text for manual director application.

All branches decrement the inventory entry's `quantity` by 1; entry is removed at 0.

**Authoring requirement.** Item overrides may need to specify the parsed amount for instant healing consumables. The Slice 5 sweep covers populating these.

**UI.** "Use" button per consumable inventory row. For non-self consumables (per the consumable's targeting metadata), a target picker overlays before dispatch. Toast on use; if the branch fell through to manual, the toast surfaces the raw effect text.

**Tests.** Per-branch dispatch tests (instant → ApplyHeal; attack → RollPower; unknown → no-op + raw log). Quantity decrement test. Target-picker integration.

**Done when.** Each consumable's "Use" button dispatches the right derived intent (or logs raw text for unsupported branches); quantity decrements correctly; entry removed at 0.

### Slice 3 — Director push-item *(small)*

**Intent.** `PushItem { targetCharacterId, itemId, quantity? }`. Rejected if the dispatcher isn't director-permitted. Materializes a new `InventoryEntry { itemId, quantity: quantity ?? 1, equipped: false }` on the target character.

**UI.** Director-side modal: character picker (lists approved PCs in the campaign), item search (queries `items.json` by name; results grouped by category). Confirm dispatches the intent. Player-facing toast on the target character's side.

**Validation.** Reducer enforces director auth. Target character must exist and be approved. ItemId must exist in `items.json`. Quantity defaults to 1, max 99 (sanity bound).

**Tests.** Auth rejection (non-director). Successful push materializes inventory entry. Toast fires on target side. Multiple pushes of the same item stack on the existing entry's quantity (rather than creating a duplicate row).

**Done when.** Director can search and push any item to any approved PC; inventory entry appears in their sheet; toast notifies the player.

### Slice 4 — `Respite` intent expansion + UI *(medium)*

**Extended intent.** Existing `Respite` adds:

- **Stamina restoration:** `currentStamina = maxStamina` for every PC in the lobby (the existing intent only refilled recoveries due to the Phase 1 lobby not persisting PCs between encounters — this slice closes that gap).
- **Heroic-resource floor reset:** Talent's negative clarity → 0; other resources are already encounter-scoped and reset at `EndEncounter`. Slice writes the floor-reset logic in a class-agnostic way (`resource.current = max(resource.floor, resource.current)`).
- **3-safely-carry warning:** at dispatch time, count equipped leveled treasures per PC. If > 3, attach a structured warning to the log: `{ kind: 'safely-carry', characterId, count, items: [ids...] }`. Per the rulebook (Heroes PDF p. 326 — *Leveled Treasures → Connection With Leveled Treasures*), the player must make a **Presence power roll** with a tier ladder: **t1 (≤11)** Director picks one treasure that puts you in a fugue state — you discard the rest in unknown locations; **t2 (12–16)** items lock your movement until you pick three to keep; **t3 (≥17)** nothing happens. The engine surfaces the warning; the player dispatches `RollPower` for the Presence test and the director or player dispatches consequence intents (drop items via inventory edit, narrate) — no auto-resolution.
- **New canon entry § 10.17 (3-safely-carry rule):** drafted as part of this slice, two-gate verified during Slice 4. Source: Heroes PDF p. 326; SteelCompendium `Rules/Chapters/Rewards.md` "Leveled Treasures" section.
- **Wyrmplate damage-type change:** Dragon Knight PCs only. UI prompts for new damage type during Respite confirm; on selection, mutates `character.ancestryChoices.wyrmplateType` (the existing field set by the wizard, per `packages/shared/src/character.ts:55-57`). The ancestry collector at `packages/rules/src/attachments/collectors/ancestry.ts:43-44` picks up the new value automatically on re-derive.

**UI.** `RespiteConfirm` modal: lists per-PC summary (stamina/recoveries to be restored, Wyrmplate prompt if Dragon Knight, safely-carry warning if applicable). Confirm dispatches the extended `Respite`.

**Q16 handling.** Explicit code comment on the Respite intent: "Revenant inert / 12h Stamina recovery is out of scope per Q16 — depends on § 2.7+ damage-engine transitions. Manual narration only."

**Tests.** Stamina restored to max for every PC. Talent clarity floor zeros. 3-safely-carry warning fires above threshold, suppressed at ≤ 3. Wyrmplate change re-derives correctly. Q16 path documented but untested (manual).

**Done when.** Respite confirm dispatches the extended intent; all four new mechanics produce the expected mutations + warnings; Dragon Knight player can change Wyrmplate type at respite.

### Slice 5 — § 10.8 weapon-damage-bonus engine variant *(medium)* — executes 5th

**New AttachmentEffect variant:**

```ts
{
  kind: 'weapon-damage-bonus',
  appliesTo: 'melee' | 'ranged',
  perTier: [number, number, number]   // tier 1 / 2 / 3 bonus
}
```

**Parser side.** `parse-kit.ts:99–119` already extracts per-echelon melee + ranged bonus from kit markdown (currently collapses to highest echelon). Restructure to retain all three echelon values (`bonuses: { 1stEchelon: [n,n,n], 2ndEchelon: [...], ... }`). Engine picks the right echelon row based on `character.level`.

**Engine side.** Power-roll evaluation in `intents/roll-power.ts` reads attachments for `weapon-damage-bonus` matching the ability's keywords:
- Ability has `Melee` + `Weapon` keywords → fold `appliesTo: 'melee'` attachments.
- Ability has `Ranged` + `Weapon` keywords → fold `appliesTo: 'ranged'` attachments.
- Per-tier bonus added to the ability's tier-N damage outcome.

**Canon.** § 10.8 lifts from 🚧 to ✅. Registry regenerates via `pnpm canon:gen`.

**Tests.** Mountain kit + a level-3 Censor: free strike damage matches canon (free strike's base + Mountain's 1st-echelon +2/+5/+7). Same Censor at level 7: 3rd-echelon bonus applied. A Centerfire Catalyst (kit-keyword Bow) + Tactician + Mountain kit: Strike damage with bow weapon-keyword treasure applies the ranged tier bonus.

**Done when.** Mountain kit's tier-scaled damage shows up on free strikes AND on every Melee+Weapon ability; ranged equivalents work; kit-keyword leveled treasures bridge to weapon-damage-bonus correctly; § 10.8 ✅.

### Slice 6 — Comprehensive item + title override sweep *(continuous)* — executes 6th

**Coverage bar.** For every item in `items.json` (~98 entries) and every title in `titles.json` (~59 entries), audit whether the entry has a static stat fold (kit-keyword gate, body-slot effect, immunity, weakness, stamina/speed/stability/damage modifier, or grant-ability). If yes, author an override entry in `packages/data/overrides/items.ts` / `titles.ts`.

**Per-entry workflow.** Two-gate verification per existing canon process:
- Gate 1: cite the relevant `.reference/data-md/Rules/Treasures/<name>.md` / `Titles/<name>.md` line range.
- Gate 2: confirm against Heroes PDF page reference.
- Add to the override file with `requireCanonSlug` referencing the matching § 10 subsection.

**Acceptance.** No fresh PC at level 1–10 with reasonable equipped items + a title produces a wrong runtime number (stamina, speed, immunities, recoveries, free-strike damage, weapon damage).

**Why this is continuous, not unit-test-gated.** The sweep is incremental authoring against a 150+ entry surface area. Hard acceptance is "the runtime is correct for any fresh PC" — covered by integration tests that load representative fixtures (one per kit + ancestry combination, ~30 fixtures). Each new override gets a focused unit test if its shape isn't covered by an existing canonical example.

**Done when.** Coverage bar met; ✅ Gate-1 + Gate-2 verification on every authored override.

## Sequencing notes

- **Slice 1 is foundational.** Slices 2 and 3 both depend on the inventory-state mutation flow Slice 1 establishes.
- **Slice 4 is independent.** Can land in parallel with 2–3.
- **Slices 5 and 6 are reordered in execution.** Slice 5 (§ 10.8 engine) lands BEFORE Slice 6 (override sweep) completes, so the override entries for kit-keyword leveled treasures compute correct damage. Slice 6 can *start* in parallel with any earlier slice (the per-entry workflow is independent), but its acceptance bar requires Slice 5 to be in place.
- **Override sweep does not block ship of Slices 1-5.** Slice 6 is the continuous backlog with its own "done" bar; the rest of 2C can be tagged as shipped before every override is authored.

## Testing strategy

- **Per-intent unit tests** in `packages/rules/tests/intents/`. Equip/unequip mutation correctness, validation rejections, derived-intent dispatch for UseConsumable branches, PushItem auth, Respite expanded effects.
- **Integration tests** in `packages/rules/tests/derive-character-runtime.spec.ts`. End-to-end: equip a leveled treasure → runtime damage values reflect tier-scaled bonus. Respite → stamina + clarity floor + warning surfaces.
- **UI snapshot tests** for `InventoryPanel`, `BodySlotConflictChip`, `SafelyCarryWarning`, `RespiteConfirm`, `SwapKitModal`, `PushItemModal`.
- **§ 10.8 wiring tests** added to existing `derive-character-runtime` integration coverage.
- **Canon registry diff check.** `pnpm canon:gen` confirms § 10.8 lifts to ✅; new override entries don't break the registry.
- **Manual smoke**: an integration test that materializes a fresh level-5 Tactician with Mountain kit + Lightning Treads + Knight title, confirms every derived runtime field matches expected canon values.

## Deferred work

Each item below has a target sub-epic or phase where it lands. `phases.md` and `docs/superpowers/notes/` carry the same list so it's findable outside this spec.

### Deferred to future engine epic (§ 2.7+ damage-engine transitions)

- **Revenant inert / 12h Stamina recovery (Q16).** Respite for a Revenant at negative-winded is narrated manually. Pre-condition: § 2.7–§ 2.9 winded/dying/dead state transitions implemented in the engine. The Revenant signature trait then layers on top.

### Deferred to Q18 class-feature pipeline epic

- **Conduit prayer / ward swap at respite.** Q18 — class-feature choice slot pipeline. Schema + parser + override map for Conduit Prayers / Wards / Censor Domains. Same kind of work as inventory but for class features.

### Deferred to temp-buff state machine epic

- **`UseConsumable` `duration` / `two-phase` branches.** Need a temp-buff state machine the engine doesn't have. Falls through to the unknown-fallback path today.

### Deferred to follow-up § 10 work

- **§ 10.10 treasure-bonus stacking ("only higher applies").** Engine sums duplicate bonuses today; canon flags but doesn't block this epic. Resolves with a per-effect-kind reduction rule or treasure-scope tag.
- **Ranged-distance / disengage kit-bonus variants.** § 10.8 covers tier-scaled melee + ranged *damage* only.

### Deferred to Phase 3 or later

- **Party-sheet items / `TransferItem` intent** — Phase 3.
- **Custom item homebrew editor** — post-v1.
- **Server-side intent dispatch** — friend-group trust through v1.

## Acceptance

Epic 2C is done when:

1. All four new intents (`EquipItem`, `UnequipItem`, `UseConsumable`, `PushItem`) and the extended `Respite` exist with reducer logic + tests.
2. Sheet renders inventory by category with equip/unequip/use affordances, body-slot conflict chip, and 3-safely-carry warning.
3. SwapKit picker UI ships on the sheet.
4. Director-side push-item modal ships.
5. `Respite` confirm flow ships with stamina restoration, clarity floor reset, 3-safely-carry warning, and Wyrmplate damage-type change (Dragon Knight).
6. § 10.8 lifts to ✅ via the `weapon-damage-bonus` `AttachmentEffect` variant + power-roll integration; `pnpm canon:gen` registry agrees.
7. Item + title override coverage sweep meets its done bar: no fresh PC level 1–10 produces a wrong runtime number on a representative fixture.
8. `pnpm test`, `pnpm typecheck`, `pnpm lint` clean repo-wide.

## Open detail

None. Wyrmplate storage location verified against `packages/shared/src/character.ts:55-57` during spec self-review.
