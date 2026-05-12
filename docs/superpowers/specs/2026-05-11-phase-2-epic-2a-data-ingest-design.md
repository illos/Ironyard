# Phase 2 — Epic 2A: data ingest + inventory schema

Design for the first sub-epic of Phase 2 Epic 2: parsers and structured schemas for items (treasures), kits, abilities, and titles, plus the `inventory` field on `CharacterSchema`. No activation logic, no UI changes beyond the wizard's KitStep naturally lighting up when `kits.json` populates.

This is one of three sub-epics inside Phase 2 Epic 2 (items + inventory + `CharacterAttachment` activation). Epic 2B activates effects; Epic 2C ships interactive UI + runtime intents. Each is its own spec → plan cycle.

## Scope

**In:**
- 4 data parsers, 4 emitted JSON files: `kits.json` (22 entries), `items.json` (~98 entries across 4 categories), `abilities.json` (~545 entries), `titles.json` (~60 entries)
- Schema definitions:
  - `KitSchema` + `KitFileSchema` — extends `ResolvedKitSchema` (which stays in `@ironyard/rules` for derivation reads)
  - `ItemSchema` — discriminated union by `category: 'artifact' | 'consumable' | 'leveled-treasure' | 'trinket'` + `ItemFileSchema`
  - `AbilitySchema` (extracted from `monster.ts` into `ability.ts`, extended with optional PC fields `cost`, `tier`, `isSubclass`, `sourceClassId`) + `AbilityFileSchema`
  - `TitleSchema` + `TitleFileSchema`
- `CharacterSchema.inventory: array<InventoryEntrySchema>` field
- Override file scaffolds at `packages/data/overrides/{items,kits,abilities,titles}.ts` — wired into the build pipeline, empty in 2A

**Out (deferred — see explicit tracking below):**
- `CharacterAttachment` type + activation engine → **2B**
- Folding item/ability/kit/title effects into derived character runtime → **2B**
- Inventory UI on the character sheet → **2C**
- Equip/unequip/use intents → **2C**
- Per-category invariants (3-safely-carry, body-slot conflicts) → **2C**

## Decisions summary

| # | Decision | Rationale |
|---|---|---|
| 1 | 4 slices, ordered Kits → Items → Abilities → Titles+Inventory | Kits ships smallest and unblocks the existing wizard's KitStep immediately (no UI changes); other slices ship behind clean parser boundaries |
| 2 | Reuse `AbilitySchema` for PC abilities — extract from `monster.ts` into `ability.ts`, add optional `cost / tier / isSubclass / sourceClassId` | One schema family across monsters + PCs lets `AbilityCard` consume both seamlessly |
| 3 | `ItemSchema` is a discriminated union by `category`, not a flat shape with optional fields | Each item category has distinct rules (echelon, body slot, kit keyword) and TypeScript narrowing on `category` matches how 2B/2C will branch |
| 4 | `InventoryEntrySchema` is permissive (`{itemId, quantity, equipped}`) — no per-category invariants enforced at the schema level | Carry limits + body-slot conflicts are runtime concerns; the schema stores what the player owns and basic state, 2B/2C compute the rest |
| 5 | Effect text stays as raw markdown body in 2A; structured effect data is hand-authored incrementally in `packages/data/overrides/` during 2B/2C | Matches the "regex extraction over structured grammars" memory note and the phases.md note about incremental override coverage |
| 6 | Slice 1 includes a stretch goal of wiring Sheet's SwapKit picker UI; defer if it expands scope | The new kit data makes SwapKit testable end-to-end with ~30 lines of UI; useful early win if cheap |

## File layout

