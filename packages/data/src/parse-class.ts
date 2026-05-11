import {
  type AbilitySlot,
  type ClassLevel,
  ClassSchema,
  type HeroClass,
  type Subclass,
} from '@ironyard/shared';
import type { Characteristic } from '@ironyard/shared';
import matter from 'gray-matter';

export type ClassParseResult = { ok: true; heroClass: HeroClass } | { ok: false; reason: string };

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

const CHAR_NAMES: Record<string, Characteristic> = {
  might: 'might',
  agility: 'agility',
  reason: 'reason',
  intuition: 'intuition',
  presence: 'presence',
};

function asCharacteristic(raw: string): Characteristic | null {
  return CHAR_NAMES[raw.toLowerCase().trim()] ?? null;
}

/** Normalize Unicode minus signs and en-dashes to ASCII hyphen-minus. */
function normalizeMinus(s: string): string {
  return s.replace(/[−–]/g, '-');
}

/**
 * Parse "Starting Characteristics" section from Basics.md body.
 *
 * Two patterns:
 *   Pattern A (2 locked): "You start with a Might of 2 and an Agility of 2,
 *     and you can choose one of the following arrays..."
 *   Pattern B (1 locked): "You start with an Intuition of 2, and can choose
 *     one of the following arrays..."
 *
 * Returns { lockedCharacteristics, characteristicArrays, potencyCharacteristic }
 */
function parseCharacteristicsBlock(body: string): {
  lockedCharacteristics: Characteristic[];
  characteristicArrays: number[][];
  potencyCharacteristic: Characteristic;
} | null {
  // ── Locked stats ─────────────────────────────────────────────────────────
  // Tolerate colon inside the bold (`**Starting Characteristics:**`) or after
  // (`**Starting Characteristics**:`) — the SteelCompendium markdown is the
  // former for all classes today, but both shapes appear elsewhere in their
  // corpus.
  const startLine = /\*\*Starting Characteristics:?\*\*[:\s]*(.+)/i.exec(body);
  if (!startLine || startLine[1] === undefined) return null;
  const charLine = normalizeMinus(startLine[1]);

  const lockedCharacteristics: Characteristic[] = [];

  // Match "a/an [CharName] of 2" — handles one or two locked stats.
  const lockedRe = /\ban?\s+(\w+)\s+of\s+2\b/gi;
  for (const m of charLine.matchAll(lockedRe)) {
    const c = asCharacteristic(m[1] ?? '');
    if (c) lockedCharacteristics.push(c);
  }
  if (lockedCharacteristics.length === 0) return null;

  // ── Arrays ───────────────────────────────────────────────────────────────
  // Each array is a bullet like "- 2, −1, −1" or "- 2, 2, −1, −1".
  const characteristicArrays: number[][] = [];
  const arrayRe = /^-\s+([-0-9,\s−–]+)$/gm;
  for (const m of body.matchAll(arrayRe)) {
    const rawArr = normalizeMinus(m[1] ?? '');
    const nums = rawArr
      .split(',')
      .map((s) => Number.parseInt(s.trim(), 10))
      .filter((n) => !Number.isNaN(n));
    if (nums.length > 0) characteristicArrays.push(nums);
  }
  // Arrays appear between "Starting Characteristics" and "Weak Potency".
  // Filter to only those before the "Weak Potency" heading. Tolerate the
  // colon-inside-bold variant the SteelCompendium markdown uses.
  const weakPotencyIdx = (() => {
    const a = body.indexOf('**Weak Potency:**');
    if (a !== -1) return a;
    return body.indexOf('**Weak Potency**');
  })();
  const charSectionEnd = weakPotencyIdx === -1 ? body.length : weakPotencyIdx;
  const charSection = body.slice(0, charSectionEnd);
  const filteredArrays: number[][] = [];
  const arrayRe2 = /^-\s+([-0-9,\s−–]+)$/gm;
  for (const m of charSection.matchAll(arrayRe2)) {
    const rawArr = normalizeMinus(m[1] ?? '');
    const nums = rawArr
      .split(',')
      .map((s) => Number.parseInt(s.trim(), 10))
      .filter((n) => !Number.isNaN(n));
    if (nums.length > 0) filteredArrays.push(nums);
  }

  // ── Potency characteristic ────────────────────────────────────────────────
  // "**Strong Potency:** Might" or "**Strong Potency:** Might − 0" (rare).
  // Colon may live inside or outside the bold.
  const strongMatch = /\*\*Strong Potency:?\*\*[:\s]+([A-Za-z]+)/i.exec(body);
  if (!strongMatch || strongMatch[1] === undefined) return null;
  const potencyCharacteristic = asCharacteristic(strongMatch[1]);
  if (!potencyCharacteristic) return null;

  return {
    lockedCharacteristics,
    characteristicArrays: filteredArrays.length > 0 ? filteredArrays : characteristicArrays,
    potencyCharacteristic,
  };
}

