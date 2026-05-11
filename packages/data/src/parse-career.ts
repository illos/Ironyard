import {
  type Career,
  CareerSchema,
  type IncitingIncident,
  type PerkType,
  type SkillGrant,
} from '@ironyard/shared';
import matter from 'gray-matter';

export type CareerParseResult = { ok: true; career: Career } | { ok: false; reason: string };

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

type SkillGroup = 'crafting' | 'exploration' | 'interpersonal' | 'intrigue' | 'lore';
const SKILL_GROUPS: ReadonlySet<SkillGroup> = new Set([
  'crafting',
  'exploration',
  'interpersonal',
  'intrigue',
  'lore',
]);

function asGroup(raw: string): SkillGroup | null {
  const lower = raw.toLowerCase().trim();
  if (SKILL_GROUPS.has(lower as SkillGroup)) return lower as SkillGroup;
  return null;
}

function slugifySkill(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Parse the **Skills:** line into an array of SkillGrant entries.
 *
 * Observed patterns across all v1 careers:
 *   "Two skills from the crafting skill group"
 *   "One skill from the X group and one skill from the Y group"
 *   "The Sneak skill from the intrigue skill group, plus one skill from the
 *    interpersonal group and one other skill from the intrigue group"
 *   "The Sneak skill (from the intrigue skill group), plus ..."
 *   "Sneak (from the intrigue skill group), plus ..."
 */
function parseSkillGrants(raw: string): SkillGrant[] {
  // Strip the quick-build parenthetical at the end: (*Quick Build:* ...)
  const cleaned = raw.replace(/\s*\(?\*Quick Build:\*[^)]*\)?\s*$/, '').trim();

  const grants: SkillGrant[] = [];

  // ── Fixed skills ───────────────────────────────────────────────────────────
  // Patterns:
  //   "The Sneak skill from/of the intrigue skill group"
  //   "The Sneak skill (from the intrigue skill group)"
  //   "Sneak (from the intrigue skill group)"
  //   "Nature (from the lore skill group)"
  //   "Alertness (from the intrigue skill group)"
  //   "Swim (from the exploration skill group)"

  // The [SkillName] skill [( ]from the [group] skill group[)]
  const fixedWithArticleRe =
    /(?:^|,\s*|\bplus\s+)(?:The\s+)?([A-Z][A-Za-z ]+?)\s+skill\b(?:\s*\(?\s*from\s+the\s+(\w+)\s+skill\s+group\)?)*/gi;
  // Also: "SkillName (from the X skill group)" form
  const fixedParenRe =
    /(?:^|plus\s+)([A-Z][A-Za-z ]+?)\s*\(\s*from\s+the\s+\w+\s+skill\s+group\s*\)/gi;

  // Collect fixed-skill names first to avoid double-counting.
  const fixedSkillNames = new Set<string>();

  {
    // "The Sneak skill from the intrigue group" / "Sneak skill"
    const re =
      /(?:^|plus\s+)(?:The\s+)?([A-Z][A-Za-z ]+?)\s+skill\b(?:\s*\(?from\s+the\s+\w+\s+(?:skill\s+)?group\)?)?/gi;
    for (const m of cleaned.matchAll(re)) {
      const sName = (m[1] ?? '').trim();
      if (sName && sName.toLowerCase() !== 'one' && sName.toLowerCase() !== 'two') {
        fixedSkillNames.add(sName);
        grants.push({ kind: 'fixed', skillId: slugifySkill(sName) });
      }
    }
  }

  {
    // "Nature (from the lore skill group)" without "skill" before the paren
    const re = /(?:^|plus\s+)([A-Z][A-Za-z ]+?)\s*\(\s*from\s+the\s+(\w+)\s+skill\s+group\s*\)/gi;
    for (const m of cleaned.matchAll(re)) {
      const sName = (m[1] ?? '').trim();
      if (sName && !fixedSkillNames.has(sName)) {
        fixedSkillNames.add(sName);
        grants.push({ kind: 'fixed', skillId: slugifySkill(sName) });
      }
    }
  }

  // ── Choice skills ──────────────────────────────────────────────────────────
  // Patterns:
  //   "two skills from the crafting skill group"
  //   "one skill from the interpersonal group"
  //   "one skill from the X group and one skill from the Y group"
  //   "two more skills from the lore group"
  //   "two skills from either the crafting group or the exploration group"
  //   "one other skill from the intrigue group"

  const WORD_TO_NUM: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
  };

  // Match "N skill(s) from [either] the X [skill] group [or the Y [skill] group]"
  const choiceRe =
    /\b(one|two|three|four|five|1|2|3|4|5)\s+(?:more\s+|other\s+)?skills?\s+from\s+(?:either\s+)?the\s+(\w+)\s+(?:skill\s+)?group(?:\s+or\s+the\s+(\w+)\s+(?:skill\s+)?group)?/gi;

  for (const m of cleaned.matchAll(choiceRe)) {
    const countWord = (m[1] ?? '').toLowerCase();
    const count = WORD_TO_NUM[countWord] ?? Number.parseInt(countWord, 10);
    if (!Number.isFinite(count)) continue;

    const group1 = asGroup(m[2] ?? '');
    const group2Raw = m[3] ? asGroup(m[3]) : null;

    if (group1) {
      if (group2Raw) {
        // "from the crafting group or the exploration group" — emit one choice
        // grant per slot, each spanning either group. Since SkillGrant.choice only
        // takes a single group, we emit separate grants for each count slot.
        // The UI shows both options to the player. For now, emit as two separate
        // choice grants each with count=1.
        for (let i = 0; i < count; i++) {
          grants.push({ kind: 'choice', group: group1, count: 1 });
        }
      } else {
        grants.push({ kind: 'choice', group: group1, count });
      }
    }
  }

  return grants;
}