```
packages/shared/src/data/
├── item.ts                # NEW — discriminated-union ItemSchema + ItemFileSchema
├── kit.ts                 # NEW — KitSchema + KitFileSchema (richer than ResolvedKitSchema)
├── ability.ts             # NEW — extracts AbilitySchema from monster.ts; adds PC optional fields; exports AbilityFileSchema
└── title.ts               # NEW — TitleSchema + TitleFileSchema

packages/shared/src/character.ts
└── (modify) add InventoryEntrySchema + CharacterSchema.inventory

packages/shared/src/index.ts
└── (modify) re-export the new schemas + types

packages/shared/src/data/monster.ts
└── (modify) re-export AbilitySchema from ./ability so existing imports still resolve

packages/data/src/
├── parse-kit.ts           # NEW (Slice 1)
├── parse-item.ts          # NEW (Slice 2)
├── parse-ability.ts       # NEW (Slice 3) — leverages parse-monster-ability internals where shape matches
└── parse-title.ts         # NEW (Slice 4)

packages/data/src/build.ts
└── (modify) wire the 4 new parsers; emit kits.json / items.json / abilities.json / titles.json to apps/web/public/data/ AND apps/api/src/data/

packages/data/overrides/    # NEW directory (Slice 4)
├── _types.ts              # shared override descriptor types (minimal in 2A; grows in 2B)
├── items.ts               # empty scaffold
├── kits.ts                # empty scaffold
├── abilities.ts           # empty scaffold
└── titles.ts              # empty scaffold

packages/data/tests/
├── parse-kit.spec.ts      # Slice 1 — fixture-driven smoke tests
├── parse-item.spec.ts     # Slice 2
├── parse-ability.spec.ts  # Slice 3
└── parse-title.spec.ts    # Slice 4
```

**Emission paths.** Match the Slice 5 pattern from Epic 1.1 — both `apps/web/public/data/*.json` (gitignored, regenerated by build) and `apps/api/src/data/*.json` (committed, DO reads at cold start) get all four new files. Slice 4's build wiring covers all four.

## Schema shapes

### `ItemSchema` — discriminated union

```ts
const ItemBase = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),  // paraphrased rulebook flavor
  raw: z.string().default(''),          // full raw markdown body for fallback display
});

const ArtifactSchema = ItemBase.extend({
  category: z.literal('artifact'),
});

const ConsumableSchema = ItemBase.extend({
  category: z.literal('consumable'),
  echelon: z.number().int().min(1).max(4).optional(),
  effectKind: z.enum(['instant', 'duration', 'two-phase', 'attack', 'area', 'unknown']).default('unknown'),
});

const LeveledTreasureSchema = ItemBase.extend({
  category: z.literal('leveled-treasure'),
  echelon: z.number().int().min(1).max(4),
  kitKeyword: z.string().nullable().default(null),  // weapon/armor tag for kit-keyword matching
});

const TrinketSchema = ItemBase.extend({
  category: z.literal('trinket'),
  bodySlot: z.enum(['arms', 'feet', 'hands', 'head', 'neck', 'waist', 'ring']).nullable().default(null),
});

export const ItemSchema = z.discriminatedUnion('category', [
  ArtifactSchema, ConsumableSchema, LeveledTreasureSchema, TrinketSchema,
]);

export const ItemFileSchema = z.object({
  version: z.string(),
  generatedAt: z.number().int().nonnegative(),
  count: z.number().int().nonnegative(),
  items: z.array(ItemSchema),
});
```

### `KitSchema`

```ts
export const KitSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),
  raw: z.string().default(''),
  staminaBonus: z.number().int().default(0),
  speedBonus: z.number().int().default(0),
  stabilityBonus: z.number().int().default(0),
  meleeDamageBonus: z.number().int().default(0),
  rangedDamageBonus: z.number().int().default(0),
  signatureAbilityId: z.string().nullable().default(null),
  // 2B uses these to gate weapon/armor item bonuses on the attachment fold.
  keywords: z.array(z.string()).default([]),
});

export const KitFileSchema = z.object({
  version: z.string(),
  generatedAt: z.number().int().nonnegative(),
  count: z.number().int().nonnegative(),
  kits: z.array(KitSchema),
});
```

`ResolvedKitSchema` in `@ironyard/rules` stays for derivation — it's a strict subset. The full `KitSchema` is what the wizard's KitStep and Sheet's SwapKit consume.