/**
 * Parse the heroic resource name from the class body.
 * "a Heroic Resource called wrath" → "wrath"
 */
function parseHeroicResource(body: string): string | null {
  const m = /[Hh]eroic [Rr]esource called (\w+)/i.exec(body);
  return m && m[1] !== undefined ? m[1].toLowerCase() : null;
}

/**
 * Parse stamina and recovery values from Basics.md.
 */
function parseStaminaAndRecoveries(body: string): {
  startingStamina: number;
  staminaPerLevel: number;
  recoveries: number;
} | null {
  // Tolerate colon inside or after the bold marker — the SteelCompendium
  // markdown uses inside (`**Foo:**`) throughout, but the parser was written
  // against the outside form.
  const startMatch = /\*\*Starting Stamina at 1st Level:?\*\*[:\s]+(\d+)/i.exec(body);
  const perLevelMatch = /\*\*Stamina Gained at 2nd and Higher Levels:?\*\*[:\s]+(\d+)/i.exec(body);
  const recoveriesMatch = /\*\*Recoveries:?\*\*[:\s]+(\d+)/i.exec(body);

  if (!startMatch || !perLevelMatch || !recoveriesMatch) return null;

  return {
    startingStamina: Number.parseInt(startMatch[1] ?? '0', 10),
    staminaPerLevel: Number.parseInt(perLevelMatch[1] ?? '0', 10),
    recoveries: Number.parseInt(recoveriesMatch[1] ?? '0', 10),
  };
}

/**
 * Parse the **Skills:** note from Basics.md. Returns the raw note text and
 * a structured breakdown of starting skill count and groups.
 */
function parseSkillsNote(body: string): {
  note: string;
  count: number;
  groups: Array<'crafting' | 'exploration' | 'interpersonal' | 'intrigue' | 'lore'>;
} {
  const m = /\*\*Skills:\*\*\s*(.+)/i.exec(body);
  const note = m && m[1] !== undefined ? m[1].replace(/\(\*Quick Build:.*?\)/g, '').trim() : '';

  type SkillGroup = 'crafting' | 'exploration' | 'interpersonal' | 'intrigue' | 'lore';
  const GROUPS: SkillGroup[] = ['crafting', 'exploration', 'interpersonal', 'intrigue', 'lore'];
  const groups: SkillGroup[] = [];
  const lower = note.toLowerCase();
  for (const g of GROUPS) {
    if (lower.includes(g)) groups.push(g);
  }

  // Count the total skills granted (fixed + choice).
  // Parse "any two from ... or ...", "any three from ...", "any two skills", etc.
  let count = 0;
  const WORD_TO_NUM: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
  };

  // Fixed skills: "You gain the X skill"  or "You gain the X and Y skills"
  const fixedRe = /\bYou gain the ([A-Z][A-Za-z ]+?) skill/g;
  for (const fm of note.matchAll(fixedRe)) {
    count += 1;
    // Handle "X and Y skills" with just the first match — count again for "and"
    if (/ and /i.test(fm[1] ?? '')) count += 1;
  }
  // "You gain the X and Y skills" (already counted above, handle separately)
  // Actually, regex above captures "X and Y" as one match so +1 handles it.

  // Choice skills: "Choose any N skills" / "choose any N skills from the X or Y"
  const choiceRe = /\b(?:choose\s+)?any\s+(one|two|three|four|five|\d+)\s+skills?\b/gi;
  for (const cm of note.matchAll(choiceRe)) {
    const word = (cm[1] ?? '').toLowerCase();
    const n = WORD_TO_NUM[word] ?? Number.parseInt(word, 10);
    if (Number.isFinite(n)) count += n;
  }
  // "Then choose any N skills" after a fixed skill
  const thenChoiceRe = /\bThen choose any (one|two|three|four|five|\d+)\s+skills?\b/gi;
  for (const cm of note.matchAll(thenChoiceRe)) {
    const word = (cm[1] ?? '').toLowerCase();
    const n = WORD_TO_NUM[word] ?? Number.parseInt(word, 10);
    if (Number.isFinite(n)) count += n;
  }

  return { note, count, groups };
}

