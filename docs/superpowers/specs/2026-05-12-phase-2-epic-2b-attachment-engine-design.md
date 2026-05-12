# Phase 2 Epic 2B — `CharacterAttachment` Activation Engine

**Status:** Designed, awaiting plan.
**Predecessor:** Phase 2 Epic 2A — data ingest + inventory schema ([spec](2026-05-11-phase-2-epic-2a-data-ingest-design.md), [plan](../plans/2026-05-11-phase-2-epic-2a-data-ingest.md)).
**Successor:** Phase 2 Epic 2C — interactive UI + runtime intents (not yet specced).
**Scope notes consumed:** [`docs/superpowers/notes/2026-05-12-epic-2b-scope.md`](../notes/2026-05-12-epic-2b-scope.md).

## One-line summary

Build the activation engine that folds attachment effects from ancestry, class features, level-pick abilities, items, kit keywords, and titles into the derived `CharacterRuntime` — plus the Epic 1.1 / 2A carry-overs that depend on stable PC ability ids.

## Goals

- Define `CharacterAttachment` as a discriminated union (envelope + effect variant) — type-safe per effect kind.
- Build a three-step derivation pipeline: `collectAttachments → deriveBaseRuntime → applyAttachments`.
- Refactor existing inline source-reads (kit stat bonuses, Dragon Knight Wyrmplate / Prismatic Scales, ancestry `grantedImmunities`) through the new engine so there is one path for runtime composition, not two. (Time Raider Psychic Scar is an `ancestry.grantedImmunities` entry — gets handled correctly the moment that iteration moves into `collectFromAncestry`.)
- Ship comprehensive ancestry + class + kit override population — every fresh PC, level 1-10, has correct derived runtime.
- Ship canonical-example item + title overrides as smoke tests; comprehensive item/title population is deferred to 2C.
- Add stable `AbilitySchema.id` and light up the deferred-from-2A `PlayerSheetPanel` `AbilityCard` rendering + Class-D ancestry signature abilities (Human Detect, Orc Relentless, Dwarf Runic Carving).
- Add `requireCanon` slugs + two-gate verification for the new attachment categories.

## Non-goals (deferred to 2C or later)

