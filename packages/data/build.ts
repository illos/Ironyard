import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  Ability,
  Ancestry,
  AncestryFile,
  Career,
  CareerFile,
  ClassFile,
  Complication,
  ComplicationFile,
  HeroClass,
  Item,
  Kit,
  KitFile,
  Monster,
  MonsterFile,
  Title,
} from '@ironyard/shared';
import { ANCESTRY_OVERRIDES } from './overrides/ancestries';
import { parseAncestryMarkdown } from './src/parse-ancestry';
import { parseCareerMarkdown } from './src/parse-career';
import { parseClassMarkdown } from './src/parse-class';
import { parseComplicationMarkdown } from './src/parse-complication';
import { parseItemMarkdown } from './src/parse-item';
import { parseKitMarkdown } from './src/parse-kit';
import { parseAbilityMarkdown } from './src/parse-ability';
import { parseMonsterMarkdown } from './src/parse-monster';
import { parseTitleMarkdown } from './src/parse-title';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, '../..');

// Phase 1 slice 2: read from the local data-md clone in .reference (gitignored).
// CI will need a tarball-fetch step once the build moves off local-only — see
// docs/data-pipeline.md for the planned shape.
const DATA_MD = process.env.DATA_MD_PATH ?? join(REPO_ROOT, '.reference/data-md');
const RULES_DIR = join(DATA_MD, 'Rules');
const MONSTERS_DIR = join(DATA_MD, 'Bestiary/Monsters/Monsters');
const OUT_PATH = join(REPO_ROOT, 'apps/web/public/data/monsters.json');
// Also emit a copy for the API Worker so it can look up monsters at stamping time.
const API_OUT_PATH = join(REPO_ROOT, 'apps/api/src/data/monsters.json');

const ANCESTRIES_OUT = join(REPO_ROOT, 'apps/web/public/data/ancestries.json');
const CAREERS_OUT = join(REPO_ROOT, 'apps/web/public/data/careers.json');
const COMPLICATIONS_OUT = join(REPO_ROOT, 'apps/web/public/data/complications.json');
const CLASSES_OUT = join(REPO_ROOT, 'apps/web/public/data/classes.json');
// kits.json: populated by Phase 2 Epic 2 kit ingestion.
const KITS_OUT = join(REPO_ROOT, 'apps/web/public/data/kits.json');
const API_KITS_OUT = join(REPO_ROOT, 'apps/api/src/data/kits.json');
// items.json: populated by Phase 2 Epic 2A item ingestion.
const ITEMS_OUT = join(REPO_ROOT, 'apps/web/public/data/items.json');
const API_ITEMS_OUT = join(REPO_ROOT, 'apps/api/src/data/items.json');
const TREASURES_DIR = join(RULES_DIR, 'Treasures');
// abilities.json: populated by Phase 2 Epic 2A ability ingestion (Slice 3).
const ABILITIES_OUT = join(REPO_ROOT, 'apps/web/public/data/abilities.json');
const API_ABILITIES_OUT = join(REPO_ROOT, 'apps/api/src/data/abilities.json');
const ABILITIES_DIR = join(RULES_DIR, 'Abilities');
// titles.json: populated by Phase 2 Epic 2A title ingestion (Slice 4).
const TITLES_OUT = join(REPO_ROOT, 'apps/web/public/data/titles.json');
const API_TITLES_OUT = join(REPO_ROOT, 'apps/api/src/data/titles.json');
const TITLES_DIR = join(RULES_DIR, 'Titles');

// API Worker data — flat arrays (no wrapper) so getStaticDataBundle() can
// iterate and parse them with their individual schemas. Mirroring the
// monsters.json pattern where the API file is a subset / alternate shape.
const API_ANCESTRIES_OUT = join(REPO_ROOT, 'apps/api/src/data/ancestries.json');
const API_CAREERS_OUT = join(REPO_ROOT, 'apps/api/src/data/careers.json');
const API_CLASSES_OUT = join(REPO_ROOT, 'apps/api/src/data/classes.json');

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
  const version = loadSourcesPin();

  // ── Rules data (character creation) ────────────────────────────────────
  buildAncestries(version);
  buildCareers(version);
  buildComplications(version);
  buildClasses(version);

  // ── Kits ─────────────────────────────────────────────────────────────────
  buildKits(version);

  // ── Items (Treasures) ───────────────────────────────────────────────────
  buildItems();

  // ── PC Abilities ─────────────────────────────────────────────────────────
  buildAbilities();

  // ── Titles ───────────────────────────────────────────────────────────────
  buildTitles();

  // ── Monsters ────────────────────────────────────────────────────────────
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
    version,
    generatedAt: Date.now(),
    count: deduped.length,
    monsters: deduped,
    coverage: cov,
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, `${JSON.stringify(out, null, 2)}\n`);

  // Mirror to the API Worker data directory so the stamping pipeline can load monsters.
  mkdirSync(dirname(API_OUT_PATH), { recursive: true });
  writeFileSync(API_OUT_PATH, `${JSON.stringify(out, null, 2)}\n`);

  console.log(
    `build:data — wrote ${deduped.length} monsters to apps/web/public/data/monsters.json`,
  );
  console.log('             mirrored to apps/api/src/data/monsters.json');
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

