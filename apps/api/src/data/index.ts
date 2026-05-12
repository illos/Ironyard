// Data accessors for the API Worker. JSON files are written to this directory
// by `pnpm build:data` (packages/data/build.ts). Each file ships as a tracked
// empty-array / empty-object placeholder so imports resolve on a fresh clone or
// in CI without a data build step. `pnpm build:data` overwrites them locally
// with the full SteelCompendium ingest — see .gitignore for the skip-worktree
// instructions that suppress those diffs.

import {
  AbilitySchema,
  AncestrySchema,
  CareerSchema,
  ClassSchema,
  ItemSchema,
  type Monster,
  MonsterFileSchema,
  TitleSchema,
} from '@ironyard/shared';
import type { StaticDataBundle } from '@ironyard/rules';
import { ResolvedKitSchema } from '@ironyard/rules';
import monstersJson from './monsters.json';
import classesRaw from './classes.json';
import kitsRaw from './kits.json';
import ancestriesRaw from './ancestries.json';
import careersRaw from './careers.json';
import abilitiesRaw from './abilities.json';
import itemsRaw from './items.json';
import titlesRaw from './titles.json';

// ── Monsters ────────────────────────────────────────────────────────────────

// Parse once at module load (lazy on first access).
let monsterCache: Map<string, Monster> | null = null;

function ensureMonsterCache(): Map<string, Monster> {
  if (monsterCache) return monsterCache;
  const parsed = MonsterFileSchema.safeParse(monstersJson);
  const map = new Map<string, Monster>();
  if (parsed.success) {
    for (const monster of parsed.data.monsters) {
      map.set(monster.id, monster);
    }
  } else {
    // Log parse errors but don't crash — the Worker should still boot.
    // Missing monsters will be reported as monster_not_found at dispatch time.
    console.error('[data] monsters.json failed schema validation:', parsed.error.message);
    // Fall back to raw array — iterate and individually validate.
    const raw = (monstersJson as { monsters?: unknown[] }).monsters ?? [];
    for (const item of raw) {
      const r = MonsterFileSchema.shape.monsters.element.safeParse(item);
      if (r.success) map.set(r.data.id, r.data);
    }
  }
  monsterCache = map;
  return monsterCache;
}

export function loadMonsterById(id: string): Monster | null {
  return ensureMonsterCache().get(id) ?? null;
}

// ── StaticDataBundle ─────────────────────────────────────────────────────────
// Assembled once at module load; cached for the lifetime of the Worker
// isolate. Passed as ReducerContext.staticData into every applyIntent call
// so StartEncounter can materialize PC participants via deriveCharacterRuntime.

let bundleCache: StaticDataBundle | null = null;

export function getStaticDataBundle(): StaticDataBundle {
  if (bundleCache) return bundleCache;

  const ancestries: StaticDataBundle['ancestries'] = new Map();
  for (const item of ancestriesRaw as unknown[]) {
    const parsed = AncestrySchema.safeParse(item);
    if (parsed.success) ancestries.set(parsed.data.id, parsed.data);
  }

  const careers: StaticDataBundle['careers'] = new Map();
  for (const item of careersRaw as unknown[]) {
    const parsed = CareerSchema.safeParse(item);
    if (parsed.success) careers.set(parsed.data.id, parsed.data);
  }

  const classes: StaticDataBundle['classes'] = new Map();
  for (const item of classesRaw as unknown[]) {
    const parsed = ClassSchema.safeParse(item);
    if (parsed.success) classes.set(parsed.data.id, parsed.data);
  }

  const kits: StaticDataBundle['kits'] = new Map();
  for (const item of kitsRaw as unknown[]) {
    const parsed = ResolvedKitSchema.safeParse(item);
    if (parsed.success) kits.set(parsed.data.id, parsed.data);
  }

  const abilities: StaticDataBundle['abilities'] = new Map();
  for (const item of abilitiesRaw as unknown[]) {
    const parsed = AbilitySchema.safeParse(item);
    if (parsed.success) abilities.set(parsed.data.id, parsed.data);
  }

  const items: StaticDataBundle['items'] = new Map();
  for (const item of itemsRaw as unknown[]) {
    const parsed = ItemSchema.safeParse(item);
    if (parsed.success) items.set(parsed.data.id, parsed.data);
  }

  const titles: StaticDataBundle['titles'] = new Map();
  for (const item of titlesRaw as unknown[]) {
    const parsed = TitleSchema.safeParse(item);
    if (parsed.success) titles.set(parsed.data.id, parsed.data);
  }

  bundleCache = { ancestries, careers, classes, kits, abilities, items, titles };
  return bundleCache;
}
