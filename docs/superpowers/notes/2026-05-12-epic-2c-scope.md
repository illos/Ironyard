# Phase 2 Epic 2C — Scope Notes

Pre-brainstorm punch list captured at the close of Epic 2B. Not a spec — these are the things in flight to brainstorm into a real spec when 2C kicks off.

## Context

Phase 2 Epic 2 is the three-sub-epic trio (see `docs/phases.md`):

- **2A — data ingest + inventory schema** — SHIPPED. Plan at `docs/superpowers/plans/2026-05-11-phase-2-epic-2a-data-ingest.md`. Spec at `docs/superpowers/specs/2026-05-11-phase-2-epic-2a-data-ingest-design.md`.
- **2B — `CharacterAttachment` activation engine** — SHIPPED. Plan at `docs/superpowers/plans/2026-05-12-phase-2-epic-2b-attachment-engine.md`. Spec at `docs/superpowers/specs/2026-05-12-phase-2-epic-2b-attachment-engine-design.md`.
- **2C — interactive UI + runtime intents** — this doc.

2B landed: `CharacterAttachment` types + collectors + applier; engine refactor of all inline derivation through the new pass; 8 ancestry purchased-trait overrides + canonical item/title examples; Section 10 of `docs/rules-canon.md` with 12 sub-sections ✅ via Gate 2 walkthrough. Three new Q-entries surfaced for engine gaps (Q16 Revenant inert mechanics, Q17 ancestry signature-trait engine gaps, Q18 class-feature choice slot pipeline).

## What 2C needs to deliver

The user-visible value of 2C: **the character sheet becomes interactive**. Today the engine *correctly derives* inventory and title effects given a stored `character.inventory[].equipped` and `character.titleId`, but there's no UI to change those values from the play surface and no intent flow to mutate them at runtime.

### Core deliverables

1. **Inventory display on the character sheet** — formatted sections per item category (artifacts, leveled treasures, trinkets, consumables). Already-equipped items visually distinct from carried. Read-only first; intent-backed second.
2. **`EquipItem` / `UnequipItem` intents** — player-dispatched mutations to `character.inventory[N].equipped`. Re-derives runtime through the existing `deriveCharacterRuntime` → `applyAttachments` pipeline; new derived values stream back via the existing wire.
3. **`UseConsumable` intent** — consumes 1 quantity from a consumable inventory entry, dispatches the consumable's effect (heal / roll / temp-buff) based on parsed `effectKind`. Branches by consumable category; some need a target picker.
4. **Director "push item to player" affordance** — director-side UI + corresponding intent (`PushItem` or `GrantItem`) that adds an inventory entry to a target character. Bypasses the wizard.
5. **`Respite` intent** — bigger than originally scoped after Q16. Needs to handle:
   - Recovery refill (per-class max)
   - Heroic-resource floor reset
   - Title/feature respite-activity hooks (Conduit prayer/ward swap, Dragon Knight Wyrmplate damage-type change per § 10.3 footnote)
   - Revenant 12h Stamina recovery from inert state (Q16) — depends on damage-engine winded/dying transition work landing first; might defer the Revenant-specific path
6. **3-safely-carry warning for leveled treasures** — Presence test at respite when >3 active leveled treasures. Surface on the sheet + at respite-time.
7. **Body-slot conflict surfacing for trinkets** — visual warning when two equipped trinkets share a body slot (head / neck / hands / feet / waist / ring). Doesn't auto-resolve; surfaces to the player.
8. **Sheet's SwapKit picker UI** — was a 2A Slice 1 stretch goal that didn't ship; verify status. The intent exists; UI for triggering it from the sheet is the missing piece.
9. **Comprehensive item + title override population** — long-tail authoring as `ITEM_OVERRIDES` + `TITLE_OVERRIDES` entries. 2B shipped canonical examples; full sweep across all 98 items + 59 titles lands here incrementally as equip intents create the demand.

### Sub-epic decomposition (likely needed)

2C is sprawling. Suggested sub-decomposition during brainstorm:

- **2C.1 — Inventory display + Equip/Unequip intents.** The read-side display + the simplest mutation intents. Lights up the equipped/unequipped attachment flow end-to-end. Smallest, most foundational.
- **2C.2 — Consumables (`UseConsumable` intent + UI).** Branches by `effectKind`. Probably its own slice given the variety (heal, ApplyHeal-derived, RollPower-derived, temp-buff).
- **2C.3 — Director affordances + push-item intent.** Director side of the inventory flow. Smaller.
- **2C.4 — Respite intent + post-respite mechanics.** Includes safely-carry warning, Wyrmplate change, post-respite resource resets. Q16 might force scope decisions.
- **2C.5 — Override population sweep.** Incremental hand-authoring; coverage bar = "every item with a static stat fold has an override entry."

