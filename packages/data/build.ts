import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Monster, MonsterFile } from '@ironyard/shared';
import { parseMonsterMarkdown } from './src/parse-monster';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, '../..');

// Phase 1 slice 2: read from the local data-md clone in .reference (gitignored).
// CI will need a tarball-fetch step once the build moves off local-only — see
// docs/data-pipeline.md for the planned shape.
const DATA_MD = process.env.DATA_MD_PATH ?? join(REPO_ROOT, '.reference/data-md');
const MONSTERS_DIR = join(DATA_MD, 'Bestiary/Monsters/Monsters');
const OUT_PATH = join(REPO_ROOT, 'apps/web/public/data/monsters.json');

function* walkStatblockFiles(root: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return;
  }
  for (const name of entries) {
    const path = join(root, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      yield* walkStatblockFiles(path);
    } else if (stat.isFile() && name.endsWith('.md') && path.includes('/Statblocks/')) {
      yield path;
    }
  }
}

function loadSourcesPin(): string {
  const sources = JSON.parse(readFileSync(join(here, 'sources.json'), 'utf-8')) as {
    'data-md'?: string;
  };
  return sources['data-md'] ?? 'unknown';
}

function main() {
  try {
    statSync(MONSTERS_DIR);
  } catch {
    console.error(`build:data — monsters dir not found at ${MONSTERS_DIR}`);
    console.error('  set DATA_MD_PATH or clone data-md into .reference/data-md');
    process.exit(1);
  }

  const monsters: Monster[] = [];
  const errors: Array<{ file: string; reason: string }> = [];

  for (const file of walkStatblockFiles(MONSTERS_DIR)) {
    let content: string;
    try {
      content = readFileSync(file, 'utf-8');
    } catch (e) {
      errors.push({ file, reason: `read failed: ${(e as Error).message}` });
      continue;
    }
    const result = parseMonsterMarkdown(content);
    if (!result.ok) {
      errors.push({ file, reason: result.reason });
      continue;
    }
    monsters.push(result.monster);
  }

  // Stable order — by name, then level. Same input → same output for git-diff CI guards later.
  monsters.sort((a, b) => a.name.localeCompare(b.name) || a.level - b.level);

  // Dedup by id, taking the first occurrence. Same id from two files is a data bug;
  // surface it but don't crash the build.
  const seen = new Set<string>();
  const deduped: Monster[] = [];
  for (const m of monsters) {
    if (seen.has(m.id)) {
      errors.push({ file: `(dedup) ${m.id}`, reason: 'duplicate monster id' });
      continue;
    }
    seen.add(m.id);
    deduped.push(m);
  }

  const out: MonsterFile = {
    version: loadSourcesPin(),
    generatedAt: Date.now(),
    count: deduped.length,
    monsters: deduped,
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, `${JSON.stringify(out, null, 2)}\n`);

  console.log(
    `build:data — wrote ${deduped.length} monsters to apps/web/public/data/monsters.json`,
  );
  console.log(`  version pin: ${out.version}`);
  if (errors.length > 0) {
    console.warn(`  ${errors.length} file(s) skipped:`);
    for (const e of errors.slice(0, 10)) {
      console.warn(`    ${e.file}: ${e.reason}`);
    }
    if (errors.length > 10) console.warn(`    … and ${errors.length - 10} more`);
  }
}

main();
