# Phase 2 Epic 2B — Scope Notes

Pre-brainstorm punch list captured at the close of Epic 2A. Not a spec — these are the things in flight to brainstorm into a real spec when 2B kicks off.

## Context

Phase 2 Epic 2 is decomposed into three sub-epics (see `docs/phases.md`):

- **2A — data ingest + inventory schema** — SHIPPING. Plan at `docs/superpowers/plans/2026-05-11-phase-2-epic-2a-data-ingest.md`. Spec at `docs/superpowers/specs/2026-05-11-phase-2-epic-2a-data-ingest-design.md`.
- **2B — `CharacterAttachment` activation engine** — this doc.
- **2C — interactive UI + runtime intents** — not yet specced.

2A landed: 21 kits, 98 items, 545 abilities, 59 titles; `CharacterSchema.inventory` plumbed; empty override scaffolds at `packages/data/overrides/{items,kits,abilities,titles}.ts`. Wizard's KitStep lit up with zero UI changes. All tests + typecheck green.

## What 2B needs to deliver

### Foundation work

- **Define `CharacterAttachment` type** — what an attached effect carries. Likely shape:
  - `sourceKind: 'ancestry-trait' | 'class-feature' | 'ability-pick' | 'item' | 'kit' | 'title'`
  - `sourceId: string` (which trait / feature / item / etc.)
  - `targetField: string` (which CharacterRuntime field it modifies: `maxStamina`, `speed`, `freeStrikeDamage`, an immunity entry, a granted ability id, …)
  - `value: number | string | …` (the delta or replacement)
  - `condition?: string` (e.g. only-when-equipped, only-when-kit-matches)
  - `requireCanonSlug: string` (gate the effect on canon verification)

- **Activation reducer pass** in `packages/rules/` — folds attachments from all sources into the derived `CharacterRuntime`. Lives alongside or extends `deriveCharacterRuntime`. Sources to fold:
  - Ancestry traits (purchased + signature)
  - Class features (per-level + subclass)
  - Ability picks (`levelChoices.abilityIds`)
  - Magic items (equipped trinkets, equipped leveled treasures, active artifacts)
  - Kit keywords (kit feature bonuses)
  - Titles (active title grants)

- **`requireCanon` slugs** — add entries to `docs/rules-canon.md` for each attachment effect category, following the two-gate verification workflow (source check + manual user review). Non-verified slugs fall back to manual-override / raw-text display.

### Override population (incremental, lives mostly in 2B as effects come online)

- `packages/data/overrides/_types.ts` grows from empty `Record<string, never>` to real shapes (stat mods, granted abilities, condition immunities, etc.). Each shape gets shipped with the first override that uses it.
- Hand-author entries in `items.ts`, `kits.ts`, `abilities.ts`, `titles.ts` for items whose effects aren't structurally exposed in the markdown. **Coverage is incremental** — start with the canonical-example set per category, expand as needed.

### Epic 1.1 + 2A carry-overs that land here

| Item | What's needed |
|---|---|
| **PC ability id stability** | Add stable `id` field to `AbilitySchema` (e.g. `{sourceClassId}-{slug-of-name}`); re-run ingest; update wizard's level-pick stub to store real ability ids instead of placeholder strings |
| **PlayerSheetPanel `AbilityCard` wiring** | Deferred 2A freebie. Cheap (~30 lines) once the id field lands. |
| **Class-D ancestry signature abilities** | Human Detect the Supernatural, Orc Relentless, Dwarf Runic Carving. `AncestrySchema.signatureAbilityId` is already wired (Epic 1.1 Slice 5); `collectAbilityIds()` in `packages/rules/src/derive-character-runtime.ts` needs to read it. Comment in that file marks the spot. |
| **Kit-keyword matching gate** | Weapon/armor leveled treasures only grant bonuses when the character's kit declares a matching keyword. Kit `keywords` field is parsed in 2A Slice 1. |
| **Dragon Knight Wyrmplate / Prismatic Scales / Time Raider Psychic Scar** | Already wired in Epic 1.1 Slice 6 derivation. May want to refactor through the unified attachment pass once it exists, but works correctly today — don't break it. |

### Out of 2B (deferred to 2C — interactive UI)

- Inventory display on the character sheet (the "previewable sheet" we explicitly punted earlier)
- Equip / unequip / use intents (`EquipItem`, `UnequipItem`, `UseConsumable`)
- Director "push item to player" affordance
- 3-safely-carry warning for leveled treasures (Presence test at respite when over 3)
- Body-slot conflict surfacing for trinkets
- Sheet's SwapKit picker UI (was a 2A Slice 1 stretch goal that didn't ship; currently the button is disabled)

## Rough sequencing inside 2B

1. **`AbilitySchema.id` field + wizard wiring** — unblocks several downstream items, small change
2. **`CharacterAttachment` type + activation engine** — the brain, sizable
3. **Override population in pass-by-pass cycles** — ancestries first (smallest scope), then class features, then items, then titles
4. **PlayerSheetPanel switch to interactive cards** — falls out once ability ids are stable
5. **Unified `collectAbilityIds` + ancestry signature abilities** — surface Class-D on the sheet
6. **`requireCanon` slug additions + two-gate verification** — final correctness pass

## Where to start the next conversation

1. Read this file
2. Read `docs/phases.md` § "Phase 2 Epic 2 — items + inventory + CharacterAttachment activation" for the overarching scope
3. Brainstorm the spec (use `superpowers:brainstorming` skill) — likely first clarifying question is which sub-slice to tackle first (the AbilitySchema.id change is the cheap one; the activation engine is the meaty one)
4. Spec → plan → execute via `superpowers:subagent-driven-development` per the pattern Epic 2A established