### `AbilitySchema` — extracted + extended

Existing monster fields preserved (`name`, `type`, `keywords`, `distance`, `target`, `powerRoll`, `raw`, etc.). New optional PC fields:

```ts
cost: z.number().int().min(0).nullable().default(null),        // 0=signature, 3/5/7/9
tier: z.number().int().min(1).max(10).nullable().default(null), // level available
isSubclass: z.boolean().default(false),
sourceClassId: z.string().nullable().default(null),  // 'fury' | 'shadow' | 'kits' | 'common' | ...
```

All optional/nullable so existing monster JSON still parses unchanged.

### `TitleSchema`

```ts
export const TitleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  echelon: z.number().int().min(1).max(4),
  description: z.string().default(''),
  raw: z.string().default(''),
  grantsAbilityId: z.string().nullable().default(null),  // 2B reads this to fold the title's ability
});
```

### `InventoryEntrySchema` on `CharacterSchema`

```ts
export const InventoryEntrySchema = z.object({
  itemId: z.string().min(1),
  quantity: z.number().int().min(0).default(1),
  equipped: z.boolean().default(false),
});

// In CharacterSchema:
inventory: z.array(InventoryEntrySchema).default([]),
```

Carry limits / body-slot uniqueness are NOT enforced at the schema level — 2B/2C compute them at runtime against the inventory + static data.

## Per-slice details

### Slice 1 — Kits parser + `kits.json` + (stretch) Sheet SwapKit picker

**Source:** `.reference/data-md/Rules/Kits/*.md` (22 kits + a `Kits Table.md` index file).

**Parser extracts:**
- `id` (slugified name), `name`, `description` (paraphrased first paragraph), `raw` (full body)
- Numeric bonuses (stamina/speed/stability/melee/ranged) from the header table
- `keywords` from the kit's Weapons / Armor lines (e.g. `['bow']`, `['heavy-armor', 'shield']`)
- `signatureAbilityId` from the kit's signature ability reference (id resolves to an entry that will exist in `abilities.json` after Slice 3 — null until then is acceptable)

**Build wiring:** `parseAllKits()` → `kits.json` written to both web + api data dirs.

**Wizard win:** existing `KitStep.tsx` reads `useKits()` and renders a picker. Empty `kits.json` → populated → 22 kits show up. Zero UI changes needed.

**Stretch goal:** wire Sheet's SwapKit picker UI so it actually picks a kit instead of being disabled. ~30 lines, mostly reusing the existing KitStep widget. Defer if scope expands.

**Tests:** parse 3 representative kits (Mountain, Cloak and Dagger, Arcane Archer) with field-level assertions. Snapshot test confirms all 22 parse without errors.

### Slice 2 — Items parser + `items.json`

**Source:** `.reference/data-md/Rules/Treasures/{Artifacts,Consumables,Leveled Treasures,Trinkets}/*.md` (~98 entries).

**Parser logic:**
- Frontmatter gives `id`, `name`, `echelon` where present; category from directory.
- Body parsing extracts `description` (first paragraph paraphrased) + `raw`.
- For trinkets: regex-parses `bodySlot` from prose ("worn on the head" / "around the neck"). Null when ambiguous.
- For leveled treasures: regex-parses `kitKeyword` from prose ("weapons of the Bow keyword" → `'bow'`). Null when not applicable.
- For consumables: regex-parses `effectKind` from prose patterns (e.g. "as an action" + damage table → `'attack'`; "lasts X rounds" → `'duration'`; "drink twice" → `'two-phase'`). Falls back to `'unknown'`.

**Build wiring:** `parseAllItems()` → single `items.json` containing all 4 categories.

**Tests:** one fixture per category (4 total). Snapshot test confirms all 98 parse cleanly. Test the discriminated-union narrowing: passing an artifact through `ItemSchema.parse` returns an artifact-typed object.

### Slice 3 — Abilities parser + `abilities.json`