// ──────────────────────────────────────────────────────────────────────────────
// Advancement table parsing
// ──────────────────────────────────────────────────────────────────────────────

const ORDINAL_TO_LEVEL: Record<string, number> = {
  '1st': 1,
  '2nd': 2,
  '3rd': 3,
  '4th': 4,
  '5th': 5,
  '6th': 6,
  '7th': 7,
  '8th': 8,
  '9th': 9,
  '10th': 10,
};

/**
 * Parse "Two signature, 3, 5" / "Signature, 3, 5" / "Two signature, 3, 5, 7"
 * into AbilitySlot arrays. Signature abilities have cost=0.
 *
 * isSubclass: when true, all slots generated are marked isSubclass=true.
 */
function parseAbilitySlots(cell: string, isSubclass = false): AbilitySlot[] {
  if (!cell || cell.trim() === '-') return [];
  const slots: AbilitySlot[] = [];
  const lower = cell.toLowerCase();

  // Count how many signature slots.
  let sigCount = 0;
  if (/\btwo signature\b/.test(lower)) sigCount = 2;
  else if (/\bsignature\b/.test(lower)) sigCount = 1;

  for (let i = 0; i < sigCount; i++) {
    slots.push({ cost: 0, isSubclass });
  }

  // Remaining tokens are heroic resource costs (integers).
  const parts = cell.split(',').map((s) => s.trim());
  for (const part of parts) {
    if (/signature/i.test(part)) continue;
    const n = Number.parseInt(part, 10);
    if (Number.isFinite(n)) slots.push({ cost: n, isSubclass });
  }

  return slots;
}

/** Split a markdown table row into trimmed cells. */
function splitTableRow(row: string): string[] {
  return row
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

/**
 * Parse the advancement table into ClassLevel entries. Accepts the Basics.md
 * body. The table has columns: Level | Features | Abilities | [SubclassAbilities]
 */
function parseAdvancementTable(body: string): ClassLevel[] {
  const lines = body.split(/\r?\n/);
  const tableLines = lines
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|') && !l.match(/^\|\s*:?-+/));

  if (tableLines.length < 2) return [];

  // Header row tells us column order.
  const headerCells = splitTableRow(tableLines[0] ?? '');
  const levelIdx = 0;
  const featuresIdx = headerCells.findIndex((c) => /features/i.test(c));
  const abilitiesIdx = headerCells.findIndex((c) => /^abilities$/i.test(c));
  // Subclass column is any column after "Abilities" that contains "Abilities"
  const subclassAbilitiesIdx = headerCells.findIndex(
    (_, i) => i > abilitiesIdx && /abilities/i.test(headerCells[i] ?? ''),
  );

  const levels: ClassLevel[] = [];

  for (const row of tableLines.slice(1)) {
    const cells = splitTableRow(row);
    const levelCell = cells[levelIdx]?.trim() ?? '';
    const level = ORDINAL_TO_LEVEL[levelCell];
    if (!level) continue;

    const featuresCell = featuresIdx !== -1 ? (cells[featuresIdx] ?? '') : '';
    const abilitiesCell = abilitiesIdx !== -1 ? (cells[abilitiesIdx] ?? '') : '';
    const subclassCell = subclassAbilitiesIdx !== -1 ? (cells[subclassAbilitiesIdx] ?? '') : '';

    // Feature names: comma-separated, trimmed.
    const featureNames = featuresCell
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean);

    // Flags derived from feature names.
    const grantsPerk = featureNames.some((f) => /^perk$/i.test(f));
    const grantsSkill = featureNames.some((f) => /^skill(?:\s+increase)?$/i.test(f));
    const grantsCharacteristicIncrease = featureNames.some((f) =>
      /^characteristic\s+increase$/i.test(f),
    );

    const abilitySlots = parseAbilitySlots(abilitiesCell, false);
    const subclassAbilitySlots = parseAbilitySlots(subclassCell, true);

    levels.push({
      level,
      featureNames,
      abilitySlots: [...abilitySlots, ...subclassAbilitySlots],
      grantsPerk,
      grantsSkill,
      grantsCharacteristicIncrease,
    });
  }

  return levels;
}

