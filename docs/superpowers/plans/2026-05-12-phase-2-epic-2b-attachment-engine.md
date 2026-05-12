# Phase 2 Epic 2B — `CharacterAttachment` Activation Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the activation engine that folds attachment effects from ancestry, class features, level-pick abilities, items, kit keywords, and titles into the derived `CharacterRuntime`. Plus the Epic 1.1 / 2A carry-overs that depend on stable PC ability ids.

**Architecture:** Six slices.
- **Slice 1 — ability-id + sheet wiring** (small): adds `AbilitySchema.id`, regenerates `abilities.json`, fixes a 2A envelope-bug in `useKits`, wires `useAbilities` + `useTitles` + `useItems` into `WizardStaticData`, lights up interactive `AbilityCard`s on `PlayerSheetPanel` + `RuntimeReadout`.
- **Slice 2 — engine scaffolding** (medium): creates `packages/rules/src/attachments/` with `CharacterAttachment` types + empty collectors + `apply.ts` + tests. `deriveCharacterRuntime` becomes a thin orchestrator. Zero behavior change (collectors all return `[]`).
- **Slice 3 — refactor inline derivation through engine** (medium): moves `ancestry.grantedImmunities`, Dragon Knight Wyrmplate/Prismatic, ancestry signature ability, kit bonuses, and level-pick ability collection into their collectors. Inline reads in `derive-character-runtime.ts` disappear. All existing derivation tests stay green.
- **Slice 4 — override shapes + `CharacterSchema.titleId` + comprehensive kit/ancestry/class population** (medium): evolves `overrides/_types.ts` to real shapes, adds `titleId`, populates `KIT_OVERRIDES` with kit-keyword-gated leveled-treasure bonuses, populates ancestry-trait + class-feature attachments.
- **Slice 5 — canonical-example item + title overrides** (small): one override per item category that folds into runtime + one title with `stat-mod` + one title with `grant-ability`, plus smoke tests.
- **Slice 6 — `requireCanon` slugs + two-gate verification** (small): canon entries + source-check + manual review for every attachment category.

**Tech Stack:** TypeScript + Zod schemas, vitest, React + TanStack Query (for static-data hooks).

**Spec:** `docs/superpowers/specs/2026-05-12-phase-2-epic-2b-attachment-engine-design.md`

---

## Conventions

- **TDD:** Each task starts with a failing test, then minimal implementation. Tests live next to source in `packages/*/tests/` or `packages/rules/src/attachments/*.test.ts`.
- **Per-slice verification:** `pnpm test`, `pnpm typecheck`, `pnpm lint` repo-wide must pass before the slice closes.
- **Commit cadence:** one commit per task (or per closely-related pair of tasks). Each commit message starts with `feat(scope):` / `refactor(scope):` / `fix(scope):` / `test(scope):` / `docs(scope):`.
- **Static data write paths:** the build emits envelope to `apps/web/public/data/<x>.json` and bare array to `apps/api/src/data/<x>.json`. The web `fetchData` helper always reads the envelope and unwraps via `file.<x>`.

---

## Slice 1: `AbilitySchema.id` + static-data hook wiring + sheet `AbilityCard`s

### Task 1.1: Add `id` to `AbilitySchema`

**Files:**
- Modify: `packages/shared/src/data/ability.ts`
- Test: `packages/shared/tests/ability.spec.ts` (create if missing — check first with `ls`)

- [ ] **Step 1: Write the failing test**

If `packages/shared/tests/ability.spec.ts` exists, append. Otherwise create:

```ts
import { describe, expect, it } from 'vitest';
import { AbilitySchema } from '../src/data/ability';

describe('AbilitySchema.id', () => {
  it('requires a stable id', () => {
    const result = AbilitySchema.safeParse({
      name: 'Mind Spike',
      type: 'action',
      raw: '...',
    });
    expect(result.success).toBe(false);
  });

  it('parses with an id', () => {
    const result = AbilitySchema.safeParse({
      id: 'tactician-mind-spike',
      name: 'Mind Spike',
      type: 'action',
      raw: '...',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.id).toBe('tactician-mind-spike');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @ironyard/shared test -- ability.spec.ts
```
Expected: first test FAILs (parse succeeds without id today). Second test FAILs (no `id` field on schema).

- [ ] **Step 3: Add `id` field to `AbilitySchema`**

In `packages/shared/src/data/ability.ts`, add `id: z.string().min(1)` as the first property in the object:

```ts
export const AbilitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: AbilityTypeSchema,
  // … rest unchanged
});
```

- [ ] **Step 4: Verify tests pass**

```bash
pnpm --filter @ironyard/shared test -- ability.spec.ts
```
Expected: both new tests PASS. Note: this will break any existing fixtures that don't supply `id` — Task 1.2 regenerates `abilities.json` and Task 1.3 updates the data-package tests.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/data/ability.ts packages/shared/tests/ability.spec.ts
git commit -m "$(cat <<'EOF'
feat(shared): require stable id on AbilitySchema

Adds the AbilitySchema.id field needed for ability lookup by id.
parse-ability.ts populates it in Task 1.2; abilities.json regenerated
in Task 1.3.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 1.2: Populate `id` in `parse-ability.ts`

**Files:**
- Modify: `packages/data/src/parse-ability.ts`
- Test: `packages/data/tests/parse-ability.spec.ts` (existing — extend)

- [ ] **Step 1: Inspect existing fixture-based test**

```bash
ls packages/data/tests/parse-ability.spec.ts && head -50 packages/data/tests/parse-ability.spec.ts
```

If the test file does not exist, create a minimal one with one fixture that covers id derivation. Otherwise extend it.

- [ ] **Step 2: Write the failing id derivation test**

Append to `packages/data/tests/parse-ability.spec.ts` (or create):

```ts
import { describe, expect, it } from 'vitest';
import { parseAbilityMarkdown } from '../src/parse-ability';

describe('parseAbilityMarkdown — id derivation', () => {
  it('derives id as {sourceClassId}-{slug-of-name}', () => {
    const md = `---
item_name: Mind Spike
type: feature/ability/free
class: tactician
action_type: Main action
---
`;
    const a = parseAbilityMarkdown(md, '/abs/Abilities/Tactician/Mind Spike.md');
    expect(a?.id).toBe('tactician-mind-spike');
  });

  it('slugifies punctuation in names', () => {
    const md = `---
item_name: Run 'em Down!
type: feature/ability/free
class: fury
action_type: Maneuver
---
`;
    const a = parseAbilityMarkdown(md, '/abs/Abilities/Fury/Run em Down.md');
    expect(a?.id).toBe('fury-run-em-down');
  });

  it('falls back to ability-source folder when sourceClassId is null', () => {
    // Common abilities live under Common/; sourceClassId is "common".
    const md = `---
item_name: Heal
type: common-ability/maneuver
---
`;
    const a = parseAbilityMarkdown(md, '/abs/Abilities/Common/Heal.md');
    expect(a?.id).toBe('common-heal');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
pnpm --filter @ironyard/data test -- parse-ability.spec.ts
```
Expected: all three FAIL (no id derived today).

- [ ] **Step 4: Add a `slugify` helper + emit `id`**

In `packages/data/src/parse-ability.ts`, add near the top:

```ts
function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
```

In `parseAbilityMarkdown`, after `const sourceClassId = parseSourceClassId(...)`, build the id and include it in the `safeParse` payload:

```ts
const id = `${sourceClassId ?? 'unknown'}-${slugify(name)}`;

const result = AbilitySchema.safeParse({
  id,
  name,
  type,
  // … rest unchanged
});
```

- [ ] **Step 5: Run tests to verify pass**

```bash
pnpm --filter @ironyard/data test -- parse-ability.spec.ts
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/data/src/parse-ability.ts packages/data/tests/parse-ability.spec.ts
git commit -m "$(cat <<'EOF'
feat(data): emit stable id from parseAbilityMarkdown

Format: {sourceClassId}-{slug-of-name}. Slugification lowercases
+ replaces non-alphanumeric runs with a single dash. Regenerated
abilities.json in next task.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 1.3: Regenerate `abilities.json` + sanity-check uniqueness

**Files:**
- Modify: `apps/web/public/data/abilities.json` (regenerated)
- Modify: `apps/api/src/data/abilities.json` (regenerated)

- [ ] **Step 1: Run the data build**

```bash
pnpm --filter @ironyard/data build:data
```
Expected: builds without error; logs `wrote 545 abilities`.

- [ ] **Step 2: Sanity-check id uniqueness**

```bash
node -e "const f = require('./apps/web/public/data/abilities.json'); const ids = f.abilities.map(a => a.id); const dupes = ids.filter((x,i) => ids.indexOf(x) !== i); console.log('dupes:', dupes.length, dupes.slice(0,10));"
```
Expected: `dupes: 0 []`. If duplicates exist, look at the duplicate names — typically homonyms across classes (which won't collide because the class prefix differs). If they truly collide, append a content-hash to the id.

- [ ] **Step 3: Commit the regenerated data**

```bash
git add apps/web/public/data/abilities.json apps/api/src/data/abilities.json
git commit -m "$(cat <<'EOF'
chore(data): regenerate abilities.json with stable ids

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 1.4: Fix `useKits` envelope-parse bug (2A leftover) + add `useAbilities` / `useItems` / `useTitles` hooks

**Files:**
- Modify: `apps/web/src/api/static-data.ts`

Context: the build writes envelope shape (`{version, count, kits: [...]}`) to `apps/web/public/data/<x>.json`, but `useKits` parses with `z.array(ResolvedKitSchema)` which would fail. The hook needs to unwrap the envelope. Same pattern as `useAncestries` / `useCareers` / etc.

- [ ] **Step 1: Fix `useKits` to unwrap the envelope**

In `apps/web/src/api/static-data.ts`, replace `useKits`:

```ts
import { KitFileSchema } from '@ironyard/shared';

export function useKits() {
  return useQuery({
    queryKey: ['data', 'kits'],
    queryFn: async () => {
      const file = await fetchData('kits.json', KitFileSchema);
      return file.kits;
    },
    ...STATIC,
  });
}
```

