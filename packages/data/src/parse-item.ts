import matter from 'gray-matter';
import type { Item } from '@ironyard/shared';

const BODY_SLOTS = ['arms', 'feet', 'hands', 'head', 'neck', 'waist', 'ring'] as const;
type BodySlot = (typeof BODY_SLOTS)[number];

// Parses the ordinal echelon string ("1st", "2nd", "3rd", "4th") to an integer.
// Returns null for empty or unrecognised values.
function parseEchelon(s: unknown): number | null {
  if (typeof s !== 'string') return null;
  const m = /^(\d)/.exec(s);
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 10);
  return Number.isInteger(n) && n >= 1 && n <= 4 ? n : null;
}

// Pulls the first meaningful paragraph after the H5 heading as the description.
function firstParagraph(content: string): string {
  const lines = content.split('\n');
  let inBody = false;
  const para: string[] = [];
  for (const line of lines) {
    if (!inBody) {
      if (/^#####\s+/.test(line)) inBody = true;
      continue;
    }
    if (line.trim() === '' && para.length === 0) continue;
    if (line.trim() === '') break;
    if (line.startsWith('**')) continue; // skip bold keyword/metadata lines
    if (line.startsWith('*') && line.endsWith('*')) {
      para.push(line.replace(/^\*|\*$/g, '').trim());
      break;
    }
    para.push(line.trim());
  }
  return para.join(' ').trim();
}

// Extracts the first body-slot keyword from the **Keywords:** line.
// "Head, Magic" -> 'head'. First matching slot keyword wins.
function parseBodySlot(content: string): BodySlot | null {
  const m = /\*\*Keywords:\*\*\s+([^\n]+)/i.exec(content);
  if (!m) return null;
  const kws = m[1]!.toLowerCase();
  for (const slot of BODY_SLOTS) {
    if (kws.includes(slot)) return slot;
  }
  return null;
}

// Best-effort kitKeyword extraction for leveled treasures.
// "weapons of the Bow keyword" -> 'bow'.
function parseKitKeyword(content: string): string | null {
  const m = /(?:weapons?|armors?)\s+of\s+the\s+(\w[\w\s]*?)\s+keyword/i.exec(content);
  if (!m) return null;
  return m[1]!.trim().toLowerCase().replace(/\s+/g, '-');
}

// Heuristic effectKind classification for consumables.
function parseEffectKind(
  content: string,
): 'instant' | 'duration' | 'two-phase' | 'attack' | 'area' | 'unknown' {
  const lower = content.toLowerCase();
  if (/lasts?\s+\d+\s+rounds?/.test(lower)) return 'duration';
  if (/area effect|burst|line|cube/.test(lower)) return 'area';
  if (/power roll|target one creature|throw/.test(lower)) return 'attack';
  if (/drink it twice|two doses?|first dose|second dose/.test(lower)) return 'two-phase';
  if (/regain|restore|heal/.test(lower)) return 'instant';
  return 'unknown';
}

/**
 * Parse one treasure markdown file into an Item discriminated union.
 *
 * Returns null for non-treasure pages (e.g. _Index) so the caller can skip them.
 *
 * Discriminator is the second segment of the `type:` frontmatter field:
 *   treasure/artifact           -> category 'artifact'
 *   treasure/consumable/...     -> category 'consumable'
 *   treasure/leveled/...        -> category 'leveled-treasure'
 *   treasure/trinkets/...       -> category 'trinket'
 */
export function parseItemMarkdown(md: string): Item | null {
  const { data: fm, content } = matter(md);
  const typeStr = typeof fm.type === 'string' ? fm.type : '';
  if (!typeStr.startsWith('treasure/')) return null;

  const id = typeof fm.item_id === 'string' ? fm.item_id : null;
  const name = typeof fm.item_name === 'string' ? fm.item_name : null;
  if (!id || !name) return null;

  const description = firstParagraph(content);
  const raw = content;

  // The second segment of the type path is the category discriminator.
  const segments = typeStr.split('/');
  const treasureType = (segments[1] ?? '').toLowerCase();

  if (treasureType === 'artifact') {
    return { category: 'artifact', id, name, description, raw };
  }

  if (treasureType === 'consumable') {
    // Echelon comes from the third segment: "treasure/consumable/1st-echelon"
    // or from the fm.echelon field ("1st", "2nd", etc).
    const echelonFromFm = parseEchelon(fm.echelon);
    const echelonFromType = parseEchelon(segments[2] ?? '');
    const echelon = echelonFromFm ?? echelonFromType ?? undefined;
    return {
      category: 'consumable',
      id,
      name,
      description,
      raw,
      echelon,
      effectKind: parseEffectKind(content),
    };
  }

  if (treasureType === 'leveled') {
    // Leveled treasures have no echelon in frontmatter — they're leveled 1/5/9
    // which spans all echelons. Use 1 as the canonical echelon value since the
    // item is available from 1st echelon (hero level 1).
    return {
      category: 'leveled-treasure',
      id,
      name,
      description,
      raw,
      echelon: 1,
      kitKeyword: parseKitKeyword(content),
    };
  }

  if (treasureType === 'trinkets') {
    return {
      category: 'trinket',
      id,
      name,
      description,
      raw,
      bodySlot: parseBodySlot(content),
    };
  }

  return null;
}