// ──────────────────────────────────────────────────────────────────────────────
// Subclass parsing
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Extract subclass label (e.g. "Order", "Domain", "Aspect") from the class body.
 *
 * Handles three sentence patterns observed across all nine classes:
 *
 *   Pattern A (most classes):
 *     "Your [modifier] [noun] is your subclass"
 *     e.g. "Your primordial aspect is your subclass" → "Aspect"
 *          "Your censor order is your subclass"      → "Order"
 *
 *   Pattern B (Troubadour):
 *     "Your [class] [word] [noun] is your subclass"  (multi-word modifier)
 *     e.g. "Your troubadour class act is your subclass" → "Act"
 *     Fixed by allowing `(?:\w+\s+)*` before the captured noun.
 *
 *   Pattern C (Conduit):
 *     "[noun/phrase] make up your subclass"
 *     e.g. "The two domains you pick make up your subclass" → "Domain"
 *     Fixed with a second regex that captures the last noun before "you … make up".
 */
function extractSubclassLabel(classBody: string): string | null {
  // Pattern A + B: "Your [any number of modifier words] [noun] is your subclass"
  const isYourSubclass = /[Yy]our\s+(?:\w+\s+)*(\w+)\s+is\s+your\s+subclass/i.exec(classBody);
  if (isYourSubclass && isYourSubclass[1] !== undefined) {
    const word = isYourSubclass[1].trim();
    return word.charAt(0).toUpperCase() + word.slice(1);
  }

  // Pattern C: "[determiner] [count] [noun(s)] [optional words] make up your subclass"
  // Captures the last standalone noun that appears before "you … make up your subclass".
  // e.g. "The two domains you pick make up your subclass" → "Domain" (singular of "domains")
  const makeUpSubclass = /\b(\w+)\s+(?:you\s+\w+\s+)?make\s+up\s+your\s+subclass/i.exec(classBody);
  if (makeUpSubclass && makeUpSubclass[1] !== undefined) {
    const rawNoun = makeUpSubclass[1].trim().toLowerCase();
    // Singularize simple "-s" plural (domains → domain).
    const singular = rawNoun.endsWith('s') ? rawNoun.slice(0, -1) : rawNoun;
    return singular.charAt(0).toUpperCase() + singular.slice(1);
  }

  return null;
}

/**
 * Extract subclasses from bullet list items in the subclass section.
 *
 * Primary format (most classes):
 *   - **Berserker:** Description text. You have the Lift skill.
 *   - **College of Black Ash:** Description. You have the Magic skill.
 *
 * Fallback for table-based subclass lists (Conduit):
 *   When no bullet subclasses are found near the intro sentence, look for a
 *   markdown table whose first column is labelled "[SubclassLabel]" (e.g.
 *   "| Domain | Feature | Skill Group |") and extract the non-header rows of
 *   the first column as subclass names.
 */
