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

function pct(n: number, d: number): string {
  if (d === 0) return '—';
  return `${((n / d) * 100).toFixed(1)}%`;
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
  let totalFiles = 0;

  for (const file of walkStatblockFiles(MONSTERS_DIR)) {
    totalFiles += 1;
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

  // Coverage counters — every monster that parsed has these fields, but they
  // may be empty/zero for legit reasons (e.g. no immunities). We count the
  // populated subset to surface parser-quality regressions over time.
  // Per-tier damage parse coverage — counts how many tier outcomes (3 per
  // powerRoll) have parseable structured damage. Effect-only tiers (e.g.
  // "the target is Slowed") legitimately have damage=null and are not
  // counted as failures, just as different.
  let totalTierOutcomes = 0;
  let tiersWithDamage = 0;
  let tiersWithConditions = 0;
  for (const m of deduped) {
    for (const a of m.abilities) {
      if (!a.powerRoll) continue;
      for (const tier of [a.powerRoll.tier1, a.powerRoll.tier2, a.powerRoll.tier3]) {
        totalTierOutcomes += 1;
        if (tier.damage !== null) tiersWithDamage += 1;
        if (tier.conditions.length > 0) tiersWithConditions += 1;
      }
    }
  }

  const cov = {
    total: deduped.length,
    withStamina: deduped.filter((m) => m.stamina.base > 0).length,
    withEv: deduped.filter((m) => m.ev.ev > 0).length,
    withCharacteristics: deduped.filter((m) => {
      const c = m.characteristics;
      // Five-zero is improbable for a real monster; flag it as "not populated".
      return [c.might, c.agility, c.reason, c.intuition, c.presence].some((v) => v !== 0);
    }).length,
    withAbilities: deduped.filter((m) => m.abilities.length > 0).length,
    withAnyImmunity: deduped.filter((m) => m.immunities.length > 0 || m.immunityNote).length,
    withAnyWeakness: deduped.filter((m) => m.weaknesses.length > 0 || m.weaknessNote).length,
    totalAbilityBlocks: deduped.reduce((sum, m) => sum + m.abilities.length, 0),
    parsedAbilityBlocks: deduped.reduce(
      (sum, m) =>
        sum +
        m.abilities.filter((a) => a.powerRoll || a.effect || a.trigger || a.type === 'trait')
          .length,
      0,
    ),
    totalTierOutcomes,
    tiersWithDamage,
    tiersWithConditions,
  };

  const out: MonsterFile = {
    version: loadSourcesPin(),
    generatedAt: Date.now(),
    count: deduped.length,
    monsters: deduped,
    coverage: cov,
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, `${JSON.stringify(out, null, 2)}\n`);

  console.log(
    `build:data — wrote ${deduped.length} monsters to apps/web/public/data/monsters.json`,
  );
  console.log(`  version pin: ${out.version}`);
  console.log(`  source files scanned: ${totalFiles}`);
  console.log(`  parsed monsters:      ${deduped.length}  (${pct(deduped.length, totalFiles)})`);
  console.log('  coverage:');
  console.log(
    `    stamina:           ${cov.withStamina}/${cov.total}  (${pct(cov.withStamina, cov.total)})`,
  );
  console.log(`    ev:                ${cov.withEv}/${cov.total}  (${pct(cov.withEv, cov.total)})`);
  console.log(
    `    characteristics:   ${cov.withCharacteristics}/${cov.total}  (${pct(cov.withCharacteristics, cov.total)})`,
  );
  console.log(
    `    abilities:         ${cov.withAbilities}/${cov.total}  (${pct(cov.withAbilities, cov.total)})`,
  );
  console.log(
    `    any immunity:      ${cov.withAnyImmunity}/${cov.total}  (${pct(cov.withAnyImmunity, cov.total)})`,
  );
  console.log(
    `    any weakness:      ${cov.withAnyWeakness}/${cov.total}  (${pct(cov.withAnyWeakness, cov.total)})`,
  );
  console.log(
    `    ability blocks:    ${cov.parsedAbilityBlocks}/${cov.totalAbilityBlocks}  (${pct(cov.parsedAbilityBlocks, cov.totalAbilityBlocks)})`,
  );
  console.log(
    `    tier damage:       ${cov.tiersWithDamage}/${cov.totalTierOutcomes}  (${pct(cov.tiersWithDamage, cov.totalTierOutcomes)})`,
  );
  console.log(
    `    tier conditions:   ${cov.tiersWithConditions}/${cov.totalTierOutcomes}  (${pct(cov.tiersWithConditions, cov.totalTierOutcomes)})`,
  );

  if (errors.length > 0) {
    console.warn(`  ${errors.length} file(s) skipped:`);
    for (const e of errors.slice(0, 20)) {
      console.warn(`    ${e.file.replace(REPO_ROOT, '.')}: ${e.reason}`);
    }
    if (errors.length > 20) console.warn(`    … and ${errors.length - 20} more`);
  }
}

main();
