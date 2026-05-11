import { type Monster, MonsterSchema } from '@ironyard/shared';
import matter from 'gray-matter';

export type ParseResult = { ok: true; monster: Monster } | { ok: false; reason: string };

export function slugifyMonster(name: string, level: number): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${base}-l${level}`;
}

// Parses a single SteelCompendium markdown statblock file (frontmatter only —
// Phase 1 slice 2 ships id/name/level). Later slices will extend the parser to
// pull stamina/EV/immunities/features from the body table + frontmatter.
export function parseMonsterMarkdown(content: string): ParseResult {
  let fm: Record<string, unknown>;
  try {
    fm = matter(content).data as Record<string, unknown>;
  } catch (e) {
    return { ok: false, reason: `frontmatter parse failed: ${(e as Error).message}` };
  }

  const name = typeof fm.item_name === 'string' ? fm.item_name : null;
  const level = typeof fm.level === 'number' ? fm.level : null;
  if (!name) return { ok: false, reason: 'missing item_name' };
  if (level === null) return { ok: false, reason: 'missing level' };

  // Always derive the id from name+level. The source's `item_id` collides
  // across levels for some monster families (e.g. Rival Conduit at multiple
  // levels all share `rival-conduit`), so it's informational only.
  const id = slugifyMonster(name, level);

  const parsed = MonsterSchema.safeParse({ id, name, level });
  if (!parsed.success) {
    return { ok: false, reason: `schema validation: ${parsed.error.message}` };
  }
  return { ok: true, monster: parsed.data };
}
