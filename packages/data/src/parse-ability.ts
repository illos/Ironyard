import matter from 'gray-matter';
import type { Ability, AbilityType, PowerRoll } from '@ironyard/shared';
import { AbilitySchema } from '@ironyard/shared';
import { parseTierOutcome } from './parse-monster';

// ── Slug helper ────────────────────────────────────────────────────────────────

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ── Action type mapping ────────────────────────────────────────────────────────

const ACTION_TYPE_MAP: Record<string, AbilityType> = {
  'main action': 'action',
  maneuver: 'maneuver',
  'free maneuver': 'maneuver',
  triggered: 'triggered',
  'free triggered': 'free-triggered',
  'no action': 'trait',
  move: 'maneuver',
};

// Derive AbilityType from the frontmatter `action_type` string.
function parseAbilityType(
  actionType: string | undefined,
  typeField: string,
): AbilityType {
  if (actionType) {
    const key = actionType.trim().toLowerCase();
    const mapped = ACTION_TYPE_MAP[key];
    if (mapped) return mapped;
  }
  // Fallback: derive from the `type` frontmatter field for common abilities.
  // type: common-ability/maneuver → maneuver
  // type: common-ability/main-action → action
  // type: common-ability/move-action → maneuver
  if (typeField.startsWith('common-ability/')) {
    const suffix = typeField.slice('common-ability/'.length);
    if (suffix === 'maneuver') return 'maneuver';
    if (suffix === 'main-action') return 'action';
    if (suffix === 'move-action') return 'maneuver';
  }
  return 'action';
}

// ── Cost parsing ───────────────────────────────────────────────────────────────

function parseCost(fm: Record<string, unknown>): number | null {
  // Numeric heroic resource cost: `cost_amount: 11`
  if (typeof fm.cost_amount === 'number') return fm.cost_amount;

  // Signature abilities: `ability_type: Signature` (no cost — they're free)
  if (
    typeof fm.ability_type === 'string' &&
    fm.ability_type.toLowerCase().includes('signature')
  ) {
    return 0;
  }

  // Some signature abilities have `feature_type: ability` only, no cost field —
  // common / kit abilities don't have a cost at all.
  return null;
}

// ── Level / tier parsing ───────────────────────────────────────────────────────

function parseLevel(fm: Record<string, unknown>): number | null {
  if (typeof fm.level === 'number') return fm.level;
  return null;
}

// ── sourceClassId parsing ──────────────────────────────────────────────────────

function parseSourceClassId(
  fm: Record<string, unknown>,
  filePath: string,
  typeField: string,
): string | null {
  // Class abilities carry `class: fury` etc. (kit abilities carry `class: ignored`)
  if (typeof fm.class === 'string' && fm.class !== 'ignored' && fm.class !== 'combat') {
    return fm.class.toLowerCase();
  }

  // Kit abilities: type is `kit-ability/<kit-slug>`. Use top-level folder "Kits" → "kits".
  if (typeField.startsWith('kit-ability/')) {
    return 'kits';
  }

  // Common abilities: type is `common-ability/<variant>`. Top-level folder "Common" → "common".
  if (typeField.startsWith('common-ability/')) {
    return 'common';
  }

  // Path-based fallback: extract top-level folder under Abilities/
  const m = /\/Abilities\/([^/]+)\//.exec(filePath);
  if (m && m[1]) return m[1].toLowerCase();

  return null;
}

// ── isSubclass heuristic ───────────────────────────────────────────────────────

// Subclass abilities live in a deeper folder like:
//   Abilities/Fury/Berserker/<ability>.md
// But level-feature folders like "1st-Level Features" are NOT subclass folders.
// Kit and Common abilities are never subclass abilities.
function parseIsSubclass(filePath: string, typeField: string): boolean {
  if (typeField.startsWith('kit-ability/') || typeField.startsWith('common-ability/')) {
    return false;
  }
  const m = /\/Abilities\/[^/]+\/([^/]+)\//.exec(filePath);
  if (!m || !m[1]) return false;
  // Feature folders all contain "Feature" or "Level" in their names.
  return !/Features?$|Level/.test(m[1]);
}

// ── Power roll from body content ───────────────────────────────────────────────

