# Phase 2 Epic 2A — Data Ingest + Inventory Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship parsers + structured JSON outputs for kits (22), items (~98), abilities (~545), and titles (~60). Add `CharacterSchema.inventory` plumbing. Scaffold `packages/data/overrides/` for 2B's effect-folding work.

**Architecture:** Four slices (Kits → Items → Abilities → Titles + Inventory). Each slice adds a Zod schema in `packages/shared/src/data/`, a parser in `packages/data/src/`, a fixture-driven test, and wires the build pipeline in `packages/data/build.ts` to emit JSON to both `apps/web/public/data/` and `apps/api/src/data/`. Kits ships first because populating `kits.json` lights up the existing wizard `KitStep` with zero UI changes. Abilities is the largest (545 entries) and reuses `parse-monster-ability.ts` internals where shape matches.

**Tech Stack:** TypeScript + Zod schemas, Node.js parser (uses existing `gray-matter` for frontmatter), vitest for fixture tests.

**Spec:** `docs/superpowers/specs/2026-05-11-phase-2-epic-2a-data-ingest-design.md`

---

## Notes on the source data

Every Draw Steel markdown file has rich YAML frontmatter. The parsers should lean heavily on frontmatter for structural fields and only body-parse for description / raw / keyword lines that aren't in frontmatter.

**Kits** (`.reference/data-md/Rules/Kits/*.md`):
- Frontmatter: `item_id`, `item_name`, `type: kit`. No echelon.
- Body has `##### Kit Bonuses` section with `**Stamina Bonus:** +9 per echelon` etc., `##### Equipment` section with weapon/armor keywords, and `##### Signature Ability` section.

**Items / treasures** (`.reference/data-md/Rules/Treasures/{Artifacts,Consumables,Leveled Treasures,Trinkets}/*.md`):
- Frontmatter: `item_id`, `item_name`, `echelon`, `treasure_type`, `type: treasure/...`.
- Body has `**Keywords:**` line (e.g. `Head, Magic` for a trinket — first matching slot name `head/neck/arms/feet/hands/waist/ring` is the body slot).

**Abilities** (`.reference/data-md/Rules/Abilities/{class}/**/*.md`, 545 files):
- Frontmatter: `class`, `action_type`, `cost`, `cost_amount`, `cost_resource`, `distance`, `target`, `keywords`, `level`, `feature_type`. Almost everything we need is here.
- Body has the description, the power-roll tier table, and effects — already handled by `parse-monster-ability.ts`.

**Titles** (`.reference/data-md/Rules/Titles/{1st,2nd,3rd,4th} Echelon/*.md`):
- Frontmatter: `item_id`, `item_name`, `echelon` (`1st`/`2nd`/`3rd`/`4th`), `type: title/...`.
- Body has `**Prerequisite:**`, `**Effect:**`, optional ability blocks.

The existing parsers (`parse-ancestry`, `parse-career`, `parse-class`, `parse-complication`, `parse-monster`) use `gray-matter` to split frontmatter from body. Follow the same pattern verbatim.

## Build pipeline conventions

- `packages/data/build.ts` is the entry point. It currently emits `monsters.json`, `ancestries.json`, `careers.json`, `complications.json`, `classes.json`, and `kits.json` (empty `[]` placeholder).
- Each emission goes to BOTH `apps/web/public/data/` (gitignored, regenerated) AND `apps/api/src/data/` (committed, DO reads at cold start).
- Wrapper shape: `{ version, generatedAt, count, <items>: [] }` is the canonical envelope. Existing parsers use this.

---

## Slice 1: Kits

### Task 1.1: KitSchema

**Files:**
- Create: `packages/shared/src/data/kit.ts`
- Modify: `packages/shared/src/index.ts` (re-export)
- Test: `packages/shared/tests/kit.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/tests/kit.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { KitSchema, KitFileSchema } from '../src/data/kit';

describe('KitSchema', () => {
  it('parses a kit with all required fields', () => {
    const k = KitSchema.parse({
      id: 'mountain',
      name: 'Mountain',
      staminaBonus: 9,
      stabilityBonus: 2,
      meleeDamageBonus: 4,
    });
    expect(k.id).toBe('mountain');
    expect(k.staminaBonus).toBe(9);
    expect(k.speedBonus).toBe(0); // default
    expect(k.signatureAbilityId).toBeNull(); // default
    expect(k.keywords).toEqual([]); // default
  });

  it('accepts keywords and signatureAbilityId', () => {
    const k = KitSchema.parse({
      id: 'mountain',
      name: 'Mountain',
      keywords: ['heavy-weapon', 'heavy-armor'],
      signatureAbilityId: 'mountain-pain-for-pain',
    });
    expect(k.keywords).toEqual(['heavy-weapon', 'heavy-armor']);
    expect(k.signatureAbilityId).toBe('mountain-pain-for-pain');
  });
});

describe('KitFileSchema', () => {
  it('parses an envelope with kits array', () => {
    const f = KitFileSchema.parse({
      version: '1.0',
      generatedAt: 0,
      count: 1,
      kits: [{ id: 'mountain', name: 'Mountain' }],
    });
    expect(f.count).toBe(1);
    expect(f.kits[0]?.id).toBe('mountain');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
pnpm --filter @ironyard/shared test -- kit
```
Expected: FAIL — `KitSchema` doesn't exist.

- [ ] **Step 3: Implement KitSchema**

Create `packages/shared/src/data/kit.ts`:

```ts
import { z } from 'zod';

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
  // Examples: ['heavy-weapon'], ['light-armor', 'shield'].
  keywords: z.array(z.string()).default([]),
});
export type Kit = z.infer<typeof KitSchema>;

export const KitFileSchema = z.object({
  version: z.string().min(1),
  generatedAt: z.number().int().nonnegative(),
  count: z.number().int().nonnegative(),
  kits: z.array(KitSchema),
});
export type KitFile = z.infer<typeof KitFileSchema>;
```

- [ ] **Step 4: Export from `@ironyard/shared/index.ts`**

Open `packages/shared/src/index.ts` and find where the other data schemas are exported (likely near `AncestrySchema`, `ComplicationSchema`, etc.). Add:

```ts
export { KitSchema, KitFileSchema, type Kit, type KitFile } from './data/kit';
```

- [ ] **Step 5: Run tests to verify pass**

```
pnpm --filter @ironyard/shared test -- kit
pnpm typecheck
```
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/data/kit.ts packages/shared/src/index.ts packages/shared/tests/kit.spec.ts
git commit -m "$(cat <<'EOF'
feat(shared): KitSchema for Phase 2 Epic 2A

KitSchema captures kit bonuses (stamina, speed, stability, melee/ranged
damage), keywords (used by 2B's attachment fold to gate weapon/armor
treasure bonuses), and an optional signatureAbilityId reference.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.2: parse-kit + build wiring

**Files:**
- Create: `packages/data/src/parse-kit.ts`
- Create: `packages/data/tests/parse-kit.spec.ts`
- Modify: `packages/data/build.ts`

- [ ] **Step 1: Write the failing parser test**

Create `packages/data/tests/parse-kit.spec.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseKitMarkdown } from '../src/parse-kit';

const FIXTURES = join(__dirname, '../../../.reference/data-md/Rules/Kits');

function read(filename: string): string {
  return readFileSync(join(FIXTURES, filename), 'utf8');
}

describe('parseKitMarkdown', () => {
  it('parses Mountain — heavy weapon + heavy armor + Stamina +9', () => {
    const k = parseKitMarkdown(read('Mountain.md'));
    expect(k).not.toBeNull();
    expect(k!.id).toBe('mountain');
    expect(k!.name).toBe('Mountain');
    expect(k!.staminaBonus).toBe(9);
    expect(k!.stabilityBonus).toBe(2);
    expect(k!.meleeDamageBonus).toBe(4);
    expect(k!.keywords).toContain('heavy-weapon');
    expect(k!.keywords).toContain('heavy-armor');
    expect(k!.signatureAbilityId).toBe('mountain-pain-for-pain');
  });

  it('parses Cloak and Dagger — light armor + light weapon', () => {
    const k = parseKitMarkdown(read('Cloak and Dagger.md'));
    expect(k).not.toBeNull();
    expect(k!.id).toBe('cloak-and-dagger');
    expect(k!.keywords).toContain('light-armor');
  });

  it('parses Arcane Archer — bow keyword', () => {
    const k = parseKitMarkdown(read('Arcane Archer.md'));
    expect(k).not.toBeNull();
    expect(k!.keywords).toContain('bow');
  });

  it('returns null on the Kits Table.md index (not a kit)', () => {
    const k = parseKitMarkdown(read('Kits Table.md'));
    expect(k).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
pnpm --filter @ironyard/data test -- parse-kit
```
Expected: FAIL — `parseKitMarkdown` doesn't exist.

- [ ] **Step 3: Implement parse-kit**

Create `packages/data/src/parse-kit.ts`:

```ts
import matter from 'gray-matter';
import type { Kit } from '@ironyard/shared';

// Slugify a kit reference: "Pain for Pain" -> "pain-for-pain". Prefixed with
// the kit slug for global uniqueness when referenced from abilities.json.
function slugifyAbility(kitId: string, abilityName: string): string {
  const slug = abilityName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${kitId}-${slug}`;
}

// Normalize "Heavy Weapon" -> "heavy-weapon" for the keywords array.
function slugifyKeyword(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseIntSafe(s: string | undefined): number {
  if (!s) return 0;
  const n = Number.parseInt(s.replace(/[^-0-9]/g, ''), 10);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Parse one kit markdown file. Returns null for non-kit pages (e.g. the
 * Kits Table index) so the caller can skip them.
 *
 * Source shape (.reference/data-md/Rules/Kits/*.md):
 * - Frontmatter `type: kit`, `item_id`, `item_name`.
 * - `##### Equipment` section lists weapon + armor types.
 * - `##### Kit Bonuses` section has bold-bracketed numeric stats.
 * - `##### Signature Ability` section names the kit's signature ability.
 */
export function parseKitMarkdown(md: string): Kit | null {
  const { data: fm, content } = matter(md);
  if (fm.type !== 'kit') return null;
  const id = typeof fm.item_id === 'string' ? fm.item_id : null;
  const name = typeof fm.item_name === 'string' ? fm.item_name : null;
  if (!id || !name) return null;

  // Description: first paragraph after the H4 heading.
  let description = '';
  const descMatch = content.match(/####\s+[^\n]+\n+([^\n][^\n]*)/);
  if (descMatch?.[1]) description = descMatch[1].trim();

  // Equipment section gives keywords. Lines like "You wear heavy armor and
  // wield a heavy weapon." or "wear light armor and wield a bow".
  const equipMatch = content.match(/#####\s+Equipment[\s\S]*?(?=#####|$)/);
  const equipText = equipMatch ? equipMatch[0].toLowerCase() : '';
  const keywords: string[] = [];
  // Weapons: bow, crossbow, dagger, heavy weapon, light weapon, medium weapon,
  // polearm, shield, unarmed strike, whip.
  const weaponPatterns = [
    /\bbow\b/, /\bcrossbow\b/, /\bdagger\b/, /\bheavy weapon\b/,
    /\blight weapon\b/, /\bmedium weapon\b/, /\bpolearm\b/, /\bshield\b/,
    /\bunarmed strike\b/, /\bwhip\b/,
  ];
  for (const re of weaponPatterns) {
    if (re.test(equipText)) keywords.push(slugifyKeyword(re.source.replace(/\\b/g, '')));
  }
  // Armor: light/medium/heavy armor.
  for (const armor of ['light armor', 'medium armor', 'heavy armor']) {
    if (equipText.includes(armor)) keywords.push(slugifyKeyword(armor));
  }

  // Kit Bonuses section.
  const bonusesMatch = content.match(/#####\s+Kit Bonuses[\s\S]*?(?=#####|$)/);
  const bonusesText = bonusesMatch ? bonusesMatch[0] : '';
  const staminaBonus = parseIntSafe(/\*\*Stamina Bonus:\*\*\s*([+\-0-9]+)/.exec(bonusesText)?.[1]);
  const speedBonus = parseIntSafe(/\*\*Speed Bonus:\*\*\s*([+\-0-9]+)/.exec(bonusesText)?.[1]);
  const stabilityBonus = parseIntSafe(/\*\*Stability Bonus:\*\*\s*([+\-0-9]+)/.exec(bonusesText)?.[1]);
  // Melee/Ranged damage bonus is "+0/+0/+4" (per-echelon). For the prototype,
  // take the third value (highest echelon) as the structural max. 2B can
  // refine per-tier later if needed.
  const meleeMatch = /\*\*Melee Damage Bonus:\*\*\s*[+\-0-9]+\/[+\-0-9]+\/([+\-0-9]+)/.exec(bonusesText);
  const rangedMatch = /\*\*Ranged Damage Bonus:\*\*\s*[+\-0-9]+\/[+\-0-9]+\/([+\-0-9]+)/.exec(bonusesText);
  const meleeDamageBonus = parseIntSafe(meleeMatch?.[1]);
  const rangedDamageBonus = parseIntSafe(rangedMatch?.[1]);

  // Signature Ability section — extract the H6 heading right after.
  const sigMatch = content.match(/#####\s+Signature Ability[\s\S]*?######\s+([^\n]+)/);
  const signatureAbilityId = sigMatch?.[1]
    ? slugifyAbility(id, sigMatch[1].trim())
    : null;

  return {
    id,
    name,
    description,
    raw: content,
    staminaBonus,
    speedBonus,
    stabilityBonus,
    meleeDamageBonus,
    rangedDamageBonus,
    signatureAbilityId,
    keywords,
  };
}
```

- [ ] **Step 4: Run tests to verify pass**

```
pnpm --filter @ironyard/data test -- parse-kit
```
Expected: all 4 tests pass.

- [ ] **Step 5: Wire build.ts to emit kits.json**

Open `packages/data/build.ts`. Find the `KITS_OUT` constant (already exists). Add the api-side constant matching the other pairs:

```ts
const API_KITS_OUT = join(REPO_ROOT, 'apps/api/src/data/kits.json');
```

Find the section that emits the empty `kits.json` placeholder (search for "kits.json: Phase 2 Epic 2"). Replace it with real parsing:

```ts
// ── Kits ──────────────────────────────────────────────────────────────────
import { parseKitMarkdown } from './src/parse-kit';

const KITS_DIR = join(RULES_DIR, 'Kits');
const kitFiles = readdirSync(KITS_DIR).filter((f) => f.endsWith('.md'));
const kits = [];
for (const filename of kitFiles) {
  const md = readFileSync(join(KITS_DIR, filename), 'utf8');
  const k = parseKitMarkdown(md);
  if (k) kits.push(k);
}
kits.sort((a, b) => a.id.localeCompare(b.id));
const kitsFile = {
  version: '1.0',
  generatedAt: Date.now(),
  count: kits.length,
  kits,
};
mkdirSync(dirname(KITS_OUT), { recursive: true });
writeFileSync(KITS_OUT, JSON.stringify(kitsFile, null, 2));
mkdirSync(dirname(API_KITS_OUT), { recursive: true });
writeFileSync(API_KITS_OUT, JSON.stringify(kits, null, 2));  // flat array for API (matches monster pattern)
console.log(`kits.json: ${kits.length} kits written`);
```

The `import` statement should go to the top of the file alongside the other parser imports. Adapt the structure to match the existing pattern — don't introduce new conventions.

- [ ] **Step 6: Run the build, verify output**

```
pnpm --filter @ironyard/data build:data
```

Expected:
- `apps/web/public/data/kits.json` exists with 22 kits (the .md count minus the Kits Table.md index)
- `apps/api/src/data/kits.json` exists as a flat array

Verify the count:

```
jq '.count' apps/web/public/data/kits.json
```
Expected: `22`

- [ ] **Step 7: Verify wizard win — KitStep lights up**

This is a visual check, not a strict gate. Run the web dev server:

```
pnpm --filter @ironyard/web dev
```

In a browser, visit `/characters/new`. Walk to the Class step, pick a kit-using class (e.g. Censor, Fury, Tactician). Then the Kit step should now render a real picker showing 22 kits, NOT the Epic 2 placeholder.

If it still shows the placeholder: confirm `apps/web/public/data/kits.json` actually has entries (`jq '.count'`), and that the existing `KitStep.tsx` reads `useKits()`. The wizard should "just work" with no UI changes.

- [ ] **Step 8: Commit**

```bash
git add packages/data/src/parse-kit.ts packages/data/build.ts packages/data/tests/parse-kit.spec.ts apps/api/src/data/kits.json
git commit -m "$(cat <<'EOF'
feat(data): parse-kit + kits.json populated (Slice 1 of Epic 2A)

22 kits parsed from .reference/data-md/Rules/Kits. Each kit carries id,
name, description, raw body, numeric bonuses (stamina/speed/stability/
melee/ranged), keywords from the Equipment section, and a signatureAbilityId
reference (resolved to an abilities.json entry by Slice 3).

Lights up the wizard's KitStep: empty placeholder → real 22-kit picker
with zero UI changes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Slice 2: Items

### Task 2.1: ItemSchema (discriminated union)

**Files:**
- Create: `packages/shared/src/data/item.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/tests/item.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/tests/item.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ItemSchema, ItemFileSchema } from '../src/data/item';

describe('ItemSchema', () => {
  it('parses an artifact', () => {
    const i = ItemSchema.parse({
      category: 'artifact',
      id: 'crown-of-tor',
      name: 'Crown of Tor',
    });
    expect(i.category).toBe('artifact');
    expect(i.id).toBe('crown-of-tor');
  });

  it('parses a consumable with echelon and effectKind', () => {
    const i = ItemSchema.parse({
      category: 'consumable',
      id: 'healing-potion',
      name: 'Healing Potion',
      echelon: 1,
      effectKind: 'instant',
    });
    if (i.category !== 'consumable') throw new Error('narrowing failed');
    expect(i.echelon).toBe(1);
    expect(i.effectKind).toBe('instant');
  });

  it('parses a leveled treasure with kitKeyword', () => {
    const i = ItemSchema.parse({
      category: 'leveled-treasure',
      id: 'flaming-sword',
      name: 'Flaming Sword',
      echelon: 2,
      kitKeyword: 'medium-weapon',
    });
    if (i.category !== 'leveled-treasure') throw new Error('narrowing failed');
    expect(i.echelon).toBe(2);
    expect(i.kitKeyword).toBe('medium-weapon');
  });

  it('parses a trinket with bodySlot', () => {
    const i = ItemSchema.parse({
      category: 'trinket',
      id: 'mask-of-oversight',
      name: 'Mask of Oversight',
      bodySlot: 'head',
    });
    if (i.category !== 'trinket') throw new Error('narrowing failed');
    expect(i.bodySlot).toBe('head');
  });

  it('rejects an unknown category', () => {
    expect(() =>
      ItemSchema.parse({ category: 'mystery', id: 'x', name: 'y' }),
    ).toThrow();
  });
});

describe('ItemFileSchema', () => {
  it('parses an envelope with items array', () => {
    const f = ItemFileSchema.parse({
      version: '1.0',
      generatedAt: 0,
      count: 1,
      items: [{ category: 'artifact', id: 'x', name: 'X' }],
    });
    expect(f.count).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
pnpm --filter @ironyard/shared test -- item
```
Expected: FAIL.

- [ ] **Step 3: Implement ItemSchema**

Create `packages/shared/src/data/item.ts`:

```ts
import { z } from 'zod';

const ItemBase = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),
  raw: z.string().default(''),
});

const ArtifactSchema = ItemBase.extend({
  category: z.literal('artifact'),
});
export type Artifact = z.infer<typeof ArtifactSchema>;

const ConsumableSchema = ItemBase.extend({
  category: z.literal('consumable'),
  echelon: z.number().int().min(1).max(4).optional(),
  effectKind: z
    .enum(['instant', 'duration', 'two-phase', 'attack', 'area', 'unknown'])
    .default('unknown'),
});
export type Consumable = z.infer<typeof ConsumableSchema>;

const LeveledTreasureSchema = ItemBase.extend({
  category: z.literal('leveled-treasure'),
  echelon: z.number().int().min(1).max(4),
  kitKeyword: z.string().nullable().default(null),
});
export type LeveledTreasure = z.infer<typeof LeveledTreasureSchema>;

const TrinketSchema = ItemBase.extend({
  category: z.literal('trinket'),
  bodySlot: z
    .enum(['arms', 'feet', 'hands', 'head', 'neck', 'waist', 'ring'])
    .nullable()
    .default(null),
});
export type Trinket = z.infer<typeof TrinketSchema>;

export const ItemSchema = z.discriminatedUnion('category', [
  ArtifactSchema,
  ConsumableSchema,
  LeveledTreasureSchema,
  TrinketSchema,
]);
export type Item = z.infer<typeof ItemSchema>;

export const ItemFileSchema = z.object({
  version: z.string().min(1),
  generatedAt: z.number().int().nonnegative(),
  count: z.number().int().nonnegative(),
  items: z.array(ItemSchema),
});
export type ItemFile = z.infer<typeof ItemFileSchema>;
```

- [ ] **Step 4: Export from `@ironyard/shared/index.ts`**

```ts
export {
  ItemSchema,
  ItemFileSchema,
  type Item,
  type ItemFile,
  type Artifact,
  type Consumable,
  type LeveledTreasure,
  type Trinket,
} from './data/item';
```

- [ ] **Step 5: Run tests + typecheck**

```
pnpm --filter @ironyard/shared test -- item
pnpm typecheck
```
Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/data/item.ts packages/shared/src/index.ts packages/shared/tests/item.spec.ts
git commit -m "$(cat <<'EOF'
feat(shared): ItemSchema — discriminated union by category

Four item categories with distinct fields: artifact, consumable
(echelon, effectKind), leveled-treasure (echelon, kitKeyword),
trinket (bodySlot). TypeScript narrowing on category matches how 2B/2C
will branch.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.2: parse-item + build wiring

**Files:**
- Create: `packages/data/src/parse-item.ts`
- Create: `packages/data/tests/parse-item.spec.ts`
- Modify: `packages/data/build.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/data/tests/parse-item.spec.ts`:

```ts
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseItemMarkdown } from '../src/parse-item';

const TREASURES = join(__dirname, '../../../.reference/data-md/Rules/Treasures');

function read(category: string, filename: string): string {
  return readFileSync(join(TREASURES, category, filename), 'utf8');
}

function firstFile(category: string): string {
  const dir = join(TREASURES, category);
  const subdirs = readdirSync(dir).filter((d) => !d.endsWith('.md'));
  if (subdirs.length > 0) {
    const sub = join(dir, subdirs[0]!);
    const f = readdirSync(sub).find((x) => x.endsWith('.md'));
    if (!f) throw new Error(`no md in ${sub}`);
    return readFileSync(join(sub, f), 'utf8');
  }
  const f = readdirSync(dir).find((x) => x.endsWith('.md') && !x.startsWith('_'));
  if (!f) throw new Error(`no md in ${dir}`);
  return readFileSync(join(dir, f), 'utf8');
}

describe('parseItemMarkdown', () => {
  it('parses an artifact', () => {
    const i = parseItemMarkdown(firstFile('Artifacts'));
    expect(i?.category).toBe('artifact');
    expect(i?.id.length).toBeGreaterThan(0);
    expect(i?.name.length).toBeGreaterThan(0);
  });

  it('parses a consumable with echelon', () => {
    const i = parseItemMarkdown(firstFile('Consumables'));
    expect(i?.category).toBe('consumable');
    if (i?.category !== 'consumable') throw new Error('narrowing failed');
    expect(i.echelon).toBeGreaterThanOrEqual(1);
  });

  it('parses a leveled treasure with echelon', () => {
    const i = parseItemMarkdown(firstFile('Leveled Treasures'));
    expect(i?.category).toBe('leveled-treasure');
    if (i?.category !== 'leveled-treasure') throw new Error('narrowing failed');
    expect(i.echelon).toBeGreaterThanOrEqual(1);
  });

  it('parses a trinket and extracts bodySlot from Keywords', () => {
    // Mask of Oversight has "Keywords: Head, Magic" — bodySlot should be 'head'.
    const md = read('Trinkets/3rd Echelon Trinkets', 'Mask of Oversight.md');
    const i = parseItemMarkdown(md);
    expect(i?.category).toBe('trinket');
    if (i?.category !== 'trinket') throw new Error('narrowing failed');
    expect(i.bodySlot).toBe('head');
  });

  it('returns null on _Index.md', () => {
    const idxPath = readdirSync(join(TREASURES, 'Trinkets'))
      .filter((d) => !d.endsWith('.md'))
      .map((d) => join(TREASURES, 'Trinkets', d))
      .flatMap((sub) => readdirSync(sub).filter((f) => f.startsWith('_')).map((f) => join(sub, f)));
    if (idxPath.length === 0) return; // no index files; skip
    const i = parseItemMarkdown(readFileSync(idxPath[0]!, 'utf8'));
    expect(i).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
pnpm --filter @ironyard/data test -- parse-item
```
Expected: FAIL.

- [ ] **Step 3: Implement parse-item**

Create `packages/data/src/parse-item.ts`:

```ts
import matter from 'gray-matter';
import type { Item } from '@ironyard/shared';

const BODY_SLOTS = ['arms', 'feet', 'hands', 'head', 'neck', 'waist', 'ring'] as const;
type BodySlot = (typeof BODY_SLOTS)[number];

function parseEchelon(s: unknown): number | null {
  if (typeof s !== 'string') return null;
  const m = /^(\d)/.exec(s);
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 10);
  return Number.isInteger(n) && n >= 1 && n <= 4 ? n : null;
}

// Pulls the first paragraph after the heading as the description.
function firstParagraph(content: string): string {
  // Skip the H5 (##### Name) and the italic flavor line, then take the first
  // non-empty paragraph that doesn't start with **.
  const lines = content.split('\n');
  let inBody = false;
  const para: string[] = [];
  for (const line of lines) {
    if (!inBody) {
      if (/^#####\s+/.test(line)) inBody = true;
      continue;
    }
    if (line.trim() === '' && para.length === 0) continue;
    if (line.trim() === '') break;
    if (line.startsWith('**')) continue; // skip bold keyword lines like **Keywords:**
    if (line.startsWith('*') && line.endsWith('*')) {
      para.push(line.replace(/^\*|\*$/g, '').trim());
      break;
    }
    para.push(line.trim());
  }
  return para.join(' ').trim();
}

// "Head, Magic" -> 'head'. First matching slot keyword wins.
function parseBodySlot(content: string): BodySlot | null {
  const m = /\*\*Keywords:\*\*\s+([^\n]+)/i.exec(content);
  if (!m) return null;
  const kws = m[1]!.toLowerCase();
  for (const slot of BODY_SLOTS) {
    if (kws.includes(slot)) return slot;
  }
  return null;
}

// "weapons of the Bow keyword" -> 'bow'. Best-effort.
function parseKitKeyword(content: string): string | null {
  const m = /(?:weapons?|armors?)\s+of\s+the\s+(\w[\w\s]*?)\s+keyword/i.exec(content);
  if (!m) return null;
  return m[1]!.trim().toLowerCase().replace(/\s+/g, '-');
}

// Best-effort effectKind for consumables. Falls back to 'unknown'.
function parseEffectKind(content: string): Item['category'] extends 'consumable'
  ? 'instant' | 'duration' | 'two-phase' | 'attack' | 'area' | 'unknown'
  : never;
function parseEffectKind(content: string): string {
  const lower = content.toLowerCase();
  if (/lasts?\s+\d+\s+rounds?/.test(lower)) return 'duration';
  if (/area effect|burst|line|cube/.test(lower)) return 'area';
  if (/power roll|target one creature|throw/.test(lower)) return 'attack';
  if (/drink it twice|two doses?|first dose|second dose/.test(lower)) return 'two-phase';
  if (/regain|restore|heal/.test(lower)) return 'instant';
  return 'unknown';
}

export function parseItemMarkdown(md: string): Item | null {
  const { data: fm, content } = matter(md);
  const typeStr = typeof fm.type === 'string' ? fm.type : '';
  if (!typeStr.startsWith('treasure/')) return null;
  const id = typeof fm.item_id === 'string' ? fm.item_id : null;
  const name = typeof fm.item_name === 'string' ? fm.item_name : null;
  if (!id || !name) return null;

  const description = firstParagraph(content);
  const raw = content;
  const echelon = parseEchelon(fm.echelon);

  // Discriminate by type prefix in frontmatter (e.g. treasure/trinkets/3rd-echelon).
  const treasureType = typeStr.split('/')[1] ?? '';

  if (treasureType === 'artifact' || treasureType === 'artifacts') {
    return { category: 'artifact', id, name, description, raw };
  }
  if (treasureType === 'consumable' || treasureType === 'consumables') {
    return {
      category: 'consumable',
      id,
      name,
      description,
      raw,
      echelon: echelon ?? undefined,
      effectKind: parseEffectKind(content) as
        | 'instant' | 'duration' | 'two-phase' | 'attack' | 'area' | 'unknown',
    };
  }
  if (treasureType === 'leveled' || treasureType === 'leveled-treasure' || treasureType.startsWith('leveled')) {
    if (echelon === null) return null; // leveled requires echelon
    return {
      category: 'leveled-treasure',
      id,
      name,
      description,
      raw,
      echelon,
      kitKeyword: parseKitKeyword(content),
    };
  }
  if (treasureType === 'trinkets' || treasureType === 'trinket') {
    return {
      category: 'trinket',
      id,
      name,
      description,
      raw,
      bodySlot: parseBodySlot(content),
    };
  }
  return null;
}
```

If the `treasureType` discriminator from the file frontmatter uses slightly different strings (e.g. `treasure/leveled-treasures/3rd-echelon`), inspect a sample frontmatter and adjust the string-matching branches accordingly. The principle: a `type:` prefix starting with `treasure/` is required; specific category routing is from whatever the actual second segment is.

- [ ] **Step 4: Run tests to verify pass**

```
pnpm --filter @ironyard/data test -- parse-item
```
Expected: 5 tests pass.

- [ ] **Step 5: Wire build.ts to emit items.json**

Add to `packages/data/build.ts`:

```ts
import { parseItemMarkdown } from './src/parse-item';

const ITEMS_OUT = join(REPO_ROOT, 'apps/web/public/data/items.json');
const API_ITEMS_OUT = join(REPO_ROOT, 'apps/api/src/data/items.json');
const TREASURES_DIR = join(RULES_DIR, 'Treasures');

// Walk all treasure subdirectories recursively (Artifacts, Consumables,
// Leveled Treasures, Trinkets — each with per-echelon subfolders).
function walkMd(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walkMd(p));
    else if (entry.endsWith('.md') && !entry.startsWith('_')) out.push(p);
  }
  return out;
}

const itemFiles = walkMd(TREASURES_DIR);
const items = [];
for (const path of itemFiles) {
  const md = readFileSync(path, 'utf8');
  const it = parseItemMarkdown(md);
  if (it) items.push(it);
}
items.sort((a, b) => a.id.localeCompare(b.id));
const itemsFile = {
  version: '1.0',
  generatedAt: Date.now(),
  count: items.length,
  items,
};
mkdirSync(dirname(ITEMS_OUT), { recursive: true });
writeFileSync(ITEMS_OUT, JSON.stringify(itemsFile, null, 2));
mkdirSync(dirname(API_ITEMS_OUT), { recursive: true });
writeFileSync(API_ITEMS_OUT, JSON.stringify(items, null, 2));
console.log(`items.json: ${items.length} items written`);
```

If `walkMd` already exists (the monsters parser may use a similar recursive walker), reuse it.

- [ ] **Step 6: Run build, verify counts**

```
pnpm --filter @ironyard/data build:data
jq '.count' apps/web/public/data/items.json
```
Expected: count ~98 (3 artifacts + 35 consumables + 35 leveled + 25 trinkets = 98). If a few entries fail to parse, the count will be slightly under — investigate failures.

Spot check by category:

```
jq '[.items[] | select(.category=="trinket")] | length' apps/web/public/data/items.json
jq '[.items[] | select(.category=="consumable")] | length' apps/web/public/data/items.json
jq '[.items[] | select(.category=="leveled-treasure")] | length' apps/web/public/data/items.json
jq '[.items[] | select(.category=="artifact")] | length' apps/web/public/data/items.json
```
Expected: 25, 35, 35, 3 respectively (or very close).

- [ ] **Step 7: Commit**

```bash
git add packages/data/src/parse-item.ts packages/data/build.ts packages/data/tests/parse-item.spec.ts apps/api/src/data/items.json
git commit -m "$(cat <<'EOF'
feat(data): parse-item + items.json populated (Slice 2 of Epic 2A)

~98 items parsed across 4 categories from .reference/data-md/Rules/Treasures.
Discriminated union by category (artifact/consumable/leveled-treasure/
trinket). Body-slot regex-parsed from trinket Keywords lines, kitKeyword
regex-parsed from leveled-treasure prose, effectKind heuristically
classified from consumable body. Effect text stays raw for 2B/2C.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Slice 3: Abilities

### Task 3.1: Extract AbilitySchema + add PC fields

**Files:**
- Create: `packages/shared/src/data/ability.ts`
- Modify: `packages/shared/src/data/monster.ts` (re-export)
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/tests/ability.spec.ts`

- [ ] **Step 1: Read existing AbilitySchema location**

Open `packages/shared/src/data/monster.ts`. Find the existing `AbilitySchema = z.object({...})` block. Note all the existing fields (name, type, keywords, distance, target, powerRoll, raw, etc.) — these stay verbatim.

Note `PowerRollSchema` and any other schemas `AbilitySchema` depends on. Those stay in `monster.ts` for now (don't unnecessarily reshuffle).

- [ ] **Step 2: Write the failing test**

Create `packages/shared/tests/ability.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { AbilitySchema, AbilityFileSchema } from '../src/data/ability';

describe('AbilitySchema — PC extensions', () => {
  it('still parses a monster ability (no PC fields)', () => {
    const a = AbilitySchema.parse({
      name: 'Goblin Stab',
      type: 'action',
      keywords: ['Strike'],
      distance: 'Melee 1',
      target: 'One creature',
      raw: 'Goblin Stab\n\nPower Roll +0\n- ≤11: 2 damage',
    });
    expect(a.name).toBe('Goblin Stab');
    // PC fields default to null/false:
    expect(a.cost).toBeNull();
    expect(a.tier).toBeNull();
    expect(a.isSubclass).toBe(false);
    expect(a.sourceClassId).toBeNull();
  });

  it('parses a PC ability with cost, tier, isSubclass, sourceClassId', () => {
    const a = AbilitySchema.parse({
      name: 'Whirlwind',
      type: 'action',
      keywords: ['Strike', 'Magic'],
      distance: 'Melee 1',
      target: 'Each enemy adjacent',
      raw: '...',
      cost: 5,
      tier: 1,
      isSubclass: false,
      sourceClassId: 'fury',
    });
    expect(a.cost).toBe(5);
    expect(a.sourceClassId).toBe('fury');
  });
});

describe('AbilityFileSchema', () => {
  it('parses an envelope with abilities array', () => {
    const f = AbilityFileSchema.parse({
      version: '1.0',
      generatedAt: 0,
      count: 1,
      abilities: [{ name: 'Stab', type: 'action', distance: '', target: '', raw: '' }],
    });
    expect(f.count).toBe(1);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```
pnpm --filter @ironyard/shared test -- ability
```
Expected: FAIL.

- [ ] **Step 4: Create ability.ts with the extracted schema**

Create `packages/shared/src/data/ability.ts`. Copy the existing `AbilitySchema` definition from `monster.ts` verbatim, then extend it with the PC optional fields:

```ts
import { z } from 'zod';
// Re-export the existing PowerRollSchema and any other dependencies from
// monster.ts. If they're not exported, export them from monster.ts in a
// separate edit step before importing here.
import { PowerRollSchema, /* whatever else AbilitySchema depended on */ } from './monster';

export const AbilitySchema = z.object({
  // ── Existing fields (copy verbatim from monster.ts) ──────────────────────
  name: z.string().min(1),
  type: z.string().default(''),
  keywords: z.array(z.string()).default([]),
  distance: z.string().default(''),
  target: z.string().default(''),
  powerRoll: PowerRollSchema.optional(),
  raw: z.string().default(''),
  // ... include every field that was in the original AbilitySchema ...

  // ── PC extensions (new) ──────────────────────────────────────────────────
  cost: z.number().int().min(0).nullable().default(null),
  tier: z.number().int().min(1).max(10).nullable().default(null),
  isSubclass: z.boolean().default(false),
  sourceClassId: z.string().nullable().default(null),
});
export type Ability = z.infer<typeof AbilitySchema>;

export const AbilityFileSchema = z.object({
  version: z.string().min(1),
  generatedAt: z.number().int().nonnegative(),
  count: z.number().int().nonnegative(),
  abilities: z.array(AbilitySchema),
});
export type AbilityFile = z.infer<typeof AbilityFileSchema>;
```

**Critical:** copy the existing `AbilitySchema` field list **exactly**. If a monster ability test asserts e.g. `a.effect` exists, that field must be preserved. The new file is the canonical home; `monster.ts` will re-export.

- [ ] **Step 5: Update monster.ts to re-export from ability.ts**

Open `packages/shared/src/data/monster.ts`. Remove the inline `AbilitySchema = z.object({...})` block. Replace with:

```ts
export { AbilitySchema, type Ability } from './ability';
```

Keep `PowerRollSchema` (and other helpers) defined in `monster.ts` — they're imported by `ability.ts` already.

If `MonsterSchema` referenced `AbilitySchema` directly (e.g. `abilities: z.array(AbilitySchema)`), the import for the schema needs to update — the existing `import` line at the top of `monster.ts` should now import `AbilitySchema` from `./ability` rather than expect it inline. Re-check that `MonsterSchema` still resolves.

- [ ] **Step 6: Export from `@ironyard/shared/index.ts`**

```ts
export {
  AbilitySchema,
  AbilityFileSchema,
  type Ability,
  type AbilityFile,
} from './data/ability';
```

If `AbilitySchema` was already exported from index.ts via `./data/monster`, keep that line for back-compat (it'll resolve to the same schema) OR remove it and rely on the new export — either is fine since the resulting type is identical.

- [ ] **Step 7: Verify tests pass + nothing regressed**

```
pnpm --filter @ironyard/shared test
pnpm --filter @ironyard/data test
pnpm --filter @ironyard/rules test
pnpm typecheck
```

All should pass. The existing monster tests (`packages/shared/tests/monster.spec.ts` or wherever they live) must keep passing — that's the regression gate.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/data/ability.ts packages/shared/src/data/monster.ts packages/shared/src/index.ts packages/shared/tests/ability.spec.ts
git commit -m "$(cat <<'EOF'
refactor(shared): extract AbilitySchema; extend with PC optional fields

Moves AbilitySchema from monster.ts into its own ability.ts. monster.ts
re-exports for backward compatibility — existing imports keep working.
Adds optional PC fields: cost (0=signature, 3/5/7/9 heroic resource),
tier (level available), isSubclass, sourceClassId.

Enables PC ability ingest in the next slice without disrupting monster
ability parsing.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3.2: parse-ability + build wiring + abilities.json

**Files:**
- Create: `packages/data/src/parse-ability.ts`
- Create: `packages/data/tests/parse-ability.spec.ts`
- Modify: `packages/data/build.ts`

- [ ] **Step 1: Inspect parse-monster-ability to find reusable internals**

Open `packages/data/src/parse-monster.ts` and find where it parses an ability (search for `parseMonsterAbility` or `parsePowerRoll` or similar). Note the function signatures of any helpers that take a markdown body and return an Ability-shape (or partial fields like `powerRoll`).

The plan is to call those same helpers from `parse-ability.ts`. If they're not exported, export them — they become shared parser primitives.

- [ ] **Step 2: Write the failing test**

Create `packages/data/tests/parse-ability.spec.ts`:

```ts
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAbilityMarkdown } from '../src/parse-ability';

const ABILITIES = join(__dirname, '../../../.reference/data-md/Rules/Abilities');

function findAbility(classFolder: string, namePattern: string): string {
  function search(dir: string): string | null {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      const st = statSync(p);
      if (st.isDirectory()) {
        const f = search(p);
        if (f) return f;
      } else if (entry.endsWith('.md') && entry.includes(namePattern)) {
        return p;
      }
    }
    return null;
  }
  const path = search(join(ABILITIES, classFolder));
  if (!path) throw new Error(`no ${namePattern} in ${classFolder}`);
  return readFileSync(path, 'utf8');
}

describe('parseAbilityMarkdown', () => {
  it('parses a Fury signature ability — cost 0, sourceClassId fury', () => {
    // Find a signature ability — frontmatter cost_amount: 0 OR filename has "Signature".
    // For the prototype, "Signature - ..." filename is the canonical marker.
    const md = findAbility('Fury', 'Signature');
    const a = parseAbilityMarkdown(md);
    expect(a).not.toBeNull();
    expect(a!.cost).toBe(0);
    expect(a!.sourceClassId).toBe('fury');
  });

  it('parses an 11-Ferocity ability — cost 11, sourceClassId fury', () => {
    const md = findAbility('Fury', 'Primordial Rage');  // "11 Ferocity" in name
    const a = parseAbilityMarkdown(md);
    expect(a).not.toBeNull();
    expect(a!.cost).toBe(11);
    expect(a!.sourceClassId).toBe('fury');
  });

  it('parses a Common ability — sourceClassId common', () => {
    const dir = join(ABILITIES, 'Common');
    const file = readdirSync(dir).find((f) => f.endsWith('.md'));
    if (!file) throw new Error('no common abilities');
    const a = parseAbilityMarkdown(readFileSync(join(dir, file), 'utf8'));
    expect(a).not.toBeNull();
    expect(a!.sourceClassId).toBe('common');
  });

  it('parses a Kit ability — sourceClassId kits', () => {
    const dir = join(ABILITIES, 'Kits');
    const subdirs = readdirSync(dir).filter((d) => !d.endsWith('.md'));
    if (subdirs.length === 0) return; // no kit abilities in source
    const sub = join(dir, subdirs[0]!);
    const file = readdirSync(sub).find((f) => f.endsWith('.md'));
    if (!file) return;
    const a = parseAbilityMarkdown(readFileSync(join(sub, file), 'utf8'));
    expect(a).not.toBeNull();
    expect(a!.sourceClassId).toBe('kits');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```
pnpm --filter @ironyard/data test -- parse-ability
```
Expected: FAIL.

- [ ] **Step 4: Implement parse-ability**

Create `packages/data/src/parse-ability.ts`:

```ts
import matter from 'gray-matter';
import type { Ability } from '@ironyard/shared';
// Import the existing parser primitives from parse-monster. If they're not
// exported, export them — they're shared parser internals now.
import { parsePowerRoll } from './parse-monster';

function parseCost(fm: Record<string, unknown>): number | null {
  // Frontmatter has `cost_amount: 11` for "11 Ferocity" abilities.
  if (typeof fm.cost_amount === 'number') return fm.cost_amount;
  // "Signature" abilities have no cost — return 0.
  if (typeof fm.cost === 'string' && fm.cost.toLowerCase().includes('signature')) return 0;
  // Some signature abilities don't even have a `cost` field — derive from
  // filename / feature_type.
  if (typeof fm.feature_type === 'string' && fm.feature_type.toLowerCase().includes('signature')) {
    return 0;
  }
  return null;
}

function parseTier(fm: Record<string, unknown>): number | null {
  // Frontmatter usually has `level: 8`.
  if (typeof fm.level === 'number') return fm.level;
  return null;
}

function parseSourceClassId(fm: Record<string, unknown>, filePath: string): string | null {
  if (typeof fm.class === 'string') return fm.class.toLowerCase();
  // Fallback: top-level folder under Abilities/
  const m = /\/Abilities\/([^/]+)\//.exec(filePath);
  if (m && m[1]) return m[1].toLowerCase();
  return null;
}

/**
 * Parse one PC ability markdown file. `filePath` is used for fallback
 * sourceClassId inference and for the isSubclass flag (subclass abilities
 * live in a deeper folder like Abilities/Fury/Berserker/).
 */
export function parseAbilityMarkdown(md: string, filePath = ''): Ability | null {
  const { data: fm, content } = matter(md);
  // Must be a feature/ability/* type
  const typeStr = typeof fm.type === 'string' ? fm.type : '';
  if (!typeStr.startsWith('feature/ability/')) return null;
  const name = typeof fm.item_name === 'string'
    ? fm.item_name
    : typeof fm.file_basename === 'string'
      ? fm.file_basename
      : null;
  if (!name) return null;

  const cost = parseCost(fm);
  const tier = parseTier(fm);
  const sourceClassId = parseSourceClassId(fm, filePath);

  // isSubclass: depth-of-folders heuristic. Abilities/Fury/Some-Aspect/... is
  // a subclass-pool ability.
  let isSubclass = false;
  const folderM = /\/Abilities\/[^/]+\/([^/]+)\//.exec(filePath);
  if (folderM && folderM[1] && !/Features?$/.test(folderM[1])) {
    isSubclass = true;
  }

  // Distance, target, keywords from frontmatter (the source has these
  // structurally).
  const distance = typeof fm.distance === 'string' ? fm.distance : '';
  const target = typeof fm.target === 'string' ? fm.target : '';
  const keywords = Array.isArray(fm.keywords) ? fm.keywords.filter((k): k is string => typeof k === 'string') : [];

  // Power roll from body. Falls back to undefined if not parseable.
  const powerRoll = parsePowerRoll(content) ?? undefined;

  return {
    name,
    type: typeof fm.action_type === 'string' ? fm.action_type.toLowerCase() : '',
    keywords,
    distance,
    target,
    powerRoll,
    raw: content,
    cost,
    tier,
    isSubclass,
    sourceClassId,
  };
}
```

If `parsePowerRoll` isn't exported from `parse-monster`, open that file and add `export` to its declaration. Verify by re-running the monster tests — they should still pass since you only added the keyword.

- [ ] **Step 5: Run tests to verify pass**

```
pnpm --filter @ironyard/data test -- parse-ability
```
Expected: 4 tests pass.

- [ ] **Step 6: Wire build.ts to emit abilities.json**

Add to `packages/data/build.ts`:

```ts
import { parseAbilityMarkdown } from './src/parse-ability';

const ABILITIES_OUT = join(REPO_ROOT, 'apps/web/public/data/abilities.json');
const API_ABILITIES_OUT = join(REPO_ROOT, 'apps/api/src/data/abilities.json');
const ABILITIES_DIR = join(RULES_DIR, 'Abilities');

// Reuses walkMd from Slice 2 (or define if not yet present).
const abilityFiles = walkMd(ABILITIES_DIR);
const abilities = [];
const abilityFailures: string[] = [];
for (const path of abilityFiles) {
  const md = readFileSync(path, 'utf8');
  const a = parseAbilityMarkdown(md, path);
  if (a) abilities.push(a);
  else abilityFailures.push(path);
}
abilities.sort((a, b) =>
  (a.sourceClassId ?? '').localeCompare(b.sourceClassId ?? '') ||
  a.name.localeCompare(b.name),
);
const abilitiesFile = {
  version: '1.0',
  generatedAt: Date.now(),
  count: abilities.length,
  abilities,
};
mkdirSync(dirname(ABILITIES_OUT), { recursive: true });
writeFileSync(ABILITIES_OUT, JSON.stringify(abilitiesFile, null, 2));
mkdirSync(dirname(API_ABILITIES_OUT), { recursive: true });
writeFileSync(API_ABILITIES_OUT, JSON.stringify(abilities, null, 2));
console.log(`abilities.json: ${abilities.length} abilities written, ${abilityFailures.length} failed`);
if (abilityFailures.length > 0) {
  console.log(`  failures:\n${abilityFailures.slice(0, 10).map((p) => `    ${p}`).join('\n')}`);
}

const structuredPct =
  (abilities.filter((a) => a.powerRoll).length / Math.max(1, abilities.length)) * 100;
console.log(`abilities with structured powerRoll: ${structuredPct.toFixed(1)}%`);
```

- [ ] **Step 7: Run build, verify counts + structured coverage**

```
pnpm --filter @ironyard/data build:data
jq '.count' apps/web/public/data/abilities.json
```

Expected: count ≈ 545 (the source markdown count; small attrition is OK if a few files are non-ability stubs).

The console output should report structured powerRoll coverage. Target ≥80%. If it's significantly below that, log the failing-to-parse files (the build output lists up to 10) and tune the power-roll regex in parse-monster. Below 50% is a parser bug; investigate.

Spot check the file:

```
jq '[.abilities[] | select(.sourceClassId=="fury")] | length' apps/web/public/data/abilities.json
jq '[.abilities[] | select(.cost==0)] | length' apps/web/public/data/abilities.json
```
Expected: Fury count > 0, signature count > 0.

- [ ] **Step 8: Commit**

```bash
git add packages/data/src/parse-ability.ts packages/data/build.ts packages/data/tests/parse-ability.spec.ts apps/api/src/data/abilities.json
git commit -m "$(cat <<'EOF'
feat(data): parse-ability + abilities.json populated (Slice 3 of Epic 2A)

~545 PC abilities parsed from .reference/data-md/Rules/Abilities. Reuses
parse-monster's parsePowerRoll for the tier ladder; frontmatter supplies
cost / level / class / distance / target / keywords structurally.
sourceClassId is from the top-level folder; isSubclass is inferred from
deeper nesting.

Build logs structured-powerRoll coverage percentage so coverage can be
tracked across runs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3.3 (potential freebie): PlayerSheetPanel ability cards

Slice 3 ships PC ability data with the same shape monsters use. If `AbilityCard` can already accept a PC ability (it should, since they share `AbilitySchema`), `PlayerSheetPanel`'s id-list can flip to interactive cards.

- [ ] **Step 1: Read PlayerSheetPanel's current ability rendering**

Open `apps/web/src/pages/combat/PlayerSheetPanel.tsx`. Find the `Abilities` sub-component. It currently renders runtime.abilityIds as plain text `<li>` items.

- [ ] **Step 2: Build a useAbilities static-data hook (if not present)**

Open `apps/web/src/api/static-data.ts`. Add (alongside `useMonsters`, `useAncestries`, etc.):

```ts
import { AbilityFileSchema } from '@ironyard/shared';

export function useAbilities() {
  return useQuery({
    queryKey: ['data', 'abilities'],
    queryFn: () => fetchData('abilities.json', AbilityFileSchema),
    ...STATIC,
  });
}
```

(`fetchData` and `STATIC` are already defined in the file.)

Then add abilities to `WizardStaticData` and `useWizardStaticData()` — but actually no, the wizard already has `staticData.classes`; it doesn't need abilities. Keep `useAbilities` standalone for use by the panel.

- [ ] **Step 3: Switch the Abilities sub-component to render cards**

In `PlayerSheetPanel.tsx`'s `Abilities` sub-component:

```tsx
import { useAbilities } from '../../api/static-data';

function Abilities({ participant, campaignId, userId }: {
  participant: Participant; campaignId: string; userId: string;
}) {
  const abs = useAbilities();
  if (!abs.data) return null;
  const byName = new Map(abs.data.abilities.map((a) => [a.name.toLowerCase(), a]));
  // Map ability ids (or names — the existing runtime.abilityIds is string[])
  // to ability data. If the lookup fails, fall back to the id as plain text.
  // ... compose the list and render AbilityCard per match ...
}
```

This is intentionally sketched, not finalized — the exact lookup depends on what `runtime.abilityIds` actually carries (ids vs names) and what `AbilityCard` accepts. If the wiring is non-trivial (more than 30 lines, or it breaks tests), STOP and defer to Epic 2B. Report DONE_WITH_CONCERNS noting that the freebie was attempted but punted.

- [ ] **Step 4: Verify in browser**

Dev: log in as a player with a materialized PC. Confirm ability cards render and clicking dispatches `RollPower`.

- [ ] **Step 5: Commit OR skip**

If it worked:

```bash
git add apps/web/src/api/static-data.ts apps/web/src/pages/combat/PlayerSheetPanel.tsx
git commit -m "$(cat <<'EOF'
feat(web): PlayerSheetPanel switches to interactive ability cards

useAbilities static-data hook + AbilityCard rendering of the player's
ability list, replacing the id-only placeholder list. Picks up the
PC ability data from Slice 3.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

If it didn't work cleanly: skip. Note in the slice-completion report that this freebie was attempted but moved to 2B.

---

## Slice 4: Titles + Inventory + Overrides

### Task 4.1: TitleSchema

**Files:**
- Create: `packages/shared/src/data/title.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/tests/title.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/tests/title.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { TitleSchema, TitleFileSchema } from '../src/data/title';

describe('TitleSchema', () => {
  it('parses a title with echelon', () => {
    const t = TitleSchema.parse({
      id: 'knight',
      name: 'Knight',
      echelon: 2,
    });
    expect(t.id).toBe('knight');
    expect(t.echelon).toBe(2);
    expect(t.grantsAbilityId).toBeNull(); // default
  });

  it('accepts grantsAbilityId', () => {
    const t = TitleSchema.parse({
      id: 'knight',
      name: 'Knight',
      echelon: 2,
      grantsAbilityId: 'knightly-challenge',
    });
    expect(t.grantsAbilityId).toBe('knightly-challenge');
  });

  it('rejects echelon outside 1-4', () => {
    expect(() =>
      TitleSchema.parse({ id: 'x', name: 'X', echelon: 5 }),
    ).toThrow();
  });
});

describe('TitleFileSchema', () => {
  it('parses an envelope', () => {
    const f = TitleFileSchema.parse({
      version: '1.0',
      generatedAt: 0,
      count: 1,
      titles: [{ id: 'knight', name: 'Knight', echelon: 2 }],
    });
    expect(f.count).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
pnpm --filter @ironyard/shared test -- title
```
Expected: FAIL.

- [ ] **Step 3: Implement TitleSchema**

Create `packages/shared/src/data/title.ts`:

```ts
import { z } from 'zod';

export const TitleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  echelon: z.number().int().min(1).max(4),
  description: z.string().default(''),
  raw: z.string().default(''),
  // 2B reads this to fold the title's ability into the character's runtime.
  grantsAbilityId: z.string().nullable().default(null),
});
export type Title = z.infer<typeof TitleSchema>;

export const TitleFileSchema = z.object({
  version: z.string().min(1),
  generatedAt: z.number().int().nonnegative(),
  count: z.number().int().nonnegative(),
  titles: z.array(TitleSchema),
});
export type TitleFile = z.infer<typeof TitleFileSchema>;
```

- [ ] **Step 4: Export + verify**

Add to `packages/shared/src/index.ts`:

```ts
export {
  TitleSchema,
  TitleFileSchema,
  type Title,
  type TitleFile,
} from './data/title';
```

Run:

```
pnpm --filter @ironyard/shared test -- title
pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/data/title.ts packages/shared/src/index.ts packages/shared/tests/title.spec.ts
git commit -m "$(cat <<'EOF'
feat(shared): TitleSchema for Phase 2 Epic 2A

Titles are echelon-tiered passive effects/abilities a hero earns. Schema
captures id, name, echelon (1-4), description, raw body, and optional
grantsAbilityId reference. 2B's CharacterAttachment activation folds the
ability into runtime.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4.2: parse-title + build wiring

**Files:**
- Create: `packages/data/src/parse-title.ts`
- Create: `packages/data/tests/parse-title.spec.ts`
- Modify: `packages/data/build.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/data/tests/parse-title.spec.ts`:

```ts
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseTitleMarkdown } from '../src/parse-title';

const TITLES = join(__dirname, '../../../.reference/data-md/Rules/Titles');

function firstTitleInEchelon(folder: string): string {
  const dir = join(TITLES, folder);
  const f = readdirSync(dir).find((x) => x.endsWith('.md') && !x.startsWith('_'));
  if (!f) throw new Error(`no md in ${dir}`);
  return readFileSync(join(dir, f), 'utf8');
}

describe('parseTitleMarkdown', () => {
  it('parses a 1st Echelon title with echelon: 1', () => {
    const t = parseTitleMarkdown(firstTitleInEchelon('1st Echelon'));
    expect(t?.echelon).toBe(1);
  });
  it('parses a 2nd Echelon title with echelon: 2', () => {
    const t = parseTitleMarkdown(firstTitleInEchelon('2nd Echelon'));
    expect(t?.echelon).toBe(2);
  });
  it('parses a 3rd Echelon title with echelon: 3', () => {
    const t = parseTitleMarkdown(firstTitleInEchelon('3rd Echelon'));
    expect(t?.echelon).toBe(3);
  });
  it('parses a 4th Echelon title with echelon: 4', () => {
    const t = parseTitleMarkdown(firstTitleInEchelon('4th Echelon'));
    expect(t?.echelon).toBe(4);
  });
  it('returns null on _Index.md', () => {
    const idxPath = join(TITLES, '_Index.md');
    const t = parseTitleMarkdown(readFileSync(idxPath, 'utf8'));
    expect(t).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
pnpm --filter @ironyard/data test -- parse-title
```
Expected: FAIL.

- [ ] **Step 3: Implement parse-title**

Create `packages/data/src/parse-title.ts`:

```ts
import matter from 'gray-matter';
import type { Title } from '@ironyard/shared';

function parseEchelon(s: unknown): number | null {
  if (typeof s !== 'string') return null;
  const m = /^(\d)/.exec(s);
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 10);
  return Number.isInteger(n) && n >= 1 && n <= 4 ? n : null;
}

function firstParagraph(content: string): string {
  // Same pattern as parse-item: skip H4 heading, take first non-bold paragraph.
  const lines = content.split('\n');
  let inBody = false;
  const para: string[] = [];
  for (const line of lines) {
    if (!inBody) {
      if (/^####\s+/.test(line)) inBody = true;
      continue;
    }
    if (line.trim() === '' && para.length === 0) continue;
    if (line.trim() === '') break;
    if (line.startsWith('**')) continue;
    if (line.startsWith('*') && line.endsWith('*')) {
      para.push(line.replace(/^\*|\*$/g, '').trim());
      break;
    }
    para.push(line.trim());
  }
  return para.join(' ').trim();
}

// Best-effort: titles that grant an ability have a `###### <Ability Name>`
// heading inside their body. Slugify the first one found.
function parseGrantsAbilityId(content: string, titleId: string): string | null {
  const m = /######\s+([^\n(]+?)(?:\s*\([^)]*\))?\s*$/m.exec(content);
  if (!m || !m[1]) return null;
  const slug = m[1].trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${titleId}-${slug}`;
}

export function parseTitleMarkdown(md: string): Title | null {
  const { data: fm, content } = matter(md);
  const typeStr = typeof fm.type === 'string' ? fm.type : '';
  if (!typeStr.startsWith('title/')) return null;
  const id = typeof fm.item_id === 'string' ? fm.item_id : null;
  const name = typeof fm.item_name === 'string' ? fm.item_name : null;
  if (!id || !name) return null;
  const echelon = parseEchelon(fm.echelon);
  if (echelon === null) return null;

  return {
    id,
    name,
    echelon,
    description: firstParagraph(content),
    raw: content,
    grantsAbilityId: parseGrantsAbilityId(content, id),
  };
}
```

- [ ] **Step 4: Run tests to verify pass**

```
pnpm --filter @ironyard/data test -- parse-title
```
Expected: 5 tests pass.

- [ ] **Step 5: Wire build.ts to emit titles.json**

Add to `packages/data/build.ts`:

```ts
import { parseTitleMarkdown } from './src/parse-title';

const TITLES_OUT = join(REPO_ROOT, 'apps/web/public/data/titles.json');
const API_TITLES_OUT = join(REPO_ROOT, 'apps/api/src/data/titles.json');
const TITLES_DIR = join(RULES_DIR, 'Titles');

const titleFiles = walkMd(TITLES_DIR);
const titles = [];
for (const path of titleFiles) {
  const md = readFileSync(path, 'utf8');
  const t = parseTitleMarkdown(md);
  if (t) titles.push(t);
}
titles.sort((a, b) => a.echelon - b.echelon || a.id.localeCompare(b.id));
const titlesFile = {
  version: '1.0',
  generatedAt: Date.now(),
  count: titles.length,
  titles,
};
mkdirSync(dirname(TITLES_OUT), { recursive: true });
writeFileSync(TITLES_OUT, JSON.stringify(titlesFile, null, 2));
mkdirSync(dirname(API_TITLES_OUT), { recursive: true });
writeFileSync(API_TITLES_OUT, JSON.stringify(titles, null, 2));
console.log(`titles.json: ${titles.length} titles written`);
```

- [ ] **Step 6: Run build, verify counts**

```
pnpm --filter @ironyard/data build:data
jq '.count' apps/web/public/data/titles.json
```
Expected: ~60.

- [ ] **Step 7: Commit**

```bash
git add packages/data/src/parse-title.ts packages/data/build.ts packages/data/tests/parse-title.spec.ts apps/api/src/data/titles.json
git commit -m "$(cat <<'EOF'
feat(data): parse-title + titles.json populated (Slice 4a of Epic 2A)

~60 titles parsed from .reference/data-md/Rules/Titles. Each carries
echelon (1-4), description, raw body, and optional grantsAbilityId for
2B's CharacterAttachment activation to fold.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4.3: CharacterSchema.inventory

**Files:**
- Modify: `packages/shared/src/character.ts`
- Modify: `packages/shared/tests/character.spec.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/shared/tests/character.spec.ts`:

```ts
import { CharacterSchema, InventoryEntrySchema } from '../src';

describe('InventoryEntrySchema', () => {
  it('parses an entry with defaults', () => {
    const e = InventoryEntrySchema.parse({ itemId: 'healing-potion' });
    expect(e.quantity).toBe(1);
    expect(e.equipped).toBe(false);
  });

  it('parses an entry with quantity > 1 for consumables', () => {
    const e = InventoryEntrySchema.parse({ itemId: 'healing-potion', quantity: 3 });
    expect(e.quantity).toBe(3);
  });

  it('parses an equipped entry', () => {
    const e = InventoryEntrySchema.parse({ itemId: 'flaming-sword', equipped: true });
    expect(e.equipped).toBe(true);
  });
});

describe('CharacterSchema.inventory', () => {
  it('defaults to empty array', () => {
    const c = CharacterSchema.parse({});
    expect(c.inventory).toEqual([]);
  });

  it('accepts inventory entries', () => {
    const c = CharacterSchema.parse({
      inventory: [{ itemId: 'healing-potion', quantity: 2 }],
    });
    expect(c.inventory.length).toBe(1);
    expect(c.inventory[0]?.quantity).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
pnpm --filter @ironyard/shared test -- character
```
Expected: FAIL — `InventoryEntrySchema` doesn't exist; `inventory` field missing.

- [ ] **Step 3: Add schema fields**

Open `packages/shared/src/character.ts`. Add (above `CharacterSchema`):

```ts
export const InventoryEntrySchema = z.object({
  itemId: z.string().min(1),
  // Consumables use quantity > 1. Others default to 1.
  quantity: z.number().int().min(0).default(1),
  // Worn/wielded vs. carried. Per-category invariants (body-slot conflicts,
  // 3-safely-carry) are runtime concerns enforced in 2B/2C, not at the
  // schema level.
  equipped: z.boolean().default(false),
});
export type InventoryEntry = z.infer<typeof InventoryEntrySchema>;
```

Then add to `CharacterSchema`'s `z.object({...})`:

```ts
// Items the character owns. Empty default for fresh characters.
inventory: z.array(InventoryEntrySchema).default([]),
```

Position the field near the bottom of the schema, after `complicationId` and before `campaignId`.

- [ ] **Step 4: Export from index.ts**

In `packages/shared/src/index.ts`:

```ts
export { InventoryEntrySchema, type InventoryEntry } from './character';
```

- [ ] **Step 5: Run tests + typecheck**

```
pnpm test
pnpm typecheck
```
Expected: all pass, including existing complete-character fixtures (they default `inventory: []`).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/character.ts packages/shared/src/index.ts packages/shared/tests/character.spec.ts
git commit -m "$(cat <<'EOF'
feat(shared): CharacterSchema.inventory (Slice 4b of Epic 2A)

InventoryEntrySchema captures {itemId, quantity, equipped}. Per-category
invariants (3-safely-carry for leveled treasures, body-slot uniqueness
for trinkets) are runtime concerns enforced in 2B/2C, not at the schema
level. Default empty array — existing complete-character fixtures still
parse without modification.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4.4: Override file scaffolds

**Files:**
- Create: `packages/data/overrides/_types.ts`
- Create: `packages/data/overrides/items.ts`
- Create: `packages/data/overrides/kits.ts`
- Create: `packages/data/overrides/abilities.ts`
- Create: `packages/data/overrides/titles.ts`
- Modify: `packages/data/build.ts`

- [ ] **Step 1: Create the types module**

Create `packages/data/overrides/_types.ts`:

```ts
// Override descriptor types for hand-authored structured effect data.
// Empty in Epic 2A — grows in 2B when the CharacterAttachment activation
// engine defines what fields each override carries (e.g. stat modifiers,
// granted abilities, condition immunities).
//
// Keep this file as the single canonical location for these types so
// the four override maps below stay shape-aligned.

export type ItemOverride = Record<string, never>;
export type KitOverride = Record<string, never>;
export type AbilityOverride = Record<string, never>;
export type TitleOverride = Record<string, never>;
```

- [ ] **Step 2: Create the four override maps**

Create `packages/data/overrides/items.ts`:

```ts
import type { ItemOverride } from './_types';

// Hand-authored item effect overrides. Empty in Epic 2A;
// populated in 2B as CharacterAttachment activation lands.
export const ITEM_OVERRIDES: Record<string, ItemOverride> = {};
```

Same pattern for `kits.ts`, `abilities.ts`, `titles.ts` — substitute the name and type accordingly. Each file is ~5 lines.

- [ ] **Step 3: Wire build.ts to import (no-op fold for 2A)**

Open `packages/data/build.ts`. Add imports near the top with the other override imports (Epic 1.1's `ANCESTRY_OVERRIDES` is the existing pattern):

```ts
import { ITEM_OVERRIDES } from './overrides/items';
import { KIT_OVERRIDES } from './overrides/kits';
import { ABILITY_OVERRIDES } from './overrides/abilities';
import { TITLE_OVERRIDES } from './overrides/titles';
```

The imports are ESM side-effect-free; they don't change build behavior in 2A (the overrides are empty). The fold-into-output logic is 2B's job. Compiling these imports proves the modules are wired.

If TypeScript complains about unused imports, mark them with `// biome-ignore lint/correctness/noUnusedImports: scaffold for 2B` comments above each line.

- [ ] **Step 4: Run build + tests**

```
pnpm --filter @ironyard/data build:data
pnpm test
pnpm typecheck
```

All pass. Build still emits the same JSON files (no behavior change from the overrides because they're empty).

- [ ] **Step 5: Commit**

```bash
git add packages/data/overrides/
git add packages/data/build.ts
git commit -m "$(cat <<'EOF'
feat(data): override file scaffolds (Slice 4c of Epic 2A)

Empty override maps for items, kits, abilities, and titles. _types.ts
declares the shapes (currently empty — grow in 2B). Build imports them
side-effect-free so the modules are wired and ready for population
when CharacterAttachment activation lands.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Final verification

### Task F: cross-cutting checks

- [ ] **Step 1: Full test battery**

```
pnpm test
pnpm typecheck
pnpm lint
```

All green. Lint errors that exist in files NOT touched by this plan are pre-existing — they shouldn't block. Errors in files this plan touched must be fixed.

- [ ] **Step 2: Build emits all 8 expected files**

```
pnpm --filter @ironyard/data build:data
```

Confirm by inspecting:

```
ls apps/web/public/data/
# Should list: ancestries.json careers.json classes.json complications.json kits.json items.json abilities.json titles.json monsters.json

ls apps/api/src/data/
# Same 8 files (plus monsters.json) committed.
```

Spot-check counts via `jq`:

```
jq '.count' apps/web/public/data/kits.json       # ~22
jq '.count' apps/web/public/data/items.json      # ~98
jq '.count' apps/web/public/data/abilities.json  # ~545
jq '.count' apps/web/public/data/titles.json     # ~60
```

- [ ] **Step 3: Manual wizard walk**

Run dev:

```
pnpm --filter @ironyard/api dev   # background
pnpm --filter @ironyard/web dev   # background
```

In a browser:
1. Hit `/characters/new`. Walk to Class. Pick Fury. Walk to Kit. Confirm a real 22-kit picker appears (no Epic 2 placeholder).
2. If Slice 3 freebie shipped: walk through to an encounter as a player with a materialized PC. Confirm `PlayerSheetPanel` renders ability cards instead of plain text ids. Click a card → `RollPower` dispatches.

Report any visible breakage.

- [ ] **Step 4: Final summary**

Count new commits since the start of this plan:

```
# After everything ships, find the commit SHA that landed just before this plan started.
# It should be 'ab1adcd' (the spec commit). Use that as the base.
git log --oneline ab1adcd..HEAD | wc -l
```

Expected: 10-12 commits across the 4 slices (some slices have 2-3 commits each).

Verify the deferred-work tracking in `phases.md` for Epic 2 still matches reality. Update if Slice 3 freebie landed (move PlayerSheetPanel out of 2B's deferred list).

---

## Self-Review

**Spec coverage check:**

| Spec section | Covered by |
|---|---|
| Scope — `kits.json` (22 entries) | Slice 1 |
| Scope — `items.json` (4 categories, ~98 entries) | Slice 2 |
| Scope — `abilities.json` (~545 entries, AbilitySchema extended) | Slice 3 |
| Scope — `titles.json` (~60 entries) | Slice 4 (Task 4.2) |
| Scope — `CharacterSchema.inventory` | Slice 4 (Task 4.3) |
| Scope — Override file scaffolds | Slice 4 (Task 4.4) |
| Decisions — discriminated union by category | Item Schema (Task 2.1) |
| Decisions — reuse AbilitySchema with optional PC fields | Task 3.1 |
| Decisions — empty overrides in 2A | Task 4.4 |
| Acceptance — KitStep lights up | Slice 1 Step 7 |
| Acceptance — All tests green | Final verification |

**Placeholder scan:** No TBD/TODO. Two places the engineer must adapt to actual data shape (effectKind heuristics in parse-item, sourceClassId/cost extraction in parse-ability) — those have explicit "if A, do B; otherwise adjust to actual frontmatter shape" guidance with example fallbacks.

**Type consistency:**
- `AbilitySchema` extracted from `monster.ts` to `ability.ts`; monster.ts re-exports for back-compat (Task 3.1).
- `InventoryEntrySchema` defined in `character.ts`, used by `CharacterSchema.inventory` (Task 4.3).
- `Kit`, `Item`, `Ability`, `Title`, `InventoryEntry` types are exported from `@ironyard/shared/index.ts` (each task's export step).
- `walkMd` is defined in Slice 2 and reused in Slice 3 and Slice 4 (one canonical definition in build.ts).
- The `parsePowerRoll` helper from `parse-monster` gets exported (Task 3.2 Step 4 mentions this). Engineer must verify the export is added.