(Remove the unused `ResolvedKitSchema` import + the `z` import if `z` is no longer used elsewhere in the file. Run typecheck to verify.)

- [ ] **Step 2: Add `useAbilities` / `useItems` / `useTitles`**

After `useKits`, append:

```ts
import { AbilityFileSchema, ItemFileSchema, TitleFileSchema } from '@ironyard/shared';

export function useAbilities() {
  return useQuery({
    queryKey: ['data', 'abilities'],
    queryFn: async () => {
      const file = await fetchData('abilities.json', AbilityFileSchema);
      return file.abilities;
    },
    ...STATIC,
  });
}

export function useItems() {
  return useQuery({
    queryKey: ['data', 'items'],
    queryFn: async () => {
      const file = await fetchData('items.json', ItemFileSchema);
      return file.items;
    },
    ...STATIC,
  });
}

export function useTitles() {
  return useQuery({
    queryKey: ['data', 'titles'],
    queryFn: async () => {
      const file = await fetchData('titles.json', TitleFileSchema);
      return file.titles;
    },
    ...STATIC,
  });
}
```

(If any of `ItemFileSchema` / `TitleFileSchema` are not exported from `@ironyard/shared`, check `packages/shared/src/index.ts` and add them. They were created in 2A Slices 2 and 4a.)

- [ ] **Step 3: Extend `WizardStaticData` to include the new maps**

Replace the body of `useWizardStaticData`:

```ts
type AbilityItem = NonNullable<ReturnType<typeof useAbilities>['data']>[number];
type ItemEntry  = NonNullable<ReturnType<typeof useItems>['data']>[number];
type TitleItem  = NonNullable<ReturnType<typeof useTitles>['data']>[number];

export type WizardStaticData = {
  ancestries: ReadonlyMap<string, AncestryItem>;
  careers: ReadonlyMap<string, CareerItem>;
  classes: ReadonlyMap<string, ClassItem>;
  complications: ReadonlyMap<string, ComplicationItem>;
  kits: ReadonlyMap<string, KitItem>;
  abilities: ReadonlyMap<string, AbilityItem>;
  items: ReadonlyMap<string, ItemEntry>;
  titles: ReadonlyMap<string, TitleItem>;
};

export function useWizardStaticData(): WizardStaticData | null {
  const a = useAncestries();
  const ca = useCareers();
  const cl = useClasses();
  const co = useComplications();
  const k = useKits();
  const ab = useAbilities();
  const it = useItems();
  const ti = useTitles();

  if (!a.data || !ca.data || !cl.data || !co.data || !k.data || !ab.data || !it.data || !ti.data) return null;

  return {
    ancestries: new Map(a.data.map((x) => [x.id, x])),
    careers: new Map(ca.data.map((x) => [x.id, x])),
    classes: new Map(cl.data.map((x) => [x.id, x])),
    complications: new Map(co.data.map((x) => [x.id, x])),
    kits: new Map(k.data.map((x) => [x.id, x])),
    abilities: new Map(ab.data.map((x) => [x.id, x])),
    items: new Map(it.data.map((x) => [x.itemId, x])),
    titles: new Map(ti.data.map((x) => [x.id, x])),
  };
}
```

(Verify the field names: `it.itemId` for items — confirm against `ItemSchema` in `packages/shared/src/data/item.ts`. If the id field is named differently, adjust.)

- [ ] **Step 4: Run typecheck**

```bash
pnpm typecheck
```
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/api/static-data.ts packages/shared/src/index.ts
git commit -m "$(cat <<'EOF'
feat(web): wire abilities/items/titles into WizardStaticData

Fixes useKits to consume the envelope (2A regression — was parsing
with z.array which silently fails at runtime). Adds useAbilities,
useItems, useTitles using the same pattern. Extends the composite
WizardStaticData with three more lookup maps.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 1.5: Extend `StaticDataBundle` for the rules package

**Files:**
- Modify: `packages/rules/src/static-data.ts`
- Test: `packages/rules/tests/static-data.spec.ts` (create if missing)

- [ ] **Step 1: Extend the type**

In `packages/rules/src/static-data.ts`:

```ts
import type { AncestrySchema, CareerSchema, ClassSchema, AbilitySchema, ItemSchema, TitleSchema } from '@ironyard/shared';

export type StaticDataBundle = {
  ancestries: Map<string, z.infer<typeof AncestrySchema>>;
  careers: Map<string, z.infer<typeof CareerSchema>>;
  classes: Map<string, z.infer<typeof ClassSchema>>;
  kits: Map<string, ResolvedKit>;
  abilities: Map<string, z.infer<typeof AbilitySchema>>;
  items: Map<string, z.infer<typeof ItemSchema>>;
  titles: Map<string, z.infer<typeof TitleSchema>>;
};
```

(Verify imports — `ItemSchema` and `TitleSchema` were added in 2A.)

- [ ] **Step 2: Update call sites**

In `apps/web/src/pages/combat/PlayerSheetPanel.tsx` (around line 198), update the bundle construction:

```ts
const bundle: StaticDataBundle = {
  ancestries: staticData.ancestries as StaticDataBundle['ancestries'],
  careers: staticData.careers as StaticDataBundle['careers'],
  classes: staticData.classes as StaticDataBundle['classes'],
  kits: staticData.kits as StaticDataBundle['kits'],
  abilities: staticData.abilities as StaticDataBundle['abilities'],
  items: staticData.items as StaticDataBundle['items'],
  titles: staticData.titles as StaticDataBundle['titles'],
};
```

Apply the same change to `apps/web/src/pages/characters/parts/RuntimeReadout.tsx` (around line 14) and anywhere else `StaticDataBundle` is constructed (grep for `StaticDataBundle = {`).

- [ ] **Step 3: Run typecheck**

```bash
pnpm typecheck
```
Expected: clean (the new fields are required, all call sites populated).

- [ ] **Step 4: Update the API DO's bundle**

```bash
grep -rn "StaticDataBundle\|kits: new Map\|ancestries: new Map" apps/api/src/
```

Whichever module(s) construct the API-side bundle (probably under `apps/api/src/lobby/` or `apps/api/src/data/`) need the three new maps populated from the bare-array JSON files (`apps/api/src/data/abilities.json`, `items.json`, `titles.json`). Add them.

- [ ] **Step 5: Run repo-wide tests + typecheck**

```bash
pnpm typecheck && pnpm test
```
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add packages/rules/src/static-data.ts apps/web/src/ apps/api/src/
git commit -m "$(cat <<'EOF'
feat(rules): extend StaticDataBundle with abilities/items/titles

Plumbs the three new lookup maps through every bundle call site
(web PlayerSheetPanel, RuntimeReadout, API DO). Required for Slice 1
ability-card rendering and Slice 4 inventory/title attachments.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 1.6: Render `AbilityCard`s on `PlayerSheetPanel`

**Files:**
- Modify: `apps/web/src/pages/combat/PlayerSheetPanel.tsx`

- [ ] **Step 1: Replace id-list rendering with `AbilityCard` lookup**

In `PlayerSheetPanel.tsx`, replace the `Abilities` component body (the `runtime.abilityIds.map(...)` block around lines 214-229) with:

```tsx
import { AbilityCard } from './AbilityCard';

// inside Abilities():
return (
  <div className="space-y-2">
    <h3 className="text-sm font-medium">Abilities</h3>
    <div className="space-y-3">
      {runtime.abilityIds.map((id) => {
        const ability = staticData.abilities.get(id);
        if (!ability) {
          // Defensive: id-without-data renders as a chip with the id text
          return (
            <div
              key={id}
              className="rounded-md border border-amber-800/40 bg-amber-900/10 px-3 py-2 text-xs font-mono text-amber-200"
              title="Ability data not found — likely a stale id from before Epic 2B"
            >
              {id} <span className="text-amber-400">(missing)</span>
            </div>
          );
        }
        if (!ability.powerRoll) {
          // Traits / maneuvers without a power roll get a passive renderer.
          return (
            <article
              key={id}
              className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3"
            >
              <h4 className="font-medium text-sm">{ability.name}</h4>
              <p className="mt-1 text-xs text-neutral-400">{ability.raw}</p>
            </article>
          );
        }
        return (
          <AbilityCard
            key={id}
            ability={ability}
            disabled={false}
            onRoll={(_a, _args) => {
              // TODO(Epic 2C): dispatch RollPower intent here.
              // Stub for Slice 1 — UI lights up; real intent flow lands in 2C.
            }}
          />
        );
      })}
    </div>
  </div>
);
```