/**
 * Parse the **Languages:** line to extract the number of bonus languages.
 * "One language" → 1, "Two languages" → 2, etc.
 */
function parseLanguageCount(raw: string): number {
  const WORD_TO_NUM: Record<string, number> = { one: 1, two: 2, three: 3 };
  const m = /\b(one|two|three|\d+)\s+language/i.exec(raw);
  if (!m || m[1] === undefined) return 0;
  const lower = m[1].toLowerCase();
  return WORD_TO_NUM[lower] ?? Number.parseInt(lower, 10);
}

/**
 * Parse the **Perk:** line to extract the perk type.
 * "One intrigue perk" → 'intrigue', etc.
 */
function parsePerkType(raw: string): PerkType | null {
  const PERK_TYPE_MAP: Record<string, PerkType> = {
    crafting: 'crafting',
    exploration: 'exploration',
    interpersonal: 'interpersonal',
    intrigue: 'intrigue',
    lore: 'lore',
    supernatural: 'supernatural',
  };
  for (const [key, val] of Object.entries(PERK_TYPE_MAP)) {
    if (raw.toLowerCase().includes(key)) return val;
  }
  return null;
}

/** Extract the **Bold:** value from anywhere in the body. */
function extractBoldField(body: string, label: string): string | null {
  const re = new RegExp(`\\*\\*${label}:\\*\\*\\s*(.+)`, 'i');
  const m = re.exec(body);
  return m && m[1] !== undefined ? m[1].trim() : null;
}

/**
 * Extract career description — paragraphs before "You gain the following
 * career benefits:" (or equivalent). The first heading in career files is
 * "#### CareerName", so we start after it.
 */
function extractDescription(body: string): string {
  const lines = body.split(/\r?\n/);
  const parts: string[] = [];
  let pastHeading = false;
  for (const line of lines) {
    const t = line.trim();
    if (!pastHeading) {
      if (/^#{1,6}\s/.test(t)) pastHeading = true;
      continue;
    }
    if (/^#{1,6}\s/.test(t)) break;
    if (/You gain the following career benefits/i.test(t)) break;
    if (/^\*\*Skills:\*\*/i.test(t)) break;
    if (!t) continue;
    parts.push(t);
  }
  return parts.join(' ').trim();
}

/**
 * Parse the inciting incidents table:
 * | d6 | Inciting Incident |
 * | --- | --- |
 * | 1 | **Title:** Description |
 */
function parseIncitingIncidents(body: string): IncitingIncident[] {
  const incidents: IncitingIncident[] = [];

  // Grab table rows that start with a digit cell.
  const rowRe = /^\|\s*\d+\s*\|\s*(.+?)\s*\|?\s*$/gm;
  for (const m of body.matchAll(rowRe)) {
    const cell = (m[1] ?? '').trim();
    // Format: "**Title:** Description text"
    const titleMatch = /^\*\*(.+?)(?:\*\*:|:\*\*)\s*(.*)$/.exec(cell);
    if (titleMatch && titleMatch[1] !== undefined && titleMatch[2] !== undefined) {
      const title = titleMatch[1].trim();
      const description = titleMatch[2].trim();
      const id = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      incidents.push({ id, title, description });
    }
  }

  return incidents;
}

// ──────────────────────────────────────────────────────────────────────────────
// Main entry
// ──────────────────────────────────────────────────────────────────────────────

export function parseCareerMarkdown(content: string): CareerParseResult {
  let fm: Record<string, unknown>;
  let body: string;
  try {
    const parsed = matter(content);
    fm = parsed.data as Record<string, unknown>;
    body = parsed.content;
  } catch (e) {
    return { ok: false, reason: `frontmatter parse failed: ${(e as Error).message}` };
  }

  const id = typeof fm.item_id === 'string' ? fm.item_id : null;
  const name = typeof fm.item_name === 'string' ? fm.item_name : null;
  if (!id) return { ok: false, reason: 'missing item_id' };
  if (!name) return { ok: false, reason: 'missing item_name' };

  const description = extractDescription(body);

  const skillsLine = extractBoldField(body, 'Skills');
  const languagesLine = extractBoldField(body, 'Languages');
  const perkLine = extractBoldField(body, 'Perk');

  const skillGrants = skillsLine ? parseSkillGrants(skillsLine) : [];
  const languageCount = languagesLine ? parseLanguageCount(languagesLine) : 0;
  const perkType = perkLine ? parsePerkType(perkLine) : null;
  const incitingIncidents = parseIncitingIncidents(body);

  const candidate: Career = {
    id,
    name,
    description,
    skillGrants,
    languageCount,
    perkType,
    incitingIncidents,
    renown: 0,
  };

  const parsed = CareerSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, reason: `schema validation: ${parsed.error.message}` };
  }
  return { ok: true, career: parsed.data };
}
