# Ancestry Custom Logic Review — 2026-05-11

Research pass over all 12 Draw Steel ancestries to flag which signature traits need
wizard-level structured handling versus passive derivation or text display.

Sources used:
- `apps/web/public/data/ancestries.json` (parsed ingest output)
- `packages/shared/src/data/ancestry.ts` (schema)
- `packages/shared/src/character.ts` (character blob + choices shapes)
- `packages/rules/src/derive-character-runtime.ts` (current derivation engine)

---

## Per-Trait Classification Table

| Ancestry | Signature trait | Class | Notes |
|---|---|---|---|
| **memonek** | Fall Lightly | A | Passive narrative rule: reduce fall distance by 2 squares. Runtime effect only during play; no build-time choice, no stored stat. |
| **polder** | Small! | B | Sets size to `1S`. `deriveCharacterRuntime` currently hard-codes size `'1M'` and ignores ancestry — this override is not applied. |
| **devil** | Silver Tongue | C | Player picks one skill from the interpersonal skill group. This is a build-time skill selection that must be stored and collected into `skills[]`. No current `ancestryChoices` slot for a free skill pick. |
| **dragon-knight** | Wyrmplate | C | Player picks one damage type from a fixed list (acid/cold/corruption/fire/lightning/poison). This choice must be stored; the immunity value (`level`) is then dynamic but the *type* is the build-time pick. The immunity is not yet emitted by `deriveCharacterRuntime`. |
| **dwarf** | Runic Carving | D | No build-time choice; the rune type is changed as a maneuver during play. Pure runtime trigger; display as ability text. |
| **hakaan** | Big! | B | Sets size to `1L`. Same gap as Polder: derivation hard-codes `'1M'`. |
| **high-elf** | High Elf Glamor | A | Passive social edge. No stat or choice; display as rules text. |
| **human** | Detect the Supernatural | D | Active maneuver usable during play. No build-time choice. Should appear in ability list at runtime, but no build-time wizard intervention needed. |
| **orc** | Relentless | D | Triggered free-strike when dropped to dying. No build-time choice; pure runtime trigger. |
| **time-raider** | Psychic Scar | B | Grants psychic immunity equal to character level. `deriveCharacterRuntime` currently emits no immunities from ancestry — this is not applied. |
| **wode-elf** | Wode Elf Glamor | A | Passive stealth edge + imposes bane on searchers. No stat or choice; display as rules text. |
| **revenant** | Former Life | C | Player picks their original ancestry. Size derives from that ancestry's size; speed is fixed at 5 regardless. Detailed analysis below. |

---

## Summary

### Needs Wizard Work (Class C — player choice during build)

#### 1. Devil — Silver Tongue (free interpersonal skill pick)

The signature trait grants one free skill from the interpersonal skill group. This is
structurally identical to a career skill pick:

- **New character-blob field needed**: `ancestryChoices` currently stores only
  `traitIds: string[]` (the purchasable trait selections). It needs an additional
  optional field, e.g. `freeSkillId: string | null`, to capture this pick.
- **Wizard step**: After ancestry selection the wizard must present a skill picker
  filtered to the interpersonal skill group (Flirt, Persuade, etc.).
- **Derivation**: `collectSkills()` in `derive-character-runtime.ts` must be
  extended to include `character.ancestryChoices.freeSkillId` when the ancestry is
  `devil`.
- **Validation**: `CompleteCharacterSchema` should require the pick to be non-null
  when `ancestryId === 'devil'`.

#### 2. Dragon Knight — Wyrmplate (damage type choice)

The signature trait grants immunity to a player-chosen damage type from a fixed
six-element list:

- **New character-blob field needed**: `ancestryChoices` needs a `wyrmplateType:
  string | null` field (or a more generic `damageTypeChoice: string | null`).
- **Wizard step**: Ancestry step must present a damage-type picker (acid / cold /
  corruption / fire / lightning / poison) when dragon-knight is selected.
- **Derivation**: `deriveCharacterRuntime` must read `character.ancestryChoices.wyrmplateType`
  and push `{ kind: wyrmplateType, value: character.level }` into `immunities[]`.
  The value is level-scaled (no build-time number, just read level at runtime).