Order matters: 2C.1 must precede 2C.2 + 2C.3 since both depend on inventory state mutation working. 2C.4 is independent and can land in parallel. 2C.5 is continuous backlog work.

## Carry-overs from 2A / 2B that land in 2C

| Item | What's needed |
|---|---|
| **Inventory display** | Per 2A spec deferred; first thing to ship in 2C.1 |
| **Equip/Unequip/UseConsumable intents** | Per 2A + 2B spec deferred |
| **Director push-item** | Per 2A + 2B spec deferred |
| **3-safely-carry warning** | Per 2A + 2B spec deferred |
| **Body-slot conflict surfacing** | Per 2A + 2B spec deferred |
| **SwapKit picker UI** | Per 2A spec deferred — verify whether this is still missing or if a slice 1 stretch goal landed |
| **Comprehensive item override population** | Per 2B spec — Slice 5 shipped canonical examples; the sweep lands here |
| **Comprehensive title override population** | Same |
| **Respite engine work** | Wyrmplate change-at-respite (§ 10.3 footnote), Revenant 12h Stamina recovery (Q16), post-respite resource resets |

## Known engine gaps that 2C *may* trigger work on (or defer)

These were surfaced during the Epic 2B Gate 2 canon walkthrough. None are strictly required by 2C but each touches inventory / item interactions:

- **§ 10.8 — Weapon damage bonus engine variant.** Today kit melee bonus is modelled as flat `free-strike-damage`; canon requires tier-scaled (+X/+Y/+Z) damage on all Melee+Weapon abilities, not just free strikes. Plus ranged-damage / distance / disengage bonuses are unparsed and unmodelled. Resolves with a new `weapon-damage-bonus` `AttachmentEffect` variant + power-roll integration. Could land before 2C.5 to make the sweep more rewarding, or be its own engine epic.
- **§ 10.10 — Treasure-bonus stacking.** Canon says "only the higher bonus applies" when two treasures grant the same kind of bonus; engine sums. Needs per-effect-kind reduction rule or treasure-scope tag.
- **Q18 — Class-feature choice slot pipeline.** Conduit Prayers / Wards / Censor Domain features are real static-stat-granting choices the engine can't currently model (no schema slot, no parser path, no override map). Independent of 2C's inventory/intent focus, but a Conduit hero is mechanically incorrect until this lands.

These are explicit candidates for "do before 2C", "do during 2C", or "defer to a separate engine epic." Brainstorm should decide.

## Out of 2C (deferred to Phase 3+)

- **Party-sheet items / `TransferItem` intent** — campaign-scoped inventory, Phase 3
- **Custom item homebrew editor** — post-v1
- **Server-side attachment evaluation** — trust model is friend-group through v1
- **Q16 (Revenant inert mechanics)** — depends on damage-engine winded/dying transitions, which haven't been built yet. The Revenant respite path in 2C.4 might just narrate "you become inert" as a manual override until § 2.7+ canon lands.
- **Q17 (Orc Relentless triggered, Dwarf Runic Carving choice, Glamor test edges)** — these need engine mechanics that don't exist (triggered passives, rune systems, test-edge modifiers). Separate work.

## Rough sequencing inside 2C

1. **2C.1** — Inventory display + Equip/Unequip intents (foundation)
2. **2C.2** — `UseConsumable` intent + UI (depends on 2C.1's inventory mutation flow)
3. **2C.3** — Director push-item intent + UI (parallel-safe with 2C.2)
4. **2C.4** — Respite intent + post-respite mechanics (independent track)
5. **2C.5** — Override-population sweep (continuous; can interleave with all of the above as overrides come up)

Optionally:
6. **2C.6** — § 10.8 weapon-damage-bonus engine variant (the missing piece for the kit-keyword leveled-treasure flow in 2C.5 to be fully correct)

## Where to start the next conversation

1. Read this file
2. Read `docs/phases.md` § "Phase 2 Epic 2 — items + inventory + CharacterAttachment activation" for the overarching scope
3. Read `docs/superpowers/specs/2026-05-12-phase-2-epic-2b-attachment-engine-design.md` § "Deferred to Epic 2C" for the canonical 2C scope list
4. Skim `docs/rules-canon.md` § 10.16 (carry-overs) — known engine gaps that may bear on 2C scope decisions
5. Brainstorm the spec (use `superpowers:brainstorming` skill) — first clarifying question is probably about sub-decomposition: ship 2C as one big spec like 2B, or break into 2C.1 / 2C.2 / etc. as separate specs?
6. Spec → plan → execute via `superpowers:subagent-driven-development` per the pattern Epic 2A + 2B established