(Remove the legacy `TODO(Epic 2): when a class-abilities JSON ships...` comment block above the function — it's resolved now.)

- [ ] **Step 2: Manual verification**

```bash
pnpm --filter @ironyard/web dev
```
Open `/campaigns/$id/play` as a player with a materialized PC that has at least one level-1 ability picked. Confirm `AbilityCard`s render with power-roll tiers. (Note: many PCs may have empty `levelChoices` because the wizard's `LevelPicks` is still a stub — that's expected; the real picker is Phase 5.)

Take iPad-portrait (810×1080) and iPhone-portrait (390×844) screenshots to confirm responsive layout.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/combat/PlayerSheetPanel.tsx
git commit -m "$(cat <<'EOF'
feat(web): render interactive AbilityCards on PlayerSheetPanel

Replaces the id-list stub with real AbilityCard lookups. Roll
dispatch stubbed — real RollPower intent flow lands in Epic 2C.
Missing-id fallback renders as an amber chip so stale character
data doesn't crash the panel.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 1.7: Update `RuntimeReadout` to display ability names

**Files:**
- Modify: `apps/web/src/pages/characters/parts/RuntimeReadout.tsx`

- [ ] **Step 1: Replace id rendering with name lookup**

Around line 45 in `RuntimeReadout.tsx`, where `runtime.abilityIds.map((id) => ...)` currently renders raw ids, swap to a name lookup:

```tsx
{runtime.abilityIds.map((id) => {
  const ability = staticData.abilities.get(id);
  return (
    <li key={id} className="text-xs">
      {ability ? ability.name : <span className="font-mono text-amber-400">{id} (missing)</span>}
    </li>
  );
})}
```

(Verify the surrounding JSX wrapper matches what's already there — the goal is name-not-id; styling stays.)

- [ ] **Step 2: Run typecheck + tests**

```bash
pnpm typecheck && pnpm test
```
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/characters/parts/RuntimeReadout.tsx
git commit -m "$(cat <<'EOF'
feat(web): RuntimeReadout shows ability names instead of ids

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 1.8: Slice 1 close — full verify

- [ ] **Step 1: Verify all gates**

```bash
pnpm test && pnpm typecheck && pnpm lint
```
Expected: all green.

- [ ] **Step 2: Sanity-spot-check `abilities.json`**

```bash
node -e "const f = require('./apps/web/public/data/abilities.json'); const sample = f.abilities.find(a => a.sourceClassId === 'tactician'); console.log(sample?.id, sample?.name);"
```
Expected: an id like `tactician-<something>` and a sensible name.

---

## Slice 2: `CharacterAttachment` engine scaffolding

Lands all the types, collectors, applier, and tests with zero behavioral change. After this slice, `deriveCharacterRuntime` calls through `collectAttachments → deriveBaseRuntime → applyAttachments` but all collectors return `[]`, so the output is identical to today.

### Task 2.1: `CharacterAttachment` type definition

**Files:**
- Create: `packages/rules/src/attachments/types.ts`

- [ ] **Step 1: Create the file with the discriminated union**

```ts
// CharacterAttachment is the data carrier for any effect that modifies the
// derived CharacterRuntime. Sources (ancestry, kit, item, …) produce these;
// the applier folds them into the runtime. See
// docs/superpowers/specs/2026-05-12-phase-2-epic-2b-attachment-engine-design.md
// for the design rationale.

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
  id: string;
  requireCanonSlug?: string;
};

export type AttachmentCondition =
  | { kind: 'kit-has-keyword'; keyword: string }
  | { kind: 'item-equipped' };

export type StatModField =
  | 'maxStamina'
  | 'recoveriesMax'
  | 'recoveryValue'
  | 'speed'
  | 'stability';

export type StatReplaceField = 'size';

export type AttachmentEffect =
  | { kind: 'stat-mod'; stat: StatModField; delta: number }
  | { kind: 'stat-replace'; stat: StatReplaceField; value: number | string }
  | { kind: 'grant-ability'; abilityId: string }
  | { kind: 'grant-skill'; skill: string }
  | { kind: 'grant-language'; language: string }
  | { kind: 'immunity'; damageKind: string; value: number | 'level' }
  | { kind: 'weakness'; damageKind: string; value: number | 'level' }
  | { kind: 'free-strike-damage'; delta: number };

export type CharacterAttachment = {
  source: AttachmentSource;
  condition?: AttachmentCondition;
  effect: AttachmentEffect;
};
```

- [ ] **Step 2: Verify it compiles**

```bash
pnpm typecheck
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add packages/rules/src/attachments/types.ts
git commit -m "$(cat <<'EOF'
feat(rules): CharacterAttachment discriminated union

Envelope + AttachmentEffect variants per Section 2 of the design spec.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 2.2: Empty collector scaffolding

**Files:**
- Create: `packages/rules/src/attachments/collectors/ancestry.ts`
- Create: `packages/rules/src/attachments/collectors/class-features.ts`
- Create: `packages/rules/src/attachments/collectors/level-picks.ts`
- Create: `packages/rules/src/attachments/collectors/kit.ts`
- Create: `packages/rules/src/attachments/collectors/items.ts`
- Create: `packages/rules/src/attachments/collectors/title.ts`
- Create: `packages/rules/src/attachments/collect.ts`

- [ ] **Step 1: Create each collector returning empty**

For each of the six collector files, identical shape (varies only by export name):

```ts
// packages/rules/src/attachments/collectors/ancestry.ts
import type { Character } from '@ironyard/shared';
import type { StaticDataBundle } from '../../static-data';
import type { CharacterAttachment } from '../types';

export function collectFromAncestry(
  _character: Character,
  _staticData: StaticDataBundle,
): CharacterAttachment[] {
  // Populated in Slice 3.
  return [];
}
```

Repeat for `class-features.ts` → `collectFromClassFeatures`, `level-picks.ts` → `collectFromLevelPicks`, `kit.ts` → `collectFromKit`, `items.ts` → `collectFromItems`, `title.ts` → `collectFromTitle`.

- [ ] **Step 2: Create the dispatch module**

```ts
// packages/rules/src/attachments/collect.ts
import type { Character } from '@ironyard/shared';
import type { StaticDataBundle } from '../static-data';
import type { CharacterAttachment } from './types';
import { collectFromAncestry } from './collectors/ancestry';
import { collectFromClassFeatures } from './collectors/class-features';
import { collectFromLevelPicks } from './collectors/level-picks';
import { collectFromKit } from './collectors/kit';
import { collectFromItems } from './collectors/items';
import { collectFromTitle } from './collectors/title';

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

- [ ] **Step 3: Run typecheck**

```bash
pnpm typecheck
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add packages/rules/src/attachments/
git commit -m "$(cat <<'EOF'
feat(rules): attachment collector scaffolding

Six empty collectors + dispatch. All return [] in this slice; populated
in Slice 3 as inline derivation migrates through.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 2.3: `apply.ts` with exhaustive effect switch

**Files:**
- Create: `packages/rules/src/attachments/apply.ts`

- [ ] **Step 1: Create the applier**

```ts
import type { Character } from '@ironyard/shared';
import { requireCanon } from '../require-canon';
import type { CharacterRuntime } from '../derive-character-runtime';
import type { ResolvedKit } from '../static-data';
import type {
  AttachmentCondition,
  AttachmentEffect,
  CharacterAttachment,
} from './types';

export type ApplyCtx = {
  character: Character;
  kit: ResolvedKit | null;
};

export function applyAttachments(
  base: CharacterRuntime,
  attachments: CharacterAttachment[],
  ctx: ApplyCtx,
): CharacterRuntime {
  const out: CharacterRuntime = structuredClone(base);

  // Split direct recoveryValue mods so we can re-derive after maxStamina mods.
  const deferredRecoveryValueMods: CharacterAttachment[] = [];

  for (const att of attachments) {
    if (att.source.requireCanonSlug && !requireCanon(att.source.requireCanonSlug)) continue;
    if (att.condition && !evaluateCondition(att.condition, ctx)) continue;
    if (att.effect.kind === 'stat-mod' && att.effect.stat === 'recoveryValue') {
      deferredRecoveryValueMods.push(att);
      continue;
    }
    applyEffect(out, att.effect, ctx);
  }

  // Re-derive recoveryValue *after* maxStamina mods, *before* direct mods.
  out.recoveryValue = Math.floor(out.maxStamina / 3);

  for (const att of deferredRecoveryValueMods) {
    applyEffect(out, att.effect, ctx);
  }

  // Dedupe array-valued fields.
  out.abilityIds = [...new Set(out.abilityIds)];
  out.skills = [...new Set(out.skills)];
  out.languages = [...new Set(out.languages)];

  return out;
}

function evaluateCondition(cond: AttachmentCondition, ctx: ApplyCtx): boolean {
  switch (cond.kind) {
    case 'kit-has-keyword':
      return ctx.kit?.keywords?.includes(cond.keyword) ?? false;
    case 'item-equipped':
      return true; // collector pre-filters by inventory[i].equipped
  }
}

function resolveLevel(value: number | 'level', character: Character): number {
  return value === 'level' ? character.level : value;
}

function applyEffect(out: CharacterRuntime, effect: AttachmentEffect, ctx: ApplyCtx): void {
  switch (effect.kind) {
    case 'stat-mod':
      (out as Record<string, number>)[effect.stat] =
        ((out as Record<string, number>)[effect.stat] ?? 0) + effect.delta;
      return;
    case 'stat-replace':
      (out as Record<string, number | string>)[effect.stat] = effect.value;
      return;
    case 'grant-ability':
      out.abilityIds.push(effect.abilityId);
      return;
    case 'grant-skill':
      out.skills.push(effect.skill);
      return;
    case 'grant-language':
      out.languages.push(effect.language);
      return;
    case 'immunity':
      out.immunities.push({
        kind: effect.damageKind,
        value: resolveLevel(effect.value, ctx.character),
      });
      return;
    case 'weakness':
      out.weaknesses.push({
        kind: effect.damageKind,
        value: resolveLevel(effect.value, ctx.character),
      });
      return;
    case 'free-strike-damage':
      out.freeStrikeDamage += effect.delta;
      return;
  }
}
```

Note: `ResolvedKit` does not currently include a `keywords` field in `static-data.ts`. Verify and extend if needed:

```ts
// packages/rules/src/static-data.ts — extend ResolvedKitSchema
export const ResolvedKitSchema = z.object({
  id: z.string(),
  name: z.string(),
  staminaBonus: z.number().int().default(0),
  speedBonus: z.number().int().default(0),
  stabilityBonus: z.number().int().default(0),
  meleeDamageBonus: z.number().int().default(0),
  rangedDamageBonus: z.number().int().default(0),
  signatureAbilityId: z.string().optional(),
  keywords: z.array(z.string()).default([]),
});
```

And confirm the parsed Kit objects in `kits.json` include `keywords` (2A Slice 1 added this — spot-check the file).

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add packages/rules/src/attachments/apply.ts packages/rules/src/static-data.ts
git commit -m "$(cat <<'EOF'
feat(rules): attachment applier with exhaustive effect switch

requireCanon gating, condition evaluation, recoveryValue ordering,
and array-field dedupe. Extends ResolvedKit with keywords so the
kit-has-keyword condition can resolve.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 2.4: Apply tests (one per effect kind + ordering)

**Files:**
- Create: `packages/rules/tests/attachments/apply.spec.ts`

- [ ] **Step 1: Write tests covering each effect variant**

```ts
import { describe, expect, it } from 'vitest';
import { applyAttachments } from '../../src/attachments/apply';
import type { CharacterAttachment } from '../../src/attachments/types';
import type { CharacterRuntime } from '../../src/derive-character-runtime';
import { CharacterSchema, type Character } from '@ironyard/shared';

function baseRuntime(overrides: Partial<CharacterRuntime> = {}): CharacterRuntime {
  return {
    characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
    maxStamina: 18,
    recoveriesMax: 8,
    recoveryValue: 6,
    heroicResource: { name: 'heroic', max: null, floor: 0 },
    abilityIds: [],
    skills: [],
    languages: [],
    immunities: [],
    weaknesses: [],
    speed: 5,
    size: '1M',
    stability: 0,
    freeStrikeDamage: 2,
    ...overrides,
  };
}

function baseCharacter(level = 1): Character {
  return CharacterSchema.parse({ level });
}

const NOOP_CTX = { kit: null };

describe('applyAttachments — effect kinds', () => {
  it('stat-mod adds to numeric field', () => {
    const att: CharacterAttachment = {
      source: { kind: 'kit', id: 'wrath.stamina' },
      effect: { kind: 'stat-mod', stat: 'maxStamina', delta: 9 },
    };
    const out = applyAttachments(baseRuntime(), [att], { character: baseCharacter(), ...NOOP_CTX });
    expect(out.maxStamina).toBe(27);
    expect(out.recoveryValue).toBe(9); // re-derived = floor(27 / 3)
  });

  it('stat-replace overwrites string field', () => {
    const att: CharacterAttachment = {
      source: { kind: 'ancestry-trait', id: 'hakaan.large' },
      effect: { kind: 'stat-replace', stat: 'size', value: '1L' },
    };
    const out = applyAttachments(baseRuntime(), [att], { character: baseCharacter(), ...NOOP_CTX });
    expect(out.size).toBe('1L');
  });

  it('grant-ability appends to abilityIds and dedupes', () => {
    const a1: CharacterAttachment = {
      source: { kind: 'ancestry-signature', id: 'human.detect' },
      effect: { kind: 'grant-ability', abilityId: 'human-detect-the-supernatural' },
    };
    const a2: CharacterAttachment = {
      source: { kind: 'level-pick', id: 'lvl1.0' },
      effect: { kind: 'grant-ability', abilityId: 'human-detect-the-supernatural' },
    };
    const out = applyAttachments(baseRuntime(), [a1, a2], {
      character: baseCharacter(),
      ...NOOP_CTX,
    });
    expect(out.abilityIds).toEqual(['human-detect-the-supernatural']);
  });

  it('grant-skill and grant-language dedupe', () => {
    const out = applyAttachments(
      baseRuntime({ skills: ['arcana'], languages: ['caelian'] }),
      [
        {
          source: { kind: 'ancestry-trait', id: 'devil.silver-tongue' },
          effect: { kind: 'grant-skill', skill: 'arcana' },
        },
        {
          source: { kind: 'ancestry-trait', id: 'devil.tongue' },
          effect: { kind: 'grant-language', language: 'caelian' },
        },
      ],
      { character: baseCharacter(), ...NOOP_CTX },
    );
    expect(out.skills).toEqual(['arcana']);
    expect(out.languages).toEqual(['caelian']);
  });

  it('immunity resolves value: level', () => {
    const att: CharacterAttachment = {
      source: { kind: 'ancestry-trait', id: 'time-raider.psychic-scar' },
      effect: { kind: 'immunity', damageKind: 'psychic', value: 'level' },
    };
    const out = applyAttachments(baseRuntime(), [att], {
      character: baseCharacter(7),
      ...NOOP_CTX,
    });
    expect(out.immunities).toEqual([{ kind: 'psychic', value: 7 }]);
  });

  it('weakness resolves numeric value', () => {
    const att: CharacterAttachment = {
      source: { kind: 'item', id: 'cursed-amulet' },
      effect: { kind: 'weakness', damageKind: 'corruption', value: 3 },
    };
    const out = applyAttachments(baseRuntime(), [att], { character: baseCharacter(), ...NOOP_CTX });
    expect(out.weaknesses).toEqual([{ kind: 'corruption', value: 3 }]);
  });

  it('free-strike-damage adds to baseline', () => {
    const att: CharacterAttachment = {
      source: { kind: 'kit', id: 'wrath.melee' },
      effect: { kind: 'free-strike-damage', delta: 4 },
    };
    const out = applyAttachments(baseRuntime(), [att], { character: baseCharacter(), ...NOOP_CTX });
    expect(out.freeStrikeDamage).toBe(6);
  });
});

describe('applyAttachments — ordering', () => {
  it('stat-mod order does not change result', () => {
    const a: CharacterAttachment = {
      source: { kind: 'kit', id: 'a' },
      effect: { kind: 'stat-mod', stat: 'maxStamina', delta: 9 },
    };
    const b: CharacterAttachment = {
      source: { kind: 'ancestry-trait', id: 'b' },
      effect: { kind: 'stat-mod', stat: 'maxStamina', delta: 6 },
    };
    const out1 = applyAttachments(baseRuntime(), [a, b], { character: baseCharacter(), ...NOOP_CTX });
    const out2 = applyAttachments(baseRuntime(), [b, a], { character: baseCharacter(), ...NOOP_CTX });
    expect(out1.maxStamina).toBe(out2.maxStamina);
    expect(out1.maxStamina).toBe(33);
  });

  it('direct recoveryValue mod applies AFTER maxStamina re-derive', () => {
    const staminaMod: CharacterAttachment = {
      source: { kind: 'kit', id: 'a' },
      effect: { kind: 'stat-mod', stat: 'maxStamina', delta: 9 },
    };
    const directRecoveryMod: CharacterAttachment = {
      source: { kind: 'item', id: 'b' },
      effect: { kind: 'stat-mod', stat: 'recoveryValue', delta: 2 },
    };
    const out = applyAttachments(baseRuntime(), [staminaMod, directRecoveryMod], {
      character: baseCharacter(),
      ...NOOP_CTX,
    });
    // maxStamina: 18 + 9 = 27. recoveryValue re-derived to floor(27/3) = 9.
    // Direct mod adds +2 → 11.
    expect(out.maxStamina).toBe(27);
    expect(out.recoveryValue).toBe(11);
  });
});

describe('applyAttachments — condition gating', () => {
  it('skips kit-has-keyword attachment when kit lacks keyword', () => {
    const att: CharacterAttachment = {
      source: { kind: 'kit-keyword-bonus', id: 'sword-of-X' },
      condition: { kind: 'kit-has-keyword', keyword: 'sword' },
      effect: { kind: 'stat-mod', stat: 'maxStamina', delta: 99 },
    };
    const out = applyAttachments(baseRuntime(), [att], {
      character: baseCharacter(),
      kit: { id: 'wrath', name: 'Wrath', keywords: ['axe'] } as never,
    });
    expect(out.maxStamina).toBe(18); // unchanged
  });

  it('applies kit-has-keyword attachment when kit has keyword', () => {
    const att: CharacterAttachment = {
      source: { kind: 'kit-keyword-bonus', id: 'sword-of-X' },
      condition: { kind: 'kit-has-keyword', keyword: 'sword' },
      effect: { kind: 'stat-mod', stat: 'maxStamina', delta: 5 },
    };
    const out = applyAttachments(baseRuntime(), [att], {
      character: baseCharacter(),
      kit: { id: 'wrath', name: 'Wrath', keywords: ['sword'] } as never,
    });
    expect(out.maxStamina).toBe(23);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
pnpm --filter @ironyard/rules test -- apply.spec.ts
```
Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/rules/tests/attachments/apply.spec.ts
git commit -m "$(cat <<'EOF'
test(rules): apply.ts — per-effect-kind, ordering, condition gating

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 2.5: Wire the orchestrator (zero behavior change)

**Files:**
- Modify: `packages/rules/src/derive-character-runtime.ts`
- Create: `packages/rules/src/attachments/index.ts`

- [ ] **Step 1: Public API barrel**

```ts
// packages/rules/src/attachments/index.ts
export * from './types';
export { collectAttachments } from './collect';
export { applyAttachments, type ApplyCtx } from './apply';
```

- [ ] **Step 2: Refactor `deriveCharacterRuntime`**

Refactor `packages/rules/src/derive-character-runtime.ts` so the public function becomes a three-step orchestrator. Rename today's function body to `deriveBaseRuntime` and call into it.

Concretely: keep all existing logic, but extract it under a new internal name and add a public wrapper. The collectors all return `[]` in this slice, so the result is identical.

```ts
import { collectAttachments } from './attachments/collect';
import { applyAttachments } from './attachments/apply';

export function deriveCharacterRuntime(
  character: Character,
  staticData: StaticDataBundle,
): CharacterRuntime {
  const base = deriveBaseRuntime(character, staticData);
  const attachments = collectAttachments(character, staticData);
  const kit = character.kitId ? staticData.kits.get(character.kitId) ?? null : null;
  return applyAttachments(base, attachments, { character, kit });
}

function deriveBaseRuntime(
  character: Character,
  staticData: StaticDataBundle,
): CharacterRuntime {
  // (the existing body of deriveCharacterRuntime — unchanged)
}
```

- [ ] **Step 3: Run all rules tests**

```bash
pnpm --filter @ironyard/rules test
```
Expected: every existing derivation test still passes. No new failures.

- [ ] **Step 4: Run repo-wide typecheck + tests**

```bash
pnpm typecheck && pnpm test
```
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add packages/rules/src/derive-character-runtime.ts packages/rules/src/attachments/index.ts
git commit -m "$(cat <<'EOF'
refactor(rules): wire deriveCharacterRuntime through orchestrator

Extracts the existing body into deriveBaseRuntime; deriveCharacterRuntime
now calls collectAttachments → deriveBaseRuntime → applyAttachments.
All collectors return [] in this slice so behavior is unchanged. Inline
ancestry/kit/DK reads migrate to collectors in Slice 3.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Slice 3: Refactor inline derivation through the engine

Each task moves one source's reads from `deriveBaseRuntime` into a collector. After each task, the existing `derive-character-runtime.spec.ts` tests must still pass — the runtime values are identical, only the path changed.

### Task 3.1: Move ancestry `grantedImmunities` into `collectFromAncestry`

**Files:**
- Modify: `packages/rules/src/attachments/collectors/ancestry.ts`
- Modify: `packages/rules/src/derive-character-runtime.ts`

- [ ] **Step 1: Implement `collectFromAncestry` for granted immunities**

Replace the body of `collectFromAncestry` in `packages/rules/src/attachments/collectors/ancestry.ts`:

```ts
export function collectFromAncestry(
  character: Character,
  staticData: StaticDataBundle,
): CharacterAttachment[] {
  if (character.ancestryId === null) return [];

  // Revenant does not inherit former-ancestry immunities.
  const ancestry = staticData.ancestries.get(character.ancestryId);
  if (!ancestry) return [];

  const out: CharacterAttachment[] = [];

  for (const entry of ancestry.grantedImmunities ?? []) {
    out.push({
      source: {
        kind: 'ancestry-trait',
        id: `${character.ancestryId}.granted-immunity.${entry.kind}`,
        requireCanonSlug: 'attachment.ancestry-granted-immunity',
      },
      effect: { kind: 'immunity', damageKind: entry.kind, value: entry.value },
    });
  }

  return out;
}
```

- [ ] **Step 2: Remove the inline iteration in `deriveBaseRuntime`**

In `derive-character-runtime.ts`, delete the block in `deriveBaseRuntime` that iterates `ancestry.grantedImmunities` (around the current line 123-128 — `for (const entry of ancestry.grantedImmunities) { ... immunities.push(...) }`).

The `immunities` local stays — it'll just be empty after `deriveBaseRuntime` and the attachment pass fills it.

- [ ] **Step 3: Add canon slug entry placeholder**

In `docs/rules-canon.md`, add a row near the existing entries (the formal review pass is Slice 6; for now stub it so `requireCanon('attachment.ancestry-granted-immunity')` returns true). Look at how other entries are encoded and follow the same convention.

If `requireCanon` reads from `canon-status.generated.ts`, regenerate that file via whatever script produces it. Confirm test invocation works.

- [ ] **Step 4: Run derivation tests**

```bash
pnpm --filter @ironyard/rules test -- derive-character-runtime
```
Expected: Time Raider Psychic Scar test (around line 230 of the spec file) still passes — the immunity is now produced via the attachment path. All other tests still green.

- [ ] **Step 5: Commit**

```bash
git add packages/rules/src/attachments/collectors/ancestry.ts packages/rules/src/derive-character-runtime.ts docs/rules-canon.md
git commit -m "$(cat <<'EOF'
refactor(rules): move ancestry.grantedImmunities through attachments

Time Raider Psychic Scar etc. now flow as immunity attachments emitted
from collectFromAncestry. Inline iteration removed from deriveBaseRuntime.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 3.2: Move Dragon Knight Wyrmplate + Prismatic Scales into `collectFromAncestry`

**Files:**
- Modify: `packages/rules/src/attachments/collectors/ancestry.ts`
- Modify: `packages/rules/src/derive-character-runtime.ts`

- [ ] **Step 1: Extend `collectFromAncestry`**

In `collectFromAncestry`, add after the granted-immunities loop:

```ts
if (character.ancestryId === 'dragon-knight') {
  const { wyrmplateType, prismaticScalesType } = character.ancestryChoices;
  if (wyrmplateType !== null) {
    out.push({
      source: {
        kind: 'ancestry-trait',
        id: 'dragon-knight.wyrmplate',
        requireCanonSlug: 'attachment.dragon-knight-wyrmplate',
      },
      effect: { kind: 'immunity', damageKind: wyrmplateType, value: 'level' },
    });
  }
  if (prismaticScalesType !== null) {
    out.push({
      source: {
        kind: 'ancestry-trait',
        id: 'dragon-knight.prismatic-scales',
        requireCanonSlug: 'attachment.dragon-knight-prismatic-scales',
      },
      effect: { kind: 'immunity', damageKind: prismaticScalesType, value: 'level' },
    });
  }
}
```

- [ ] **Step 2: Remove the inline DK push block from `deriveBaseRuntime`**

Delete the `if (character.ancestryId === 'dragon-knight') { ... }` block in `derive-character-runtime.ts` (around lines 130-139).

- [ ] **Step 3: Stub the canon slugs**

Same procedure as Task 3.1 step 3, for `attachment.dragon-knight-wyrmplate` and `attachment.dragon-knight-prismatic-scales`.

- [ ] **Step 4: Run derivation tests**

```bash
pnpm --filter @ironyard/rules test -- derive-character-runtime
```
Expected: Dragon Knight Wyrmplate / Prismatic tests still pass.

- [ ] **Step 5: Commit**

```bash
git add packages/rules/ docs/rules-canon.md
git commit -m "$(cat <<'EOF'
refactor(rules): Dragon Knight Wyrmplate/Prismatic via attachments

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 3.3: Emit `grant-ability` for `ancestry.signatureAbilityId` (lights up Class-D)

**Files:**
- Modify: `packages/rules/src/attachments/collectors/ancestry.ts`
- Test: `packages/rules/tests/derive-character-runtime.spec.ts` (extend)

- [ ] **Step 1: Add a failing test**

In `derive-character-runtime.spec.ts`, append:

```ts
describe('ancestry signature abilities (Class-D)', () => {
  it('Human gets detect-the-supernatural in abilityIds', () => {
    const ancestries = new Map([
      ['human', {
        id: 'human',
        name: 'Human',
        defaultSize: '1M',
        defaultSpeed: 5,
        grantedImmunities: [],
        signatureAbilityId: 'human-detect-the-supernatural',
        purchasableTraits: [],
      }],
    ]);
    const char = buildCharacter({ ancestryId: 'human', level: 1 });
    const runtime = deriveCharacterRuntime(char, {
      ancestries: ancestries as never,
      careers: new Map(),
      classes: new Map(),
      kits: new Map(),
      abilities: new Map(),
      items: new Map(),
      titles: new Map(),
    });
    expect(runtime.abilityIds).toContain('human-detect-the-supernatural');
  });
});
```

(Adapt to whatever `buildCharacter` helper the existing tests use. If there is none, look at how the Time Raider test constructs its character around line 230 and follow the same pattern.)

- [ ] **Step 2: Run test to verify fail**

```bash
pnpm --filter @ironyard/rules test -- derive-character-runtime
```
Expected: the new test FAILs (no signature ability emitted yet).

- [ ] **Step 3: Implement in `collectFromAncestry`**

After the DK block, add:

```ts
if (ancestry.signatureAbilityId) {
  out.push({
    source: {
      kind: 'ancestry-signature',
      id: `${character.ancestryId}.signature`,
      requireCanonSlug: 'attachment.ancestry-signature-ability',
    },
    effect: { kind: 'grant-ability', abilityId: ancestry.signatureAbilityId },
  });
}
```

- [ ] **Step 4: Stub the canon slug**

Add `attachment.ancestry-signature-ability` to `rules-canon.md`. Regenerate canon-status if needed.

- [ ] **Step 5: Run tests**

```bash
pnpm --filter @ironyard/rules test
```
Expected: new signature-ability test passes; all existing tests still green.

- [ ] **Step 6: Commit**

```bash
git add packages/rules/ docs/rules-canon.md
git commit -m "$(cat <<'EOF'
feat(rules): emit grant-ability for ancestry.signatureAbilityId

Lights up Class-D ancestry signature abilities (Human Detect the
Supernatural, Orc Relentless, Dwarf Runic Carving) on the character
sheet via collectFromAncestry.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 3.4: Move kit stat bonuses into `collectFromKit`

**Files:**
- Modify: `packages/rules/src/attachments/collectors/kit.ts`
- Modify: `packages/rules/src/derive-character-runtime.ts`

- [ ] **Step 1: Implement `collectFromKit`**

```ts
import type { Character } from '@ironyard/shared';
import type { StaticDataBundle } from '../../static-data';
import type { CharacterAttachment } from '../types';

export function collectFromKit(
  character: Character,
  staticData: StaticDataBundle,
): CharacterAttachment[] {
  if (!character.kitId) return [];
  const kit = staticData.kits.get(character.kitId);
  if (!kit) return [];

  const out: CharacterAttachment[] = [];

  if (kit.staminaBonus) {
    out.push({
      source: {
        kind: 'kit',
        id: `${kit.id}.stamina-bonus`,
        requireCanonSlug: 'attachment.kit-stamina-bonus',
      },
      effect: { kind: 'stat-mod', stat: 'maxStamina', delta: kit.staminaBonus },
    });
  }
  if (kit.stabilityBonus) {
    out.push({
      source: {
        kind: 'kit',
        id: `${kit.id}.stability-bonus`,
        requireCanonSlug: 'attachment.kit-stability-bonus',
      },
      effect: { kind: 'stat-mod', stat: 'stability', delta: kit.stabilityBonus },
    });
  }
  if (kit.meleeDamageBonus) {
    out.push({
      source: {
        kind: 'kit',
        id: `${kit.id}.melee-damage-bonus`,
        requireCanonSlug: 'attachment.kit-melee-damage-bonus',
      },
      effect: { kind: 'free-strike-damage', delta: kit.meleeDamageBonus },
    });
  }
  if (kit.speedBonus) {
    out.push({
      source: {
        kind: 'kit',
        id: `${kit.id}.speed-bonus`,
        requireCanonSlug: 'attachment.kit-speed-bonus',
      },
      effect: { kind: 'stat-mod', stat: 'speed', delta: kit.speedBonus },
    });
  }

  return out;
}
```

- [ ] **Step 2: Remove inline kit reads from `deriveBaseRuntime`**

In `derive-character-runtime.ts`:
- Remove the `+ (kit?.staminaBonus ?? 0)` addition in `deriveMaxStamina` call (the `maxStamina` line).
- Remove the `stability = kit?.stabilityBonus ?? 0` line.
- Change `freeStrikeDamage = (kit?.meleeDamageBonus ?? 0) + 2` to just `freeStrikeDamage = 2`.

The kit lookup itself can stay since the orchestrator uses it for `ApplyCtx`, but if `kit` is now unused inside `deriveBaseRuntime`, remove the local.

- [ ] **Step 3: Stub canon slugs**

Add `attachment.kit-stamina-bonus`, `attachment.kit-stability-bonus`, `attachment.kit-melee-damage-bonus`, `attachment.kit-speed-bonus` to `rules-canon.md`. Regenerate.

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @ironyard/rules test -- derive-character-runtime
```
Expected: existing kit-bonus tests still pass.

- [ ] **Step 5: Commit**

```bash
git add packages/rules/ docs/rules-canon.md
git commit -m "$(cat <<'EOF'
refactor(rules): kit stamina/stability/melee/speed bonuses via attachments

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 3.5: Move level-pick ability collection into `collectFromLevelPicks`; delete `collectAbilityIds`

**Files:**
- Modify: `packages/rules/src/attachments/collectors/level-picks.ts`
- Modify: `packages/rules/src/derive-character-runtime.ts`

- [ ] **Step 1: Implement `collectFromLevelPicks`**

```ts
import type { Character } from '@ironyard/shared';
import type { StaticDataBundle } from '../../static-data';
import type { CharacterAttachment } from '../types';

export function collectFromLevelPicks(
  character: Character,
  _staticData: StaticDataBundle,
): CharacterAttachment[] {
  const out: CharacterAttachment[] = [];
  for (const lvl of Object.keys(character.levelChoices)) {
    const choices = character.levelChoices[lvl];
    if (!choices) continue;
    for (const abilityId of choices.abilityIds) {
      out.push({
        source: { kind: 'level-pick', id: `level-${lvl}.ability.${abilityId}` },
        effect: { kind: 'grant-ability', abilityId },
      });
    }
    for (const abilityId of choices.subclassAbilityIds) {
      out.push({
        source: { kind: 'level-pick', id: `level-${lvl}.subclass-ability.${abilityId}` },
        effect: { kind: 'grant-ability', abilityId },
      });
    }
  }
  return out;
}
```

(No `requireCanonSlug` — level-pick grants are direct user input, not data-driven effects to gate.)

- [ ] **Step 2: Remove `collectAbilityIds` from `derive-character-runtime.ts`**

Delete the function `collectAbilityIds` (around lines 191-207) and the line in `deriveBaseRuntime` that calls it. Replace with `const abilityIds: string[] = [];` in `deriveBaseRuntime`.

- [ ] **Step 3: Run tests**

```bash
pnpm --filter @ironyard/rules test
```
Expected: all derivation tests pass. (Class-D signature test from Task 3.3 still passes — its ability id is emitted from `collectFromAncestry`.)

- [ ] **Step 4: Commit**

```bash
git add packages/rules/
git commit -m "$(cat <<'EOF'
refactor(rules): level-pick abilities via collectFromLevelPicks

Removes the collectAbilityIds function — abilities now flow as
grant-ability attachments emitted per level-pick entry.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 3.6: Slice 3 close — orchestrator audit + full verify

- [ ] **Step 1: Audit `deriveBaseRuntime`**

Re-read `derive-character-runtime.ts`. Confirm `deriveBaseRuntime` no longer reads:
- `ancestry.grantedImmunities`
- `character.ancestryChoices.wyrmplateType` / `prismaticScalesType`
- `ancestry.signatureAbilityId`
- `kit.staminaBonus` / `stabilityBonus` / `meleeDamageBonus` / `speedBonus`
- `character.levelChoices`'s `abilityIds` / `subclassAbilityIds`

It should still read:
- `character.characteristicArray` (base derivation)
- `cls.startingStamina`, `cls.staminaPerLevel`, `cls.recoveries` (base derivation)
- `cls.heroicResource` (base derivation)
- `ancestry.defaultSize` / `defaultSpeed` (base derivation — defaults; Slice 4 may add `stat-replace` overrides for these later if needed)
- `character.culture.*Skill`, `character.careerChoices.skills/languages`, `character.culture.language` (skills/languages — these stay in base derivation since they're direct character-blob reads)

- [ ] **Step 2: Full verify**

```bash
pnpm test && pnpm typecheck && pnpm lint
```
Expected: all green.

- [ ] **Step 3: Commit any audit cleanups**

If the audit surfaced dead code or stale comments, fix in a single commit:

```bash
git add packages/rules/
git commit -m "refactor(rules): cleanup after slice 3 audit

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
"
```

---

## Slice 4: Override shapes + `CharacterSchema.titleId` + comprehensive kit/ancestry/class population

### Task 4.1: Evolve `overrides/_types.ts` shapes

**Files:**
- Modify: `packages/data/overrides/_types.ts`
- Modify: `packages/data/overrides/{items,kits,abilities,titles}.ts`

- [ ] **Step 1: Replace empty shapes with attachment-list shapes**

```ts
// packages/data/overrides/_types.ts
import type { CharacterAttachment } from '@ironyard/rules';

export type ItemOverride    = { attachments: CharacterAttachment[] };
export type KitOverride     = { attachments: CharacterAttachment[] };
export type AbilityOverride = { attachments: CharacterAttachment[] };
export type TitleOverride   = { attachments: CharacterAttachment[] };
```

- [ ] **Step 2: Make sure `CharacterAttachment` is exported from `@ironyard/rules`**

Check `packages/rules/src/index.ts`. Add if missing:

```ts
export * from './attachments';
```

- [ ] **Step 3: Verify the four override files still typecheck with empty records**

```bash
pnpm typecheck
```

The existing `export const ITEM_OVERRIDES: Record<string, ItemOverride> = {};` (etc.) should still typecheck — empty record matches the new shape.

- [ ] **Step 4: Commit**

```bash
git add packages/data/overrides/_types.ts packages/rules/src/index.ts
git commit -m "$(cat <<'EOF'
feat(data): override shapes carry CharacterAttachment[] payloads

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 4.2: Add `CharacterSchema.titleId`

**Files:**
- Modify: `packages/shared/src/character.ts`
- Test: `packages/shared/tests/character.spec.ts` (extend or create)

- [ ] **Step 1: Add a failing test**

```ts
import { CharacterSchema } from '../src/character';

it('CharacterSchema.titleId defaults to null', () => {
  const c = CharacterSchema.parse({});
  expect(c.titleId).toBeNull();
});

it('CharacterSchema accepts a titleId', () => {
  const c = CharacterSchema.parse({ titleId: 'monster-killer' });
  expect(c.titleId).toBe('monster-killer');
});
```

- [ ] **Step 2: Run to verify fail**

```bash
pnpm --filter @ironyard/shared test -- character.spec.ts
```
Expected: both FAIL — `titleId` is not on the schema.

- [ ] **Step 3: Add the field**

In `packages/shared/src/character.ts`, in `CharacterSchema.z.object({ ... })`, add after `complicationId`:

```ts
  // ── Title (optional) ──────────────────────────────────────────────────
  // References titles.json by id. Null until the player picks/earns a title.
  titleId: z.string().nullable().default(null),
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @ironyard/shared test
```
Expected: PASS. All existing character-fixture tests still pass — `titleId` defaults to `null`.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/
git commit -m "$(cat <<'EOF'
feat(shared): CharacterSchema.titleId

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 4.3: Implement `collectFromTitle`

**Files:**
- Modify: `packages/rules/src/attachments/collectors/title.ts`

- [ ] **Step 1: Implement**

```ts
import type { Character } from '@ironyard/shared';
import type { StaticDataBundle } from '../../static-data';
import type { CharacterAttachment } from '../types';
import { TITLE_OVERRIDES } from '@ironyard/data/overrides/titles';

export function collectFromTitle(
  character: Character,
  _staticData: StaticDataBundle,
): CharacterAttachment[] {
  if (!character.titleId) return [];
  const override = TITLE_OVERRIDES[character.titleId];
  if (!override) return [];
  return override.attachments;
}
```

Note: importing from `@ironyard/data` may require a tsconfig path alias or a dependency line in `packages/rules/package.json`. If `@ironyard/data` isn't already a dep of `@ironyard/rules`, add it. Inspect:

```bash
cat packages/rules/package.json
```

If `@ironyard/data` is missing from `dependencies`, add `"@ironyard/data": "workspace:*"` and run `pnpm install`.

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add packages/rules/ packages/rules/package.json
git commit -m "$(cat <<'EOF'
feat(rules): collectFromTitle reads TITLE_OVERRIDES

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 4.4: Implement `collectFromItems`

**Files:**
- Modify: `packages/rules/src/attachments/collectors/items.ts`

- [ ] **Step 1: Implement**

```ts
import type { Character } from '@ironyard/shared';
import type { StaticDataBundle } from '../../static-data';
import type { CharacterAttachment } from '../types';
import { ITEM_OVERRIDES } from '@ironyard/data/overrides/items';

export function collectFromItems(
  character: Character,
  _staticData: StaticDataBundle,
): CharacterAttachment[] {
  const out: CharacterAttachment[] = [];
  for (const entry of character.inventory) {
    if (!entry.equipped) continue;
    const override = ITEM_OVERRIDES[entry.itemId];
    if (!override) continue;
    out.push(...override.attachments);
  }
  return out;
}
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add packages/rules/
git commit -m "$(cat <<'EOF'
feat(rules): collectFromItems reads ITEM_OVERRIDES for equipped items

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 4.5: Implement `collectFromClassFeatures`

**Files:**
- Modify: `packages/rules/src/attachments/collectors/class-features.ts`

Class-feature attachments are sourced from `ABILITY_OVERRIDES` keyed by ability id (per-level features ARE abilities in Draw Steel's schema — they live in the ability data with `feature_type` set). Iterate the character's resolved ability ids and pull any matching overrides.

- [ ] **Step 1: Implement**

```ts
import type { Character } from '@ironyard/shared';
import type { StaticDataBundle } from '../../static-data';
import type { CharacterAttachment } from '../types';
import { ABILITY_OVERRIDES } from '@ironyard/data/overrides/abilities';

export function collectFromClassFeatures(
  character: Character,
  _staticData: StaticDataBundle,
): CharacterAttachment[] {
  // Class features ARE abilities in Draw Steel. Iterate the level-pick
  // ability ids and pull any matching ABILITY_OVERRIDES entries.
  const out: CharacterAttachment[] = [];
  for (const lvl of Object.keys(character.levelChoices)) {
    const choices = character.levelChoices[lvl];
    if (!choices) continue;
    for (const abilityId of [...choices.abilityIds, ...choices.subclassAbilityIds]) {
      const override = ABILITY_OVERRIDES[abilityId];
      if (override) out.push(...override.attachments);
    }
  }
  return out;
}
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add packages/rules/
git commit -m "$(cat <<'EOF'
feat(rules): collectFromClassFeatures reads ABILITY_OVERRIDES

Iterates level-pick ability ids; folds any matching override
attachments. Class features ARE abilities in Draw Steel — there's
no separate per-class feature data set to read.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 4.6: Populate `KIT_OVERRIDES` with kit-keyword-gated leveled-treasure bonuses

**Files:**
- Modify: `packages/data/overrides/kits.ts`

For each kit that grants conditional bonuses (weapon/armor/equipment keywords interacting with the equipped leveled treasures), author `KIT_OVERRIDES[kitId]` with appropriate `kit-has-keyword` conditioned attachments.

This task is judgment-laden — read the kit JSON to see which kits declare which keywords, and consult `.reference/data-md/Rules/Kits/*.md` for the rule text on keyword-gated bonuses.

- [ ] **Step 1: Survey which kits have keyword-conditional rules**

```bash
grep -l "keyword" .reference/data-md/Rules/Kits/*.md 2>/dev/null
```

For each one, note the rule. Many kits have no keyword-gated bonus, so most entries will be `{ attachments: [] }` or absent.

- [ ] **Step 2: Author entries for the kits that DO have keyword bonuses**

Example shape (adjust to actual rules — this is illustrative):

```ts
import type { CharacterAttachment } from '@ironyard/rules';
import type { KitOverride } from './_types';

export const KIT_OVERRIDES: Record<string, KitOverride> = {
  // Example: a kit that grants +2 max stamina when wielding a heavy weapon
  'wrath': {
    attachments: [
      // Note: actual rules will vary; verify against source markdown.
    ],
  },
};
```

**Open detail for the implementer:** The real shape of these entries depends on what the kit markdown says about leveled-treasure interaction. If the rule is "weapon-keyword armor grants +X stability," encode as:

```ts
{
  source: {
    kind: 'kit-keyword-bonus',
    id: 'wrath.heavy-weapon-stability',
    requireCanonSlug: 'attachment.kit-keyword-bonus',
  },
  condition: { kind: 'kit-has-keyword', keyword: 'heavy-weapon' },
  effect: { kind: 'stat-mod', stat: 'stability', delta: 2 },
}
```

The actual rule set may be narrow — if after surveying the source you find no kit has runtime-gating bonuses (only equipped-item interactions, which fall under `ITEM_OVERRIDES`), document that and leave `KIT_OVERRIDES` empty.

- [ ] **Step 3: Add a regression test**

In `packages/rules/tests/attachments/collectors/kit.spec.ts` (create):

```ts
import { describe, expect, it } from 'vitest';
import { collectFromKit } from '../../../src/attachments/collectors/kit';
import { CharacterSchema } from '@ironyard/shared';

describe('collectFromKit — keyword-gated bonuses', () => {
  it('emits no keyword-gated attachments for kits without overrides', () => {
    const char = CharacterSchema.parse({ kitId: 'arcane-archer' });
    const out = collectFromKit(char, {
      ancestries: new Map(),
      careers: new Map(),
      classes: new Map(),
      kits: new Map([
        ['arcane-archer', {
          id: 'arcane-archer',
          name: 'Arcane Archer',
          staminaBonus: 0,
          speedBonus: 1,
          stabilityBonus: 0,
          meleeDamageBonus: 0,
          rangedDamageBonus: 2,
          keywords: [],
        }],
      ]) as never,
      abilities: new Map(),
      items: new Map(),
      titles: new Map(),
    });
    // Should emit the speed-bonus stat-mod but no kit-keyword-bonus attachments.
    expect(out.filter((a) => a.source.kind === 'kit-keyword-bonus')).toEqual([]);
    expect(out.some((a) => a.effect.kind === 'stat-mod' && a.effect.stat === 'speed')).toBe(true);
  });
});
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @ironyard/rules test
```
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/data/overrides/kits.ts packages/rules/tests/attachments/collectors/
git commit -m "$(cat <<'EOF'
feat(data): kit-keyword-gated overrides

Populates KIT_OVERRIDES for kits whose leveled-treasure interactions
fold into runtime via kit-has-keyword conditions. Coverage limited to
kits whose source markdown explicitly defines a runtime-gating bonus.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 4.7: Populate ancestry-trait + class-feature overrides

**Files:**
- Modify: `packages/data/overrides/abilities.ts`
- Modify: `packages/data/overrides/ancestries.ts` (existing — may need attachment fields)

This task is the biggest content sweep. The implementer should:

1. Read `.reference/data-md/Rules/Ancestries/*.md` and identify ancestry traits whose effects fold into runtime (skill grants, immunity grants, stat mods) and aren't already exposed via `ancestry.grantedImmunities` or DK Wyrmplate / Prismatic.
2. For each such trait, identify whether it sits as a purchasable trait under `purchasableTraits[]` (already in schema) or as a flat ancestry-wide effect, and author an attachment in the right override file.
3. Survey `.reference/data-md/Rules/Abilities/{class}/**/*.md` for ability features (`feature_type: feature`) that grant runtime effects when picked at a given level. Author entries in `ABILITY_OVERRIDES`.

The criterion is: every fresh PC at any level 1-10 should have a correct derived runtime. Run the full test suite + spot-check a level-10 PC of each class against the source rules to validate.

- [ ] **Step 1: Survey ancestry traits**

```bash
grep -l "purchasable" .reference/data-md/Rules/Ancestries/*.md 2>/dev/null
```

For each, read the trait list. Categorize: skill grant, immunity, stat mod, conditional effect, or non-mechanical (flavor only).

- [ ] **Step 2: Survey class features**

```bash
grep -lE "feature_type: ?feature" .reference/data-md/Rules/Abilities/**/*.md 2>/dev/null | head
```

For each class feature with a structural effect, identify the level it's gained at and the runtime impact.

- [ ] **Step 3: Author the override entries**

For ancestry traits, depending on whether the ancestry schema already accommodates per-trait attachments, either:

(a) extend `AncestrySchema.purchasableTraits[N].attachments?: CharacterAttachment[]` and read it from `collectFromAncestry`, OR

(b) extend `collectFromAncestry` to consult an `ANCESTRY_TRAIT_OVERRIDES` map keyed by `{ancestryId}.{traitId}`.

Option (a) is preferable — keeps trait data colocated with the trait. Decide and implement.

For class features, populate `ABILITY_OVERRIDES`:

```ts
export const ABILITY_OVERRIDES: Record<string, AbilityOverride> = {
  'tactician-tactical-awareness': {
    attachments: [
      {
        source: {
          kind: 'class-feature',
          id: 'tactician.tactical-awareness',
          requireCanonSlug: 'attachment.class-feature',
        },
        effect: { kind: 'stat-mod', stat: 'stability', delta: 1 },
      },
    ],
  },
  // … one entry per stat-touching class feature
};
```

- [ ] **Step 4: Spot-check fresh PCs**

In a scratch test or via a quick repl/script, derive runtime for a level-10 PC of each class and compare against expected values from the Draw Steel rulebook (user is the tiebreaker per CLAUDE.md memory).

Document any spot-check mismatches you can't resolve from source markdown and ask the user. Do NOT silently leave incorrect values.

- [ ] **Step 5: Stub `attachment.class-feature` canon slug**

Add to `rules-canon.md` if not present.

- [ ] **Step 6: Run full test suite**

```bash
pnpm test && pnpm typecheck && pnpm lint
```
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add packages/data/overrides/ packages/rules/ docs/rules-canon.md packages/shared/
git commit -m "$(cat <<'EOF'
feat(data): comprehensive ancestry-trait + class-feature overrides

Populates ABILITY_OVERRIDES (and AncestrySchema.purchasableTraits[].attachments
if that path was chosen) for every stat-touching ancestry trait and class
feature in the canon catalog. Coverage bar: fresh PCs level 1-10 derive
correctly across all six classes + every ancestry.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 4.8: Slice 4 close — full verify + coverage snapshot

- [ ] **Step 1: Build a level-10 fixture per class**

In `packages/rules/__fixtures__/` (create if missing), author one fixture per class — level 10, with a representative ancestry + kit + level picks. JSON file format:

```json
{
  "level": 10,
  "ancestryId": "human",
  "classId": "tactician",
  "kitId": "wrath",
  "levelChoices": { "1": { "abilityIds": ["tactician-..."], "subclassAbilityIds": [] }, "...": "..." },
  "...": "..."
}
```

(Use realistic ability ids from the regenerated `abilities.json`.)

- [ ] **Step 2: Snapshot test**

In `packages/rules/tests/attachments/full-pc.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deriveCharacterRuntime } from '../../src/derive-character-runtime';
import { CharacterSchema } from '@ironyard/shared';
// Build a StaticDataBundle helper that loads from apps/api/src/data/.

describe('full-PC derivation snapshot — level 10', () => {
  for (const fixture of ['tactician-l10', 'fury-l10', 'censor-l10' /* …all classes */]) {
    it(`${fixture} matches snapshot`, () => {
      const char = CharacterSchema.parse(
        JSON.parse(readFileSync(resolve(__dirname, `../../__fixtures__/${fixture}.json`), 'utf8')),
      );
      const runtime = deriveCharacterRuntime(char, loadBundleFromApi());
      expect(runtime).toMatchSnapshot();
    });
  }
});

function loadBundleFromApi() {
  // Read bare-array JSONs from apps/api/src/data/ and build the bundle.
  // Implementation left to the engineer.
}
```

Snapshots provide regression coverage; if a future override change shifts a level-10 PC's stats unexpectedly, the snapshot test catches it.

- [ ] **Step 3: Full verify**

```bash
pnpm test && pnpm typecheck && pnpm lint
```
Expected: green. Snapshots written on first run.

- [ ] **Step 4: Commit fixtures + snapshots**

```bash
git add packages/rules/__fixtures__/ packages/rules/tests/attachments/full-pc.spec.ts
git commit -m "$(cat <<'EOF'
test(rules): level-10 per-class snapshot tests

Regression coverage for the comprehensive ancestry/class/kit override
population.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Slice 5: Canonical-example item + title overrides

### Task 5.1: One artifact override + smoke test

**Files:**
- Modify: `packages/data/overrides/items.ts`
- Test: `packages/rules/tests/attachments/collectors/items.spec.ts` (create)

- [ ] **Step 1: Pick an artifact**

```bash
ls .reference/data-md/Rules/Treasures/Artifacts/
```

Pick one whose effect maps cleanly to a `stat-mod`, `immunity`, or `grant-ability` attachment. Read its markdown to confirm the rule.

- [ ] **Step 2: Author the override**

In `packages/data/overrides/items.ts`:

```ts
import type { ItemOverride } from './_types';

export const ITEM_OVERRIDES: Record<string, ItemOverride> = {
  '<artifact-item-id>': {
    attachments: [
      {
        source: {
          kind: 'item',
          id: '<artifact-item-id>',
          requireCanonSlug: 'attachment.item-grant',
        },
        effect: { kind: 'stat-mod', stat: 'maxStamina', delta: 5 },
      },
    ],
  },
};
```

(Replace placeholders with real values from the artifact's rules.)

- [ ] **Step 3: Smoke test**

```ts
import { describe, expect, it } from 'vitest';
import { collectFromItems } from '../../../src/attachments/collectors/items';
import { CharacterSchema } from '@ironyard/shared';

describe('collectFromItems — artifact', () => {
  it('emits attachments for equipped artifact', () => {
    const char = CharacterSchema.parse({
      inventory: [{ itemId: '<artifact-item-id>', quantity: 1, equipped: true }],
    });
    const out = collectFromItems(char, /* bundle stub */ {} as never);
    expect(out.length).toBeGreaterThan(0);
    expect(out[0]?.source.kind).toBe('item');
  });

  it('skips attachments for unequipped artifact', () => {
    const char = CharacterSchema.parse({
      inventory: [{ itemId: '<artifact-item-id>', quantity: 1, equipped: false }],
    });
    const out = collectFromItems(char, {} as never);
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 4: Run + commit**

```bash
pnpm test
git add packages/data/overrides/items.ts packages/rules/tests/attachments/collectors/items.spec.ts
git commit -m "$(cat <<'EOF'
feat(data): canonical artifact override + smoke test

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 5.2: One leveled-treasure override + smoke test

Same pattern as Task 5.1. Pick a leveled treasure with a clear runtime effect (e.g. a weapon that grants stat-mod or immunity when equipped) and author + test.

- [ ] **Step 1-4:** mirror Task 5.1, swapping "artifact" for "leveled treasure".

```bash
git commit -m "feat(data): canonical leveled-treasure override + smoke test

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
"
```

### Task 5.3: One trinket override + smoke test

Same pattern. Pick a trinket whose effect folds into runtime.

- [ ] **Step 1-4:** mirror Task 5.1, swapping "artifact" for "trinket".

```bash
git commit -m "feat(data): canonical trinket override + smoke test

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
"
```

### Task 5.4: Title override with `stat-mod` + smoke test

**Files:**
- Modify: `packages/data/overrides/titles.ts`
- Test: `packages/rules/tests/attachments/collectors/title.spec.ts` (create)

- [ ] **Step 1: Pick a title**

```bash
ls .reference/data-md/Rules/Titles/
```

Find one that grants a stat bonus.

- [ ] **Step 2: Author**

```ts
import type { TitleOverride } from './_types';

export const TITLE_OVERRIDES: Record<string, TitleOverride> = {
  '<title-id>': {
    attachments: [
      {
        source: {
          kind: 'title',
          id: '<title-id>',
          requireCanonSlug: 'attachment.title-grant',
        },
        effect: { kind: 'stat-mod', stat: 'speed', delta: 1 },
      },
    ],
  },
};
```

- [ ] **Step 3: Smoke test + commit**

```ts
import { describe, expect, it } from 'vitest';
import { collectFromTitle } from '../../../src/attachments/collectors/title';
import { CharacterSchema } from '@ironyard/shared';

describe('collectFromTitle — stat-mod', () => {
  it('emits attachment when character.titleId matches override', () => {
    const char = CharacterSchema.parse({ titleId: '<title-id>' });
    const out = collectFromTitle(char, {} as never);
    expect(out.length).toBeGreaterThan(0);
  });
});
```

```bash
pnpm test
git add packages/data/overrides/titles.ts packages/rules/tests/attachments/collectors/title.spec.ts
git commit -m "feat(data): canonical title (stat-mod) override + smoke test

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
"
```

### Task 5.5: Title override with `grant-ability` + smoke test

Same pattern, different title. Find a title that grants a new ability when active.

- [ ] **Step 1-3:** mirror Task 5.4 with `grant-ability` effect.

```bash
git commit -m "feat(data): canonical title (grant-ability) override + smoke test

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
"
```

### Task 5.6: Slice 5 close — full verify

```bash
pnpm test && pnpm typecheck && pnpm lint
```
Expected: green.

---

## Slice 6: `requireCanon` slugs + two-gate verification

### Task 6.1: Catalog every slug used in the codebase

- [ ] **Step 1: List all slugs**

```bash
grep -rhn "requireCanonSlug: '" packages/ apps/ | grep -oE "'attachment\.[a-z-]+'" | sort -u
```

Capture the list. Expected at minimum:
- `attachment.ancestry-granted-immunity`
- `attachment.ancestry-signature-ability`
- `attachment.dragon-knight-wyrmplate`
- `attachment.dragon-knight-prismatic-scales`
- `attachment.kit-stamina-bonus`
- `attachment.kit-stability-bonus`
- `attachment.kit-melee-damage-bonus`
- `attachment.kit-speed-bonus`
- `attachment.kit-keyword-bonus`
- `attachment.class-feature`
- `attachment.item-grant`
- `attachment.title-grant`

### Task 6.2: Add canon entries (source check)

**Files:**
- Modify: `docs/rules-canon.md`

- [ ] **Step 1: For each slug, write a source-check row**

For each slug, the row should cite where in the Draw Steel rulebook the rule lives (page reference) and the verbatim quote that supports the engine's behavior. Follow the column structure already in `rules-canon.md`.

Mark the source-check gate as ✅ (sources verified) but the manual-review gate as ⬜ until the user reviews.

- [ ] **Step 2: Run canon-status regeneration**

```bash
# Whatever script regenerates packages/rules/src/canon-status.generated.ts
# Confirm by inspecting package.json scripts or build.ts.
```

- [ ] **Step 3: Commit**

```bash
git add docs/rules-canon.md packages/rules/src/canon-status.generated.ts
git commit -m "$(cat <<'EOF'
docs(canon): attachment slugs — source check pass

Adds rules-canon entries for every attachment.* slug used by the
activation engine. Source-check gate passes; manual review gate
pending user.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 6.3: Manual user-review pass

- [ ] **Step 1: Hand off to the user**

The user reviews each row. For each one they approve, flip the manual-review gate to ✅. They may ask clarifying questions or push back on interpretation — file those as `docs/rule-questions.md` entries per the workflow.

- [ ] **Step 2: Regenerate canon-status and commit per their approvals**

```bash
git add docs/rules-canon.md packages/rules/src/canon-status.generated.ts
git commit -m "$(cat <<'EOF'
docs(canon): attachment slugs — manual review approvals

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 6.4: Verify non-✅ slugs skip silently

- [ ] **Step 1: Temporarily flip one slug to non-✅ in a test**

In a scratch unit test or by editing `canon-status.generated.ts` temporarily:

```ts
import { applyAttachments } from '../../src/attachments/apply';

it('non-canon slug causes attachment to skip silently', () => {
  // Construct an attachment with requireCanonSlug that points at a non-✅ entry.
  // Verify out.maxStamina is unchanged.
});
```

- [ ] **Step 2: Verify the test passes**

```bash
pnpm --filter @ironyard/rules test
```

- [ ] **Step 3: Revert the temporary slug flip + commit the test**

```bash
git add packages/rules/tests/
git commit -m "$(cat <<'EOF'
test(rules): non-canon slug causes attachment to skip silently

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 6.5: Slice 6 close + epic close

- [ ] **Step 1: Full verify**

```bash
pnpm test && pnpm typecheck && pnpm lint
```

- [ ] **Step 2: Hit every acceptance criterion**

Walk through the spec's [Acceptance](../specs/2026-05-12-phase-2-epic-2b-attachment-engine-design.md#acceptance) list. For each criterion, point at the task that satisfies it and confirm green.

- [ ] **Step 3: Ship note**

In `docs/phases.md` § Phase 2 Epic 2, update the 2B status from "(not yet specced)" to "(shipped — see plan)" with a one-line summary of what's done. Mirror 2A's shipping-note pattern.

- [ ] **Step 4: Commit**

```bash
git add docs/phases.md
git commit -m "$(cat <<'EOF'
docs: Phase 2 Epic 2B shipping note

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-review checklist (for the implementer to run after each slice)

- [ ] All tests green (`pnpm test`)
- [ ] Typecheck clean (`pnpm typecheck`)
- [ ] Lint clean (`pnpm lint`)
- [ ] No `any` introduced without an explicit justification comment
- [ ] No `as` casts that bypass schema validation at trust boundaries
- [ ] No direct state mutation outside of `applyAttachments`
- [ ] No `SteelCompendium` text committed to D1 or to the repo outside `.reference/`
- [ ] Every new `requireCanonSlug` has a corresponding row in `docs/rules-canon.md`
- [ ] Every new collector returns deterministic output for a fixed input (pure function)