- **Prismatic Scales** (purchasable, 1 point): Grants a second permanent immunity
  equal to one of the types unlocked by Wyrmplate. The `traitIds` array already
  captures trait selection, but derivation needs to know *which* type is locked in
  permanently — this requires a separate `prismaticScalesType: string | null` sub-choice
  within `ancestryChoices`, or resolve it as "same as wyrmplateType at time of pick"
  (simpler but inflexible if the player later changes Wyrmplate type during a respite).
  Flag this for design review.

#### 3. Revenant — Former Life (see dedicated section below)

---

### Needs Derivation Work (Class B — passive stat not yet folded)

#### Polder — Small! (size `1S`)

`deriveCharacterRuntime` ignores ancestry entirely for size and hard-codes `'1M'`.
No new wizard step is needed but the derivation function must:
1. Look up the ancestry from `staticData.ancestries`.
2. Read a `defaultSize` field — which does not yet exist on `AncestrySchema`.
3. Emit that size into `CharacterRuntime.size`.

**Gap**: `AncestrySchema` has no `defaultSize` or `defaultSpeed` fields. The ingest
parser and schema must be extended to capture these from the markdown source before
derivation can use them.

#### Hakaan — Big! (size `1L`)

Same gap as Polder. Identical fix path.

#### Time Raider — Psychic Scar (psychic immunity = level)

`deriveCharacterRuntime` currently emits no immunities from ancestry — the
`immunities[]` array is always empty. Fix:
1. Add an immunity descriptor to `AncestrySchema` (or handle it as a named
   well-known trait in derivation), e.g. a `grantedImmunities: Array<{ kind:
   string; valueFormula: 'level' | number }>` field.
2. In `deriveCharacterRuntime`, iterate ancestry immunities and resolve `level`
   formulas against `character.level`.

---

### Text-Only / Safe to Defer (Class A)

These ancestries have signature traits that are pure rules text or passive social
edges. No build-time choice and no derived stat. Display as-is:

- **memonek** — Fall Lightly
- **high-elf** — High Elf Glamor
- **wode-elf** — Wode Elf Glamor

### Runtime Triggers / Ability Display Only (Class D)

These have active abilities or triggered reactions but no build-time wizard
intervention:

- **dwarf** — Runic Carving (maneuver during play; rune type is changed at will, not
  locked at creation)
- **human** — Detect the Supernatural (maneuver; should appear in ability list)
- **orc** — Relentless (triggered reaction; should appear in ability list)

No wizard step needed. These should be surfaced as abilities in the character's
runtime ability list. Currently `collectAbilityIds()` only reads class ability
picks from `levelChoices`; ancestry signature abilities that are always-granted
need a separate collection pass (e.g. a `grantedAbilityIds: string[]` field on the
ancestry static data entry).

---

## Revenant — Former Life: Deep Dive

### What the Trait Does

> "Choose the ancestry you were before you died. Your size is that ancestry's size
> and your speed is 5. Unless you select one of the Previous Life traits (see
> below), you don't receive any other ancestral traits from your original ancestry."

### Build-Time Requirements

**1. New character-blob field: `formerAncestryId: string | null`**

The character must store a reference to the chosen former ancestry. A plain string
id (matching `ancestries.json`) is sufficient — no nested object needed.

Proposed location within `ancestryChoices`:
```ts
ancestryChoices: z.object({
  traitIds: z.array(z.string()).default([]),
  formerAncestryId: z.string().nullable().default(null),   // revenant only
  // ... other ancestry-specific sub-choices
}).default({})
```

**2. Wizard picker step**

When the player selects revenant as their ancestry, the wizard must present a
secondary picker: "What were you before you died?" The picker should show all 11
other ancestries (all entries in `ancestries.json` excluding `revenant` itself).

This is a mandatory completion gate: `CompleteCharacterSchema` should require
`formerAncestryId !== null` when `ancestryId === 'revenant'`.

**3. Size derivation**

`deriveCharacterRuntime` must:
1. Detect `ancestryId === 'revenant'`.
2. Look up `staticData.ancestries.get(character.ancestryChoices.formerAncestryId)`.
3. Read the former ancestry's `defaultSize` (requires the schema extension noted
   in the Polder/Hakaan section above).
4. Emit that as `CharacterRuntime.size`.

**4. Speed derivation**