function extractSubclasses(classBody: string, subclassLabel: string): Subclass[] {
  const subclasses: Subclass[] = [];

  // Find the section containing the subclass list. The heading typically reads
  // "[Class] [SubclassLabel]" or "Elemental Specialization" etc.
  // We locate the list bullets that immediately follow the intro paragraph.
  // Pattern: `- **Name:** description` or `- Name: description`
  const bulletRe = /^-\s+\*\*(.+?)\*\*[:\s]+(.+)$/gm;

  // The intro sentence may use "is your subclass", "from the following", or
  // "make up your subclass" (Conduit). Allow any number of modifier words
  // before the subclass label so multi-word labels like "class act" work.
  const subclassIntroRe = new RegExp(
    `(?:your\\s+(?:\\w+\\s+)*${subclassLabel}\\s+(?:is\\s+your\\s+subclass|is\\s+your\\s+art|from\\s+the\\s+following)` +
      `|(?:\\w+\\s+)*${subclassLabel}s?\\s+(?:you\\s+\\w+\\s+)?make\\s+up\\s+your\\s+subclass)`,
    'i',
  );

  // Find the region around the subclass-intro sentence.
  const introMatch = subclassIntroRe.exec(classBody);
  const searchStart = introMatch ? Math.max(0, (introMatch.index ?? 0) - 2000) : 0;
  const searchEnd = introMatch ? (introMatch.index ?? 0) + 3000 : classBody.length;
  const searchRegion = classBody.slice(searchStart, searchEnd);

  // Reset and match bullets in the region.
  for (const m of searchRegion.matchAll(bulletRe)) {
    const rawName = (m[1] ?? '').trim();
    const rawDesc = (m[2] ?? '').trim();

    // Skip if this looks like a feature description bullet rather than a subclass.
    if (rawName.toLowerCase() === 'quick build') continue;
    // Skip domain piety/prayer effect bullets (Conduit structure).
    if (/^(piety|prayer\s+effect)$/i.test(rawName)) continue;

    const id = rawName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    // Extract skillGrant: "You have the X skill" or "You gain one skill from the X group"
    let skillGrant: string | null = null;
    const skillMatch =
      /You (?:have|gain) the ([A-Z][A-Za-z ]+?) skill/i.exec(rawDesc) ??
      /You gain one skill from the (\w+) group/i.exec(rawDesc);
    if (skillMatch && skillMatch[1] !== undefined) {
      skillGrant = skillMatch[1].trim().toLowerCase().replace(/\s+/g, '-');
    }

    subclasses.push({ id, name: rawName, description: rawDesc, skillGrant });
  }

  // ── Fallback: table-based subclass list (e.g. Conduit domains) ─────────────
  // If no bullet subclasses were found, look for a markdown table whose first
  // column header matches the subclass label (singular or plural).
  if (subclasses.length === 0) {
    const tableHeaderRe = new RegExp(`\\|\\s*${subclassLabel}s?\\s*\\|`, 'i');
    const lines = classBody.split(/\r?\n/);
    let inTable = false;
    let pastSeparator = false;
    for (const line of lines) {
      const t = line.trim();
      if (!inTable) {
        if (tableHeaderRe.test(t)) {
          inTable = true;
          pastSeparator = false;
        }
        continue;
      }
      // The separator row (| --- | --- | ...)
      if (/^\|[\s:-]+\|/.test(t)) {
        pastSeparator = true;
        continue;
      }
      if (!pastSeparator) continue;
      // Stop at blank line or non-table line.
      if (!t.startsWith('|')) break;
      // Extract first column value.
      const firstCell = t.replace(/^\|/, '').split('|')[0]?.trim() ?? '';
      if (firstCell && firstCell !== '-') {
        const id = firstCell
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');
        subclasses.push({ id, name: firstCell, description: '', skillGrant: null });
      }
    }
  }

  return subclasses;
}

/**
 * Extract the class description — the first paragraph(s) after the "## ClassName"
 * heading, before any "### Basics" or subheading.
 */