// ── Recursive markdown file walker ───────────────────────────────────────────

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

// ── Ancestry build ────────────────────────────────────────────────────────────

function buildAncestries(version: string): void {
  const dir = join(RULES_DIR, 'Ancestries');
  const ancestries: Ancestry[] = [];
  const errors: Array<{ file: string; reason: string }> = [];

  let entries: string[];
  try {
    entries = readdirSync(dir).filter((f) => f.endsWith('.md') && !f.startsWith('_'));
  } catch {
    console.error(`build:data — ancestries dir not found at ${dir}`);
    return;
  }

  for (const entry of entries) {
    const file = join(dir, entry);
    const content = readFileSync(file, 'utf-8');
    const result = parseAncestryMarkdown(content);
    if (!result.ok) {
      errors.push({ file: entry, reason: result.reason });
    } else {
      ancestries.push(result.ancestry);
    }
  }

  // Fold in hand-authored override fields (size, speed, immunities, signatureAbilityId).
  // Overrides win; schema defaults apply when neither the parser nor the override table
  // provides a value.
  const enrichedAncestries = ancestries.map((a) => {
    const o = ANCESTRY_OVERRIDES[a.id] ?? {};
    return {
      ...a,
      defaultSize: o.defaultSize ?? a.defaultSize ?? '1M',
      defaultSpeed: o.defaultSpeed ?? a.defaultSpeed ?? 5,
      grantedImmunities: o.grantedImmunities ?? a.grantedImmunities ?? [],
      signatureAbilityId: o.signatureAbilityId !== undefined ? o.signatureAbilityId : (a.signatureAbilityId ?? null),
    };
  });

  enrichedAncestries.sort((a, b) => a.name.localeCompare(b.name));

  const out: AncestryFile = {
    version,
    generatedAt: Date.now(),
    count: enrichedAncestries.length,
    ancestries: enrichedAncestries,
  };
  mkdirSync(dirname(ANCESTRIES_OUT), { recursive: true });
  writeFileSync(ANCESTRIES_OUT, `${JSON.stringify(out, null, 2)}\n`);
  // Mirror flat array to API Worker data directory.
  mkdirSync(dirname(API_ANCESTRIES_OUT), { recursive: true });
  writeFileSync(API_ANCESTRIES_OUT, `${JSON.stringify(enrichedAncestries, null, 2)}\n`);
  console.log(
    `build:data — wrote ${enrichedAncestries.length} ancestries to apps/web/public/data/ancestries.json`,
  );
  console.log('             mirrored to apps/api/src/data/ancestries.json');
  if (errors.length > 0) {
    for (const e of errors) console.warn(`  skipped ${e.file}: ${e.reason}`);
  }
}

// ── Career build ──────────────────────────────────────────────────────────────

function buildCareers(version: string): void {
  const dir = join(RULES_DIR, 'Careers');
  const careers: Career[] = [];
  const errors: Array<{ file: string; reason: string }> = [];

  let entries: string[];
  try {
    entries = readdirSync(dir).filter((f) => f.endsWith('.md') && !f.startsWith('_'));
  } catch {
    console.error(`build:data — careers dir not found at ${dir}`);
    return;
  }

  for (const entry of entries) {
    const file = join(dir, entry);
    const content = readFileSync(file, 'utf-8');
    const result = parseCareerMarkdown(content);
    if (!result.ok) {
      errors.push({ file: entry, reason: result.reason });
    } else {
      careers.push(result.career);
    }
  }

  careers.sort((a, b) => a.name.localeCompare(b.name));

  const out: CareerFile = { version, generatedAt: Date.now(), count: careers.length, careers };
  mkdirSync(dirname(CAREERS_OUT), { recursive: true });
  writeFileSync(CAREERS_OUT, `${JSON.stringify(out, null, 2)}\n`);
  // Mirror flat array to API Worker data directory.
  mkdirSync(dirname(API_CAREERS_OUT), { recursive: true });
  writeFileSync(API_CAREERS_OUT, `${JSON.stringify(careers, null, 2)}\n`);
  console.log(`build:data — wrote ${careers.length} careers to apps/web/public/data/careers.json`);
  console.log('             mirrored to apps/api/src/data/careers.json');
  if (errors.length > 0) {
    for (const e of errors) console.warn(`  skipped ${e.file}: ${e.reason}`);
  }
}