**Source:** `.reference/data-md/Rules/Abilities/{Censor,Common,Conduit,Elementalist,Fury,Kits,Null,Shadow,Tactician,Talent,Troubadour}/**/*.md` (~545 entries, some in nested subclass folders).

**Two parser concerns:**

1. **Per-ability shape** — reuse `parse-monster-ability.ts`'s infrastructure. PC ability markdown follows the same `##### Name` heading + `**Power Roll +X**` + tier ladder convention. The existing parser already handles this. Run it against PC files; capture whatever it extracts.

2. **PC-specific metadata** — extract from filename + directory:
   - `sourceClassId` from top-level parent folder (`Fury/` → `'fury'`, `Common/` → `'common'`, `Kits/` → `'kits'`)
   - `cost` from filename pattern (`Signature - ...` → 0; `... 3.md` → 3; numeric prefix patterns)
   - `tier` from filename pattern where present (`5-Wrath Ferocity Strike.md` → 5)
   - `isSubclass` flag if file is inside a deeper subfolder (e.g. `Fury/Berserker/`)

**Refactor note:** Slice 3 extracts `AbilitySchema` out of `monster.ts` into `ability.ts` to host the new optional fields. `monster.ts` re-exports the schema so existing imports keep resolving. This is the only schema-reorganization touch in 2A.

**Build wiring:** `parseAllAbilities()` → `abilities.json` (single flat array, sorted by `sourceClassId` then `name`).

**Coverage target:** ≥80% of entries emit a structured `powerRoll`. Below that, fall back to `raw` text only. Per the regex-extraction memory note: this is the permanent architectural choice, not a stopgap.

**Tests:** fixtures from Fury, Common, and Kits classes. Assert: a signature ability parses with `cost: 0`; a cost-3 ability parses with `cost: 3`; a kit ability parses with `sourceClassId: 'kits'`. Snapshot all 545 — failures get listed by file path so the parser can be tuned.

**Potential freebie:** if `PlayerSheetPanel` can switch from id-list to interactive `AbilityCard`s by just changing the iterator (because PC `Ability` matches monster `Ability` post-extraction), do it in Slice 3. If anything breaks, defer to 2B. The check is: render the player's first character's ability list as cards, click one, confirm `RollPower` dispatches.

### Slice 4 — Titles parser + `titles.json` + `CharacterSchema.inventory` + override scaffolds

**Source:** `.reference/data-md/Rules/Titles/{1st,2nd,3rd,4th} Echelon/*.md` (~60 titles).

**Title parser:**
- Name (heading or filename)
- Echelon from directory
- Description (paraphrased first paragraph)
- `grantsAbilityId` if the title body references an ability — best-effort regex pull from the body

**Inventory schema additions:**
- `InventoryEntrySchema` in `packages/shared/src/character.ts`
- `CharacterSchema.inventory: z.array(InventoryEntrySchema).default([])`
- Test: existing complete-character fixtures still parse (default `[]`)

**Override scaffolds:**

```ts
// packages/data/overrides/_types.ts
// Minimal in 2A — grows in 2B alongside CharacterAttachment.
export type ItemOverride = Record<string, never>;
export type KitOverride = Record<string, never>;
export type AbilityOverride = Record<string, never>;
export type TitleOverride = Record<string, never>;

// packages/data/overrides/items.ts
import type { ItemOverride } from './_types';
export const ITEM_OVERRIDES: Record<string, ItemOverride> = {};

// (similarly for kits.ts, abilities.ts, titles.ts)
```

**Build pipeline:** imports the override maps but folds nothing in 2A (the override shape is empty). Wired-but-no-op until 2B fills `_types.ts` with the real fields and populates the overrides.

**Tests:** parse-title smoke tests (one fixture per echelon, 4 total) + InventoryEntrySchema parse tests.

## Testing strategy

### Per-slice

| Slice | Test files |
|---|---|
| 1 | `packages/data/tests/parse-kit.spec.ts` |
| 2 | `packages/data/tests/parse-item.spec.ts` |
| 3 | `packages/data/tests/parse-ability.spec.ts` |
| 4 | `packages/data/tests/parse-title.spec.ts` + `packages/shared/tests/character.spec.ts` (extended) |

