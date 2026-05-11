// Monster data accessor for the API Worker. The JSON is copied from
// apps/web/public/data/monsters.json at build time (currently a manual copy;
// TODO: wire packages/data/build.ts to also write to apps/api/src/data/).
//
// The file is gitignored (see root .gitignore: apps/web/public/data/ and the
// api/src/data/ entry added alongside) so it must be present locally and in CI.

import { type Monster, MonsterFileSchema } from '@ironyard/shared';
import monstersJson from './monsters.json';

// Parse once at module load (lazy on first access).
let cache: Map<string, Monster> | null = null;

function ensureCache(): Map<string, Monster> {
  if (cache) return cache;
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
  cache = map;
  return cache;
}

export function loadMonsterById(id: string): Monster | null {
  return ensureCache().get(id) ?? null;
}