See [Deferred work](#deferred-work) for the explicit list. Headline items:
- Inventory display, equip/unequip intents, `UseConsumable` intent (2C).
- Comprehensive item + title override population (2C, incremental).
- Sheet's SwapKit picker UI (2C).
- Party-sheet items / `TransferItem` intent (Phase 3).
- Server-side attachment evaluation (trust model is friend-group through v1).

## Architecture

### Pipeline

`deriveCharacterRuntime` becomes a thin orchestrator over three steps:

```
collectAttachments(character, staticData)  →  CharacterAttachment[]
                          ↓
       deriveBaseRuntime(character, staticData)  →  CharacterRuntime (no attachments folded)
                          ↓
                applyAttachments(base, attachments, ctx)  →  final CharacterRuntime
```

`deriveBaseRuntime` carries the source-of-truth-on-the-character-blob fields: characteristics from the array, level-derived class bases (starting stamina + per-level stamina before kit bonuses, recoveries from `cls.recoveries`, heroic resource name, default size/speed from ancestry, base free-strike damage of 2). It does NOT read kit bonuses, ancestry `grantedImmunities`, or Dragon Knight Wyrmplate/Prismatic choices — all of those move into collectors.

`collectAttachments` produces a `CharacterAttachment[]` from the character + static data. Each collector is a pure function reading its source.

`applyAttachments` is the only mutator. It folds the attachment list into a clone of the base runtime, gates on `requireCanon` slugs, evaluates conditions, and dispatches on effect kind.

### Module layout

```
packages/rules/src/
  attachments/
    index.ts                       — public API re-exports
    types.ts                       — CharacterAttachment discriminated union
    collect.ts                     — per-source collector dispatch
    apply.ts                       — folds attachments into a base CharacterRuntime
    collectors/
      ancestry.ts                  — traits + signature abilities + DK Wyrmplate / Prismatic
      class-features.ts            — per-class feature attachments (scaffolded in 2B; populated in Slice 4)
      level-picks.ts               — levelChoices.abilityIds + subclassAbilityIds → grant-ability
      kit.ts                       — kit stat bonuses + kit-keyword-gated leveled treasures
      items.ts                     — reads inventory (equipped only) + ITEM_OVERRIDES
      title.ts                     — reads character.titleId + TITLE_OVERRIDES
  derive-character-runtime.ts      — thin orchestrator (calls collect → base → apply)
```

Per-source collector split because:
- Each collector has its own data shape and source-specific quirks (kit reads `kit.staminaBonus`, items iterate inventory, level-picks loop over `levelChoices`).
- The existing inline Dragon Knight code conceptually belongs alongside the rest of its source kind (ancestry).
- Files stay small enough to hold in context while authoring overrides.

### Trust boundary

Collectors are read-only over static data + the character blob. They produce `CharacterAttachment[]` — data, not effects. The applier is the only place a `CharacterRuntime` is mutated. Pure functions throughout; no shared state.

### Wired in via

`deriveCharacterRuntime`'s exported signature is unchanged — the orchestrator preserves the same `(character, staticData) → CharacterRuntime` shape so every call site continues to work.

## `CharacterAttachment` type

```ts
// Where this attachment came from. Used for logging, debugging, canon gating.
export type AttachmentSource = {
  kind:
    | 'ancestry-trait'
    | 'ancestry-signature'
    | 'class-feature'
    | 'level-pick'
    | 'kit'
    | 'kit-keyword-bonus'
    | 'item'
    | 'title';
  id: string;                    // e.g. 'dragon-knight.wyrmplate', 'wrath.kit-stamina'
  requireCanonSlug?: string;     // e.g. 'attachment.kit-stamina-bonus'; absent → manual-override
};

// Optional gate. If present, applier evaluates against runtime/character context;
// falsy → attachment is skipped silently.
export type AttachmentCondition =
  | { kind: 'kit-has-keyword'; keyword: string }
  | { kind: 'item-equipped' };

// What this attachment does. One variant per discrete effect kind.
export type AttachmentEffect =
  | { kind: 'stat-mod'; stat: StatModField; delta: number }
  | { kind: 'stat-replace'; stat: StatReplaceField; value: number | string }
  | { kind: 'grant-ability'; abilityId: string }
  | { kind: 'grant-skill'; skill: string }
  | { kind: 'grant-language'; language: string }
  | { kind: 'immunity'; damageKind: string; value: number | 'level' }
  | { kind: 'weakness'; damageKind: string; value: number | 'level' }
  | { kind: 'free-strike-damage'; delta: number };

export type StatModField =
  | 'maxStamina' | 'recoveriesMax' | 'recoveryValue'
  | 'speed' | 'stability';

export type StatReplaceField = 'size';

export type CharacterAttachment = {
  source: AttachmentSource;
  condition?: AttachmentCondition;
  effect: AttachmentEffect;
};
```

### Type notes

- `value: number | 'level'` mirrors what `AncestrySchema.grantedImmunities` already uses — `'level'` resolves to `character.level` at apply time. Saves override authors from hard-coding per-level values.
- `stat-mod` is the additive numeric case (the common one). `stat-replace` is the rare non-additive case (size is the only field today). One tiny extra variant beats overloading `stat-mod` with a `replace?: boolean` flag.
- `recoveryValue` is in `StatModField` even though it's derived (`floor(maxStamina / 3)`). Direct mods to `recoveryValue` are rare but legal; applier handles ordering — re-derive after `maxStamina` mods, then apply direct `recoveryValue` mods.
- Kit-keyword bonus is a `source.kind` (`'kit-keyword-bonus'`), not an effect kind. The collector emits normal `stat-mod` attachments with a `condition: { kind: 'kit-has-keyword', keyword }`.
- `requireCanonSlug` is optional. Attachments without one always apply (escape hatch for hand-authored entries the user explicitly trusts). Attachments with one are gated through `requireCanon(slug)` at apply time — non-✅ slugs cause the attachment to skip silently, matching the existing two-gate workflow.
- `'item-equipped'` condition is present but the items collector already filters by `inventory[i].equipped === true`. Keeping the variant for future use (e.g. "equipped in slot X" or "equipped alongside Y").

### Override file shapes

`packages/data/overrides/_types.ts` evolves from empty `Record<string, never>` to:

```ts
export type ItemOverride    = { attachments: CharacterAttachment[] };
export type KitOverride     = { attachments: CharacterAttachment[] };  // ON TOP of parsed stat bonuses
export type AbilityOverride = { attachments: CharacterAttachment[] };
export type TitleOverride   = { attachments: CharacterAttachment[] };
```

Override files author attachment lists directly — no translation layer. The override file IS the authored data.

## Collectors

### `collectAttachments`

```ts
export function collectAttachments(
  character: Character,
  staticData: StaticDataBundle,
): CharacterAttachment[] {
  return [
    ...collectFromAncestry(character, staticData),
    ...collectFromClassFeatures(character, staticData),
    ...collectFromLevelPicks(character, staticData),
    ...collectFromKit(character, staticData),
    ...collectFromItems(character, staticData),
    ...collectFromTitle(character, staticData),
  ];
}
```

### Per-source collectors

- **`collectFromAncestry`** —
  - Iterates `ancestry.grantedImmunities` → `immunity` attachments (replaces today's inline code).
  - Emits one `grant-ability` for `ancestry.signatureAbilityId` if set — this is what surfaces Class-D Human Detect the Supernatural / Orc Relentless / Dwarf Runic Carving on the sheet.
  - Reads `ancestryChoices.traitIds` and looks up each trait's `attachments` array on the ancestry's `purchasableTraits` list (purchasable traits whose effects are stat-touching).
  - Dragon Knight Wyrmplate / Prismatic Scales: emits `immunity` attachments using `damageKind = ancestryChoices.{wyrmplateType,prismaticScalesType}` and `value: 'level'`.
  - Revenant: does NOT inherit former-ancestry immunities (canon).
- **`collectFromClassFeatures`** —
  - Class-feature attachments come from override-file additions keyed by `{classId}.{featureSlug}`.
  - 2B ships this collector as scaffolding; concrete class-feature override entries land in Slice 4 as part of comprehensive class coverage. No inline class-feature derivation exists today to refactor.
- **`collectFromLevelPicks`** —
  - For each level key in `character.levelChoices`, emits one `grant-ability` per id in `abilityIds` and `subclassAbilityIds`.
  - Replaces the existing `collectAbilityIds` function in `derive-character-runtime.ts`.
- **`collectFromKit`** —
  - Emits `stat-mod` attachments for kit `staminaBonus` (→ `maxStamina`), `stabilityBonus` (→ `stability`).
  - Emits a `free-strike-damage` attachment for kit `meleeDamageBonus`.
  - Applies `KIT_OVERRIDES[kitId]?.attachments` — kit-keyword-gated leveled-treasure bonuses, each encoded with `condition: { kind: 'kit-has-keyword', keyword }`.
- **`collectFromItems`** —
  - Iterates `character.inventory`; for each entry where `equipped === true`, looks up `ITEM_OVERRIDES[itemId]?.attachments` and emits them.
- **`collectFromTitle`** —
  - Reads `character.titleId`; if non-null, looks up `TITLE_OVERRIDES[titleId]?.attachments` and emits them.

### Schema additions

- `CharacterSchema.titleId: z.string().nullable().default(null)` — net-new field. Existing fixtures default to `null` and continue parsing.
- `AbilitySchema.id: z.string()` — net-new required field. Re-run ingest to populate; commit refreshed `abilities.json`. Format: `{sourceClassId}-{slug-of-name}` (e.g. `tactician-mind-spike`).

## Application

```ts
export function applyAttachments(
  base: CharacterRuntime,
  attachments: CharacterAttachment[],
  ctx: { character: Character; kit: Kit | null },
): CharacterRuntime {
  const out = structuredClone(base);

  // Two passes: stat-mods that touch maxStamina before recoveryValue re-derive,
  // then a second sweep that applies direct recoveryValue mods.
  const directRecoveryValueMods: CharacterAttachment[] = [];

  for (const att of attachments) {
    if (att.source.requireCanonSlug && !requireCanon(att.source.requireCanonSlug)) continue;
    if (att.condition && !evaluateCondition(att.condition, ctx)) continue;
    if (att.effect.kind === 'stat-mod' && att.effect.stat === 'recoveryValue') {
      directRecoveryValueMods.push(att);
      continue;
    }
    applyEffect(out, att.effect, ctx);
  }

  // Re-derive recoveryValue after maxStamina mods land.
  out.recoveryValue = Math.floor(out.maxStamina / 3);

  // Now apply direct recoveryValue mods.
  for (const att of directRecoveryValueMods) {
    applyEffect(out, att.effect, ctx);
  }

  return out;
}
```

`applyEffect` is the exhaustive `switch (effect.kind)` — each branch 1-3 lines:

| Effect kind | Action |
|---|---|
| `stat-mod` | `out[stat] += delta` (recoveryValue handled in second pass per above) |
| `stat-replace` | `out[stat] = value` |
| `grant-ability` | `out.abilityIds.push(abilityId)` (dedupe at end) |
| `grant-skill` | `out.skills.push(skill)` (dedupe) |
| `grant-language` | `out.languages.push(language)` (dedupe) |
| `immunity` | `out.immunities.push({ kind: damageKind, value: resolveLevel(value, ctx.character) })` |
| `weakness` | `out.weaknesses.push({ kind: damageKind, value: resolveLevel(value, ctx.character) })` |
| `free-strike-damage` | `out.freeStrikeDamage += delta` |

Order independence: `stat-mod` deltas are additive so collector order doesn't matter for additive fields. `stat-replace` is last-wins (only `size` today, and only one collector writes to size — practically deterministic). `grant-*` effects accumulate, deduped at the end of `applyEffect`'s sweep.

### Condition evaluation

```ts
function evaluateCondition(cond: AttachmentCondition, ctx: ApplyCtx): boolean {
  switch (cond.kind) {
    case 'kit-has-keyword':
      return ctx.kit?.keywords.includes(cond.keyword) ?? false;
    case 'item-equipped':
      return true; // collector pre-filters by inventory[i].equipped
  }
}
```

## Slice breakdown

Six slices, ordered by dependency.

### Slice 1 — `AbilitySchema.id` + wizard + sheet wiring *(small)*

- `packages/shared/src/data/ability.ts` — add `id: z.string()` to `AbilitySchema`.
- `packages/data/scripts/parse-ability.ts` — populate `id` during ingest using `{sourceClassId}-{slug-of-name}`.
- Re-run `pnpm --filter @ironyard/data build:data`; commit refreshed `abilities.json` (web + api copies).
- `apps/web/src/pages/characters/wizard/` — level picker switches from placeholder strings to real ability ids resolved from `abilities.json`.
- `apps/web/src/pages/combat/PlayerSheetPanel.tsx` — swap id-list rendering for interactive `AbilityCard`s (the 2A deferred freebie).
- `apps/web/src/pages/characters/parts/RuntimeReadout.tsx` — lookup ability name from id instead of rendering raw id.

### Slice 2 — Engine scaffolding *(medium)*

- Create `packages/rules/src/attachments/` per the module layout.
- Land `types.ts` with the discriminated union from this spec.
- Land empty `collectors/*.ts` (each exports `() => []` initially) + `collect.ts`.
- Land `apply.ts` with the exhaustive switch + `evaluateCondition` + `resolveLevel` helper.
- Land `attachments/index.ts` re-exports.
- Refactor `deriveCharacterRuntime` to call the orchestrator (collect → base → apply) — with all collectors returning `[]` this is zero behavioral change.
- Unit tests per effect kind in `apply.test.ts` using hand-built `CharacterAttachment[]` fixtures.

### Slice 3 — Refactor existing inline derivation through the engine *(medium)*

- `collectFromAncestry`: move `ancestry.grantedImmunities` iteration from `deriveCharacterRuntime` inline into the collector. (This automatically covers Time Raider Psychic Scar, which is just a `grantedImmunities` entry of `{ kind: 'psychic', value: 'level' }`.)
- `collectFromAncestry`: emit `immunity` attachments for Dragon Knight Wyrmplate + Prismatic Scales — remove inline pushes.
- `collectFromAncestry`: emit `grant-ability` for `ancestry.signatureAbilityId` — this lights up Class-D ancestry signatures.
- `collectFromKit`: emit `stat-mod` + `free-strike-damage` attachments for `staminaBonus` / `meleeDamageBonus` / `stabilityBonus` — remove inline reads.
- `collectFromLevelPicks`: emit `grant-ability` per id in `levelChoices[lvl].abilityIds` and `.subclassAbilityIds`. Delete the existing `collectAbilityIds` function.
- All existing derivation tests stay green. Expand assertions to cover attachment source attribution where useful.

### Slice 4 — Override file shapes + `CharacterSchema.titleId` + comprehensive kit/ancestry/class population *(medium)*

- `packages/data/overrides/_types.ts` — evolve to `{ attachments: CharacterAttachment[] }` shape.
- `packages/shared/src/character.ts` — add `titleId: z.string().nullable().default(null)`.
- `KIT_OVERRIDES` — populate kit-keyword-gated leveled-treasure bonuses for the canon kit catalog.
- Populate ancestry-trait attachments for purchasable traits whose effects are stat-touching (the ones not yet wired through `purchasableTraits`).
- Populate class-feature attachments for per-level features that fold into runtime (most classes have at least a few — Dragon Knight Wyrmplate gating is already handled via the choice flow, but explicit per-class features land here).
- **Coverage bar:** every fresh PC at any level 1-10 has correct derived runtime including all ancestry traits + class features + kit bonuses + kit-keyword-gated leveled treasures.

### Slice 5 — Canonical-example item + title overrides *(small)*

- One canonical example per item category that folds into runtime: artifact, leveled, trinket. (Consumables don't fold into runtime — they dispatch intents, deferred to 2C.)
- One canonical example title with `grant-ability` and one with `stat-mod`.
- Smoke tests: a character with one of each in equipped inventory + an active title has the expected runtime values.

### Slice 6 — `requireCanon` slugs + two-gate verification *(small)*

- Add `docs/rules-canon.md` entries for each new attachment category — at minimum: `attachment.kit-stamina-bonus`, `attachment.kit-stability-bonus`, `attachment.kit-melee-damage-bonus`, `attachment.kit-keyword-bonus`, `attachment.ancestry-signature-ability`, `attachment.ancestry-granted-immunity`, `attachment.dragon-knight-wyrmplate`, `attachment.dragon-knight-prismatic-scales`, `attachment.item-grant`, `attachment.title-grant`. Exact list refined as slices land.
- Source-check pass per the existing two-gate workflow.
- Manual user-review pass.
- Spot-check: any non-✅ slug causes those attachments to skip silently. Confirm by temporarily flipping one to non-✅ in a test.

### Sequencing notes

- Slice 1 is independent of the engine; can be reviewed early and shipped first.
- Slices 2 and 3 form the engine landing. Slice 3 is the moment the inline Dragon Knight / ancestry-immunities / kit code disappears from `deriveCharacterRuntime`.
- Slice 4 is where 2B's user-facing "fresh PCs are correct" value lands.
- Slices 5-6 are smoke-test coverage + correctness gating.

## Testing strategy

### Unit tests in `packages/rules/`

- `attachments/apply.test.ts` — one test per `AttachmentEffect.kind`, asserting the applier produces the right runtime mutation given a base + a single attachment. Plus order-independence test (shuffle attachment array, same output). Plus the `recoveryValue` ordering test (maxStamina mod + direct recoveryValue mod compose correctly).
- `attachments/condition.test.ts` — `kit-has-keyword` true/false; missing kit; missing keyword field on kit.
- `attachments/requireCanon.test.ts` — attachment with ✅ slug applies; attachment with non-✅ slug is silently skipped; attachment with no slug always applies.
- `attachments/collectors/*.test.ts` — each collector tested in isolation against fixture characters. Ancestry collector test asserts DK Wyrmplate produces the right `immunity` attachment with `value: 'level'` and the right source attribution.

### Integration tests in `packages/rules/derive-character-runtime.test.ts`

- All existing tests stay green. Runtime output is the same; only the path changed.
- New assertions: per-attachment-source coverage on a fully-built level-10 character — e.g. "a level-10 Human Tactician with kit X has these N attachments folded in, contributing these specific runtime values."
- Smoke test on a fixture with all six source kinds firing simultaneously.

### Fixture characters

Build 2-3 reference characters in `packages/rules/__fixtures__/` representing the comprehensive coverage bar:

- Level-1 Human Tactician (signature ability + kit bonus + culture skills).
- Level-5 Dragon Knight (Wyrmplate + Prismatic + class features + multiple level-picks).
- Level-10 Revenant of [some class] (broadest attachment count; validates the deepest case).

### Per-slice verification

`pnpm test`, `pnpm typecheck`, `pnpm lint` green before each slice closes. The slice that touches UI (Slice 1) also gets the iPad-portrait (810×1080) / iPhone-portrait (390×844) screenshot check on the sheet to confirm `AbilityCard` rendering is responsive.

## Deferred work

Each item below has a target sub-epic or phase where it lands. `phases.md` carries the same list so it's findable outside this spec.

### Deferred to Epic 2C (interactive UI + intents)

- Inventory display on the character sheet (formatted sections for owned / equipped items per category).
- `EquipItem` / `UnequipItem` intents.
- `UseConsumable` intent (consumes 1 quantity; dispatches the consumable's effect — heal / roll / buff — based on `effectKind`).
- Director "push item to player" affordance + corresponding intent.
- 3-safely-carry warning for leveled treasures (Presence test at respite when over 3).
- Body-slot conflict surfacing for trinkets.
- Sheet's SwapKit picker UI.
- **Comprehensive item override population.** 2B ships canonical examples; the long-tail sweep across the ~98 ingested items happens incrementally in 2C as equip intents create the demand surface.
- **Comprehensive title override population.** Same story; 2B ships canonical examples, 2C does the full sweep.

### Deferred to Phase 3 or later

- Party-sheet items / `TransferItem` intent — Phase 3.
- Custom item homebrew editor — post-v1.
- Server-side attachment evaluation. v1 client-derives; trust model is friend-group. Architecture is structured so swapping where `applyAttachments` runs (client → server worker) is a deployment change, not a refactor.

## Acceptance

Epic 2B is done when:

1. `AbilitySchema.id` ships; every entry in `abilities.json` has a stable id; wizard level-pick stores real ability ids; `PlayerSheetPanel` renders interactive `AbilityCard`s.
2. `packages/rules/src/attachments/` exists per the module layout in [Architecture](#architecture); all collectors + applier + types + exhaustive effect-kind switch land.
3. `deriveCharacterRuntime` is a thin orchestrator over `collectAttachments → deriveBaseRuntime → applyAttachments`; no inline source-data reads remain in the orchestrator beyond what `deriveBaseRuntime` legitimately owns (characteristics array mapping, base stamina/recoveries, default size/speed/free-strike).
4. Comprehensive ancestry + class + kit override coverage: every fresh PC at any level 1-10 has correct derived runtime including ancestry signature abilities, ancestry traits, class features, kit stat bonuses, and kit-keyword-gated leveled treasures.
5. Canonical-example coverage: at least one item override per category that folds into runtime (artifact, leveled, trinket) + at least one title override of each effect shape (`grant-ability`, `stat-mod`).
6. `requireCanon` slugs exist + ✅ in `docs/rules-canon.md` for every attachment category in use.
7. `CharacterSchema.titleId` added; existing fixtures still parse.
8. All existing `derive-character-runtime` tests green; new unit + integration tests added per [Testing strategy](#testing-strategy).
9. `pnpm test`, `pnpm typecheck`, `pnpm lint` clean repo-wide.

## Open detail

None. The Title schema add (`CharacterSchema.titleId`) is captured in Slice 4.