// PC ability power roll header format:
//   **Power Roll + Might:**
//   **Power Roll + Agility or Presence:**
//   **Power Roll + Might, Reason, Intuition, or Presence:**
// Unlike monster abilities (numeric "+3"), PC abilities use characteristic names.
// We capture the full bonus string so it's available for display; the engine
// resolves the characteristic at roll time.
//
// Tier bullet format is identical to monsters:
//   - **≤11:** 4 + M damage; ...
//   - **12-16:** 6 + M damage; ...
//   - **17+:** 10 + M damage; ...
//
// NOTE: parseTierOutcome from parse-monster is reused for the tier strings,
// but PC tiers often include characteristic abbreviations ("4 + M damage")
// that the damage regex won't match — raw text is always preserved in .raw so
// the UI still shows the correct text.
function parsePowerRollFromContent(content: string): PowerRoll | undefined {
  const lines = content.split(/\r?\n/);
  let bonus: string | null = null;
  let tier1Raw: string | null = null;
  let tier2Raw: string | null = null;
  let tier3Raw: string | null = null;

  for (const rawLine of lines) {
    // Strip leading blockquote prefix (defensive — PC bodies are plain prose
    // but some common-ability files embed ability blocks as blockquotes).
    const line = rawLine.replace(/^>\s*/, '').trim();

    // Header: **Power Roll + <anything>:** (characteristic name or numeric bonus)
    // Accepts: "Power Roll + Might:", "Power Roll + Might or Agility:",
    //          "Power Roll + 3:", "Power Roll +3:"
    const head = /^\*\*Power Roll\s*\+\s*([^*:]+?):\*\*\s*$/.exec(line);
    if (head && head[1] !== undefined) {
      bonus = head[1].trim();
    }

    // Tier bullets — same format as monsters.
    const t1 = /^[-*]\s*\*\*(?:≤|<=)\s*11:\*\*\s*(.+)$/.exec(line);
    if (t1 && t1[1] !== undefined) tier1Raw = t1[1].trim();
    const t2 = /^[-*]\s*\*\*12\s*[-–]\s*16:\*\*\s*(.+)$/.exec(line);
    if (t2 && t2[1] !== undefined) tier2Raw = t2[1].trim();
    const t3 = /^[-*]\s*\*\*17\+:\*\*\s*(.+)$/.exec(line);
    if (t3 && t3[1] !== undefined) tier3Raw = t3[1].trim();
  }

  if (bonus !== null && tier1Raw !== null && tier2Raw !== null && tier3Raw !== null) {
    return {
      bonus,
      tier1: parseTierOutcome(tier1Raw),
      tier2: parseTierOutcome(tier2Raw),
      tier3: parseTierOutcome(tier3Raw),
    };
  }
  return undefined;
}

// ── Main entry ─────────────────────────────────────────────────────────────────

/**
 * Parse one PC ability markdown file into an Ability record.
 *
 * Returns null for non-ability pages (wrong `type` prefix, missing name, etc.).
 * `filePath` is required for the sourceClassId path-fallback and the isSubclass
 * heuristic.
 */
export function parseAbilityMarkdown(md: string, filePath = ''): Ability | null {
  let fm: Record<string, unknown>;
  let content: string;
  try {
    const parsed = matter(md);
    fm = parsed.data as Record<string, unknown>;
    content = parsed.content;
  } catch {
    return null;
  }

  const typeField = typeof fm.type === 'string' ? fm.type : '';

  // Accept feature/ability/*, common-ability/*, kit-ability/*
  if (
    !typeField.startsWith('feature/ability/') &&
    !typeField.startsWith('common-ability/') &&
    !typeField.startsWith('kit-ability/')
  ) {
    return null;
  }

  // Name resolution: prefer item_name, fall back to file_basename.
  const name: string | null =
    typeof fm.item_name === 'string' && fm.item_name.trim().length > 0
      ? fm.item_name.trim()
      : typeof fm.file_basename === 'string' && fm.file_basename.trim().length > 0
        ? fm.file_basename.trim()
        : null;
  if (!name) return null;

  const actionType =
    typeof fm.action_type === 'string' ? fm.action_type : undefined;
  const type = parseAbilityType(actionType, typeField);
  const cost = parseCost(fm);
  const tier = parseLevel(fm);
  const sourceClassId = parseSourceClassId(fm, filePath, typeField);
  const isSubclass = parseIsSubclass(filePath, typeField);

  const id = `${sourceClassId ?? 'unknown'}-${slugify(name)}`;

  const distance = typeof fm.distance === 'string' ? fm.distance : undefined;
  const target = typeof fm.target === 'string' ? fm.target : undefined;
  const keywords = Array.isArray(fm.keywords)
    ? fm.keywords.filter((k): k is string => typeof k === 'string')
    : [];

  const powerRoll = parsePowerRollFromContent(content);

  // Run through AbilitySchema so Zod applies defaults and validates.
  const result = AbilitySchema.safeParse({
    id,
    name,
    type,
    keywords,
    distance,
    target,
    powerRoll,
    raw: content.trim(),
    cost,
    tier,
    isSubclass,
    sourceClassId,
  });

  if (!result.success) return null;
  return result.data;
}