// ── Complication build ────────────────────────────────────────────────────────

function buildComplications(version: string): void {
  const dir = join(RULES_DIR, 'Complications');
  const complications: Complication[] = [];
  const errors: Array<{ file: string; reason: string }> = [];

  let entries: string[];
  try {
    entries = readdirSync(dir).filter((f) => f.endsWith('.md') && !f.startsWith('_'));
  } catch {
    console.error(`build:data — complications dir not found at ${dir}`);
    return;
  }

  for (const entry of entries) {
    const file = join(dir, entry);
    const content = readFileSync(file, 'utf-8');
    const result = parseComplicationMarkdown(content);
    if (!result.ok) {
      errors.push({ file: entry, reason: result.reason });
    } else {
      complications.push(result.complication);
    }
  }

  complications.sort((a, b) => a.name.localeCompare(b.name));

  const out: ComplicationFile = {
    version,
    generatedAt: Date.now(),
    count: complications.length,
    complications,
  };
  mkdirSync(dirname(COMPLICATIONS_OUT), { recursive: true });
  writeFileSync(COMPLICATIONS_OUT, `${JSON.stringify(out, null, 2)}\n`);
  console.log(
    `build:data — wrote ${complications.length} complications to apps/web/public/data/complications.json`,
  );
  if (errors.length > 0) {
    console.warn(`  ${errors.length} complication(s) skipped:`);
    for (const e of errors.slice(0, 10)) console.warn(`    ${e.file}: ${e.reason}`);
    if (errors.length > 10) console.warn(`    … and ${errors.length - 10} more`);
  }
}

// ── Kit build ─────────────────────────────────────────────────────────────────

function buildKits(version: string): void {
  const dir = join(RULES_DIR, 'Kits');
  const kits: Kit[] = [];
  const errors: Array<{ file: string; reason: string }> = [];

  let entries: string[];
  try {
    entries = readdirSync(dir).filter((f) => f.endsWith('.md'));
  } catch {
    console.error(`build:data — kits dir not found at ${dir}`);
    return;
  }

  for (const entry of entries) {
    const file = join(dir, entry);
    const content = readFileSync(file, 'utf-8');
    const k = parseKitMarkdown(content);
    if (k) {
      kits.push(k);
    }
    // Non-kit pages (Kits Table, _Index) return null — silently skip, not errors.
  }

  kits.sort((a, b) => a.id.localeCompare(b.id));

  const out: KitFile = {
    version,
    generatedAt: Date.now(),
    count: kits.length,
    kits,
  };
  mkdirSync(dirname(KITS_OUT), { recursive: true });
  writeFileSync(KITS_OUT, `${JSON.stringify(out, null, 2)}\n`);
  // Mirror flat array to API Worker data directory.
  mkdirSync(dirname(API_KITS_OUT), { recursive: true });
  writeFileSync(API_KITS_OUT, `${JSON.stringify(kits, null, 2)}\n`);
  console.log(`build:data — wrote ${kits.length} kits to apps/web/public/data/kits.json`);
  console.log('             mirrored to apps/api/src/data/kits.json');
  if (errors.length > 0) {
    for (const e of errors) console.warn(`  skipped ${e.file}: ${e.reason}`);
  }
}

// ── Item build ────────────────────────────────────────────────────────────────