Revenant always has speed 5 regardless of the former ancestry's default speed. This
is already the hard-coded default in `deriveCharacterRuntime` (line 95: `const speed
= 5`), so it is accidentally correct today. However once ancestry-based speed
overrides are added for other ancestries, the logic must explicitly keep revenant
pinned at 5.

**5. Previous Life purchasable traits**

The purchased trait list contains two meta-traits:

| id | Name | Cost |
|---|---|---|
| `previous-life-1-point` | Previous Life: 1 Point | 1 |
| `previous-life-2-points` | Previous Life: 2 Points | 2 |

These are "pass-through" slots: they let the player pick a trait from the *former*
ancestry's purchasable trait list, paying the same point cost. Key interactions:

- **Point cost accounting**: A revenant with `formerAncestryId = 'orc'` who buys
  `previous-life-1-point` must then pick a 1-point trait from the orc trait list
  (e.g. `bloodfire-rush`). The wizard must present a second picker scoped to the
  former ancestry's purchasable traits, filtered by the tier cost.
- **Multiple purchases**: `previous-life-1-point` explicitly says it can be taken
  multiple times. So `traitIds` may contain multiple instances of
  `previous-life-1-point`. The wizard must track *which* former-ancestry trait each
  instance resolves to. This means `ancestryChoices` needs a parallel array, e.g.:
  ```ts
  previousLifeTraitIds: z.array(z.string()).default([])
  ```
  One entry per `previous-life-*` slot purchased, containing the id from the former
  ancestry's trait list.
- **Point cost validation**: The total points spent must not exceed 3. A revenant
  who buys `previous-life-2-points` (2 pts) and `previous-life-1-point` (1 pt) uses
  all 3 points — the wizard's point counter must count these at face value (1 and 2
  respectively), not at the former ancestry trait's cost.
- **Derivation effect**: The resolved former-ancestry trait should produce the same
  runtime effect as if it were a trait of the former ancestry. This means
  derivation must handle former-ancestry traits identically to native purchasable
  traits from other ancestries — which implies a shared trait-effect resolution
  layer rather than ancestry-specific branches.

**6. What does NOT need to be stored**

- No full nested ancestry object — just `formerAncestryId` (an id reference).
- No size number — look it up dynamically from static data.
- Speed is always 5 — no field needed.

### Summary of New Fields Required on `ancestryChoices`

```ts
ancestryChoices: z.object({
  traitIds: z.array(z.string()).default([]),
  // Revenant: the ancestry id of the former life.
  formerAncestryId: z.string().nullable().default(null),
  // Revenant: resolved trait ids from the former ancestry (one per Previous Life slot).
  previousLifeTraitIds: z.array(z.string()).default([]),
  // Devil: the interpersonal skill chosen via Silver Tongue.
  freeSkillId: z.string().nullable().default(null),
  // Dragon Knight: the damage type chosen for Wyrmplate.
  wyrmplateType: z.string().nullable().default(null),
  // Dragon Knight (Prismatic Scales): locked-in permanent immunity type.
  prismaticScalesType: z.string().nullable().default(null),
}).default({})
```

---

## Schema Gaps That Must Be Fixed Before Any of the Above Works

These are prerequisites that span multiple ancestries:

| Gap | Affected Ancestries | Required Fix |
|---|---|---|
| `AncestrySchema` has no `defaultSize` field | polder, hakaan, revenant | Add `defaultSize: string` to `AncestrySchema`; update parser to extract it from markdown |
| `AncestrySchema` has no `defaultSpeed` field | revenant (indirectly) | Add `defaultSpeed: number` to `AncestrySchema`; needed for other ancestries and to make revenant's speed-5 override explicit |
| `AncestrySchema` has no `grantedImmunities` field | time-raider | Add structured immunity descriptor; update ingest parser |
| `AncestrySchema` has no `grantedAbilityIds` or equivalent | human, orc, dwarf (D-class traits) | Add `signatureAbilityId: string | null` or `grantedAbilityIds: string[]` to expose always-on abilities to the runtime ability list |
| `ancestryChoices` on `CharacterSchema` is too narrow | devil, dragon-knight, revenant | Extend `ancestryChoices` with the sub-fields documented above |
| `deriveCharacterRuntime` ignores ancestry entirely for size/speed/immunities | all B-class, revenant | Wire ancestry lookup into size, speed, immunity derivation |