### Cross-cutting

- `pnpm test` — full suite green including new slice tests
- `pnpm typecheck` — clean
- `pnpm --filter @ironyard/data build:data` — emits all 8 JSON files (web + api × 4 types) without errors
- Spot-check counts match source markdown: 22 kits, ~98 items (3+35+35+25), ~545 abilities, ~60 titles

### Manual verification

After Slice 1: open `/characters/new`, pick a kit-using class (Tactician / Censor / Fury / etc.), reach the Kit step. Should see 22 kits as a real picker.

After Slice 3: if the PlayerSheetPanel freebie lands — open `/campaigns/$id/play` as a player with a materialized PC. Ability list should render as interactive cards. Click one → `RollPower` dispatches.

## Deferred work (tracking for 2B / 2C / later)

Each item below has a target sub-epic where it lands. `phases.md` carries the same list so it's findable outside this spec.

### Deferred to Epic 2B (`CharacterAttachment` activation engine)

- **`CharacterAttachment` type definition** — what an attached effect carries (source id, target field, value, conditions)
- **Reducer pass that folds attachment effects into derived runtime** — `deriveCharacterRuntime` extension that reads ancestry traits + class features + ability picks + magic items + kit keywords + titles
- **`ITEM_OVERRIDES` / `KIT_OVERRIDES` / `ABILITY_OVERRIDES` / `TITLE_OVERRIDES` content** — hand-authored entries for items/abilities/etc. whose effects aren't structurally exposed in markdown; `_types.ts` grows the override shape
- **Kit-keyword matching gate** for weapon/armor leveled treasure bonuses
- **Class-D ancestry signature abilities surfacing on the sheet** — Human Detect, Orc Relentless, Dwarf Runic Carving; requires both `signatureAbilityId` ingestion (Slice 3 covers) AND a `collectAbilityIds` extension to read it (2B)
- **`requireCanon` slugs** for the new attachment effects — adds entries to `docs/rules-canon.md`
- **PlayerSheetPanel ability cards** if not landed as Slice 3 freebie

### Deferred to Epic 2C (interactive UI + intents)

- **Inventory display on the character sheet** — formatted sections for owned / equipped items per category
- **Director "push item to player" affordance** — director-facing UI to grant items + corresponding intent
- **Equip / unequip intents** — `EquipItem`, `UnequipItem`
- **`UseConsumable` intent** — consumes 1 quantity, derives the appropriate effect (`ApplyHeal` / `RollPower` / temp buff / etc.) based on `effectKind`
- **3-safely-carry warning** for leveled treasures (4+ requires Presence test at respite)
- **Body-slot conflict surfacing** for trinkets (multiple worn in the same slot)
- **Sheet's SwapKit picker UI** if not landed as Slice 1 stretch goal

### Deferred to Phase 3 or later

- **Party-sheet items** — campaign-scoped inventory (`TransferItem` intent) — Phase 3
- **Custom item homebrew editor** — post-v1

## Acceptance

Epic 2A is done when:

1. `kits.json` ships 22 entries; wizard's KitStep renders a real 22-kit picker; SwapKit dispatches successfully against a real kit id (UI may or may not include the stretch picker)
2. `items.json` ships ~98 entries across 4 categories, each with the structural fields the markdown exposes
3. `abilities.json` ships ~545 entries with at minimum `sourceClassId`, `name`, `raw` text; ≥80% also carry a structured `powerRoll`
4. `titles.json` ships ~60 entries with `echelon`, `name`, `description`, optional `grantsAbilityId`
5. `CharacterSchema.inventory` accepts an array of `InventoryEntrySchema` entries; existing complete-character fixtures still parse with default `inventory: []`
6. Override files exist at `packages/data/overrides/{items,kits,abilities,titles}.ts` — wired into the build pipeline, empty in 2A
7. All tests green, typecheck clean, no console errors on KitStep or Sheet

## Open detail

None.