function buildItems(): void {
  let itemFiles: string[];
  try {
    itemFiles = walkMd(TREASURES_DIR);
  } catch {
    console.error(`build:data — treasures dir not found at ${TREASURES_DIR}`);
    return;
  }

  const items: Item[] = [];
  for (const path of itemFiles) {
    const md = readFileSync(path, 'utf-8');
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
  writeFileSync(ITEMS_OUT, `${JSON.stringify(itemsFile, null, 2)}\n`);
  mkdirSync(dirname(API_ITEMS_OUT), { recursive: true });
  writeFileSync(API_ITEMS_OUT, `${JSON.stringify(items, null, 2)}\n`);
  console.log(`build:data — wrote ${items.length} items to apps/web/public/data/items.json`);
  console.log('             mirrored to apps/api/src/data/items.json');
}

// ── Ability build ─────────────────────────────────────────────────────────────

function buildAbilities(): void {
  let abilityFiles: string[];
  try {
    abilityFiles = walkMd(ABILITIES_DIR);
  } catch {
    console.error(`build:data — abilities dir not found at ${ABILITIES_DIR}`);
    return;
  }

  const abilities: Ability[] = [];
  const abilityFailures: string[] = [];

  for (const path of abilityFiles) {
    const md = readFileSync(path, 'utf-8');
    const a = parseAbilityMarkdown(md, path);
    if (a) abilities.push(a);
    else abilityFailures.push(path);
  }

  abilities.sort(
    (a, b) =>
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
  writeFileSync(ABILITIES_OUT, `${JSON.stringify(abilitiesFile, null, 2)}\n`);
  mkdirSync(dirname(API_ABILITIES_OUT), { recursive: true });
  writeFileSync(API_ABILITIES_OUT, `${JSON.stringify(abilities, null, 2)}\n`);

  const structuredCount = abilities.filter((a) => a.powerRoll).length;
  const structuredPct = ((structuredCount / Math.max(1, abilities.length)) * 100).toFixed(1);

  console.log(
    `build:data — wrote ${abilities.length} abilities to apps/web/public/data/abilities.json`,
  );
  console.log('             mirrored to apps/api/src/data/abilities.json');
  console.log(`  abilities with structured powerRoll: ${structuredCount}/${abilities.length} (${structuredPct}%)`);

  if (abilityFailures.length > 0) {
    console.log(`  abilities.json: ${abilityFailures.length} files yielded null (non-ability stubs or unrecognised type)`);
    console.log(`  failures (first 10):\n${abilityFailures.slice(0, 10).map((p) => `    ${p.replace(REPO_ROOT, '.')}`).join('\n')}`);
  }
}

// ── Class build ───────────────────────────────────────────────────────────────

const CLASS_NAMES = [
  'Censor',
  'Conduit',
  'Elementalist',
  'Fury',
  'Null',
  'Shadow',
  'Tactician',
  'Talent',
  'Troubadour',
] as const;

function buildClasses(version: string): void {
  const classesDir = join(RULES_DIR, 'Classes');
  const byLevelDir = join(RULES_DIR, 'Classes By Level');
  const heroClasses: HeroClass[] = [];
  const errors: Array<{ file: string; reason: string }> = [];

  for (const className of CLASS_NAMES) {
    const classFile = join(classesDir, `${className}.md`);
    const basicsFile = join(byLevelDir, className, 'Basics.md');
    let classContent: string;
    let basicsContent: string;
    try {
      classContent = readFileSync(classFile, 'utf-8');
      basicsContent = readFileSync(basicsFile, 'utf-8');
    } catch (e) {
      errors.push({ file: className, reason: `read failed: ${(e as Error).message}` });
      continue;
    }
    const result = parseClassMarkdown(classContent, basicsContent);
    if (!result.ok) {
      errors.push({ file: className, reason: result.reason });
    } else {
      heroClasses.push(result.heroClass);
    }
  }

  heroClasses.sort((a, b) => a.name.localeCompare(b.name));

  const out: ClassFile = {
    version,
    generatedAt: Date.now(),
    count: heroClasses.length,
    classes: heroClasses,
  };
  mkdirSync(dirname(CLASSES_OUT), { recursive: true });
  writeFileSync(CLASSES_OUT, `${JSON.stringify(out, null, 2)}\n`);
  // Mirror flat array to API Worker data directory.
  mkdirSync(dirname(API_CLASSES_OUT), { recursive: true });
  writeFileSync(API_CLASSES_OUT, `${JSON.stringify(heroClasses, null, 2)}\n`);
  console.log(
    `build:data — wrote ${heroClasses.length} classes to apps/web/public/data/classes.json`,
  );
  console.log('             mirrored to apps/api/src/data/classes.json');
  if (errors.length > 0) {
    for (const e of errors) console.warn(`  skipped ${e.file}: ${e.reason}`);
  }
}

// ── Title build ───────────────────────────────────────────────────────────────

function buildTitles(): void {
  let titleFiles: string[];
  try {
    titleFiles = walkMd(TITLES_DIR);
  } catch {
    console.error(`build:data — titles dir not found at ${TITLES_DIR}`);
    return;
  }

  const titles: Title[] = [];
  for (const path of titleFiles) {
    const md = readFileSync(path, 'utf-8');
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
  console.log(`build:data — wrote ${titles.length} titles to apps/web/public/data/titles.json`);
  console.log('             mirrored to apps/api/src/data/titles.json');
}

main();