function extractClassDescription(classBody: string): string {
  const lines = classBody.split(/\r?\n/);
  const parts: string[] = [];
  let pastH2 = false;
  for (const line of lines) {
    const t = line.trim();
    if (!pastH2) {
      if (/^##\s+\S/.test(t)) pastH2 = true;
      continue;
    }
    if (/^#{1,6}\s/.test(t)) break;
    // Stop at the "As a <class>, you..." sentence that leads into the mechanics.
    if (/^<!--/.test(t)) break;
    if (!t) {
      if (parts.length > 0) continue; // allow one blank line
      continue;
    }
    parts.push(t);
  }
  return parts.join(' ').trim();
}

// ──────────────────────────────────────────────────────────────────────────────
// Main entry
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Parse a Draw Steel class from its two source files.
 *
 * @param classFileContent    Contents of `Rules/Classes/[ClassName].md`
 * @param basicsFileContent   Contents of `Rules/Classes By Level/[ClassName]/Basics.md`
 */
export function parseClassMarkdown(
  classFileContent: string,
  basicsFileContent: string,
): ClassParseResult {
  // ── Frontmatter from the Classes/ file ──────────────────────────────────
  let classFm: Record<string, unknown>;
  let classBody: string;
  try {
    const parsed = matter(classFileContent);
    classFm = parsed.data as Record<string, unknown>;
    classBody = parsed.content;
  } catch (e) {
    return { ok: false, reason: `class file frontmatter error: ${(e as Error).message}` };
  }

  const id = typeof classFm.item_id === 'string' ? classFm.item_id : null;
  const name = typeof classFm.item_name === 'string' ? classFm.item_name : null;
  if (!id) return { ok: false, reason: 'missing item_id' };
  if (!name) return { ok: false, reason: 'missing item_name' };

  // ── Basics.md ────────────────────────────────────────────────────────────
  let basicsBody: string;
  try {
    basicsBody = matter(basicsFileContent).content;
  } catch (e) {
    return { ok: false, reason: `basics file frontmatter error: ${(e as Error).message}` };
  }

  // ── Characteristics ───────────────────────────────────────────────────────
  const charBlock = parseCharacteristicsBlock(basicsBody);
  if (!charBlock) return { ok: false, reason: 'could not parse characteristics block' };

  // ── Stamina / Recoveries ──────────────────────────────────────────────────
  const staminaBlock = parseStaminaAndRecoveries(basicsBody);
  if (!staminaBlock) return { ok: false, reason: 'could not parse stamina/recoveries' };

  // ── Heroic Resource ───────────────────────────────────────────────────────
  // Resource name lives in the Classes/ body.
  const heroicResource = parseHeroicResource(classBody);
  if (!heroicResource) return { ok: false, reason: 'could not find heroic resource name' };

  // ── Skills ────────────────────────────────────────────────────────────────
  const skillsInfo = parseSkillsNote(basicsBody);

  // ── Subclass ──────────────────────────────────────────────────────────────
  const subclassLabel = extractSubclassLabel(classBody);
  if (!subclassLabel) return { ok: false, reason: 'could not determine subclass label' };
  const subclasses = extractSubclasses(classBody, subclassLabel);

  // ── Description ──────────────────────────────────────────────────────────
  const description = extractClassDescription(classBody);

  // ── Advancement table ────────────────────────────────────────────────────
  const levels = parseAdvancementTable(basicsBody);
  if (levels.length !== 10) {
    return {
      ok: false,
      reason: `expected 10 level rows in advancement table, got ${levels.length}`,
    };
  }

  const candidate = {
    id,
    name,
    description,
    lockedCharacteristics: charBlock.lockedCharacteristics,
    characteristicArrays: charBlock.characteristicArrays,
    potencyCharacteristic: charBlock.potencyCharacteristic,
    heroicResource,
    startingStamina: staminaBlock.startingStamina,
    staminaPerLevel: staminaBlock.staminaPerLevel,
    recoveries: staminaBlock.recoveries,
    startingSkillsNote: skillsInfo.note,
    startingSkillCount: skillsInfo.count,
    startingSkillGroups: skillsInfo.groups,
    subclassLabel,
    subclasses,
    levels,
  };

  const parsed = ClassSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, reason: `schema validation: ${parsed.error.message}` };
  }
  return { ok: true, heroClass: parsed.data };
}

/**
 * Convenience wrapper for tests: parses a class from a single combined markdown
 * file (the main class .md from data-md/Rules/Classes/ which contains both
 * frontmatter and a Basics section inline) and throws on failure.
 *
 * The `_filename` parameter is accepted for interface consistency but unused.
 * Both the class file and basics file arguments to `parseClassMarkdown` receive
 * the same content because the canonical class files embed both sections.
 */
export function parseClass(content: string, _filename: string): HeroClass {
  const result = parseClassMarkdown(content, content);
  if (!result.ok) throw new Error(result.reason);
  return result.heroClass;
}
