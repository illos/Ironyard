import matter from 'gray-matter';
import { type Ability, AbilitySchema, type AbilityType, type Kit } from '@ironyard/shared';
import { parsePowerRollFromContent } from './parse-ability';

// Slugify a kit reference: "Pain for Pain" -> "pain-for-pain". Prefixed with
// the kit slug for global uniqueness when referenced from abilities.json.
function slugifyAbility(kitId: string, abilityName: string): string {
  const slug = abilityName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${kitId}-${slug}`;
}

// Normalize "Heavy Weapon" -> "heavy-weapon" for the keywords array.
function slugifyKeyword(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseIntSafe(s: string | undefined): number {
  if (!s) return 0;
  const n = Number.parseInt(s.replace(/[^-0-9]/g, ''), 10);
  return Number.isNaN(n) ? 0 : n;
}

// Per-tier melee/ranged damage bonus is authored as "+X/+Y/+Z". When the
// regex finds the row we return [X, Y, Z]; otherwise we return [0, 0, 0] so
// the kit emits no weapon-damage-bonus attachment.
function parseTierTuple(match: RegExpExecArray | null): [number, number, number] {
  if (!match) return [0, 0, 0];
  return [parseIntSafe(match[1]), parseIntSafe(match[2]), parseIntSafe(match[3])];
}

/**
 * Parse one kit markdown file. Returns null for non-kit pages (e.g. the
 * Kits Table index and _Index) so the caller can skip them.
 *
 * Source shape (.reference/data-md/Rules/Kits/*.md):
 * - Frontmatter `type: kit`, `item_id`, `item_name`.
 * - `##### Equipment` section lists weapon + armor types.
 * - `##### Kit Bonuses` section has bold-bracketed numeric stats.
 * - `##### Signature Ability` section names the kit's signature ability.
 */
export function parseKitMarkdown(md: string): Kit | null {
  const { data: fm, content } = matter(md);
  if (fm.type !== 'kit') return null;
  const id = typeof fm.item_id === 'string' ? fm.item_id : null;
  const name = typeof fm.item_name === 'string' ? fm.item_name : null;
  if (!id || !name) return null;

  // Description: first non-empty paragraph after the H4 heading.
  let description = '';
  const descMatch = content.match(/####\s+[^\n]+\n+([\s\S]*?)(?=#####|$)/);
  if (descMatch?.[1]) {
    // Take first non-empty line
    const firstPara = descMatch[1].split(/\n+/).find((l) => l.trim().length > 0);
    if (firstPara) description = firstPara.trim();
  }

  // Equipment section gives keywords.
  // Lines like "You wear heavy armor and wield a heavy weapon."
  // or "You wear no armor and wield a bow."
  // or "You wear light armor and wield a shield and a light weapon."
  const equipMatch = content.match(/#####\s+Equipment[\s\S]*?(?=#####|$)/);
  const equipText = equipMatch ? equipMatch[0].toLowerCase() : '';
  const keywords: string[] = [];

  // Armor types (check heavy first to avoid partial match of "heavy" in "heavy armor").
  const armorTypes: [string, RegExp][] = [
    ['heavy-armor', /\bheavy armor\b/],
    ['medium-armor', /\bmedium armor\b/],
    ['light-armor', /\blight armor\b/],
  ];
  for (const [kw, re] of armorTypes) {
    if (re.test(equipText)) keywords.push(kw);
  }

  // Shield.
  if (/\bshield\b/.test(equipText)) keywords.push('shield');

  // Weapon types.
  const weaponTypes: [string, RegExp][] = [
    ['heavy-weapon', /\bheavy weapon\b/],
    ['medium-weapon', /\bmedium weapon\b/],
    ['light-weapon', /\blight weapon\b/],
    ['bow', /\bbow\b/],
    ['crossbow', /\bcrossbow\b/],
    ['dagger', /\bdagger\b/],
    ['polearm', /\bpolearm\b/],
    ['unarmed-strike', /\bunarmed(?:\s+strikes?)?\b/],
    ['whip', /\bwhip\b/],
    ['ensnaring', /\bensnaring\b/],
  ];
  for (const [kw, re] of weaponTypes) {
    if (re.test(equipText)) keywords.push(kw);
  }

  // Kit Bonuses section.
  const bonusesMatch = content.match(/#####\s+Kit Bonuses[\s\S]*?(?=#####|$)/);
  const bonusesText = bonusesMatch ? bonusesMatch[0] : '';

  // Stamina Bonus: "+9 per echelon" — extract leading number.
  const staminaBonus = parseIntSafe(
    /\*\*Stamina Bonus:\*\*\s*([+\-]?\d+)/.exec(bonusesText)?.[1],
  );
  const speedBonus = parseIntSafe(
    /\*\*Speed Bonus:\*\*\s*([+\-]?\d+)/.exec(bonusesText)?.[1],
  );
  const stabilityBonus = parseIntSafe(
    /\*\*Stability Bonus:\*\*\s*([+\-]?\d+)/.exec(bonusesText)?.[1],
  );

  // Melee/Ranged damage bonus is "+0/+0/+4" (per-tier). Slice 6 / Epic 2C
  // § 10.8 captures all three values positionally so the engine can fold the
  // tier-N entry into the matching RollPower outcome.
  const meleeBonusRegex =
    /\*\*Melee Damage Bonus:\*\*\s*\+?(-?\d+)\s*\/\s*\+?(-?\d+)\s*\/\s*\+?(-?\d+)/;
  const rangedBonusRegex =
    /\*\*Ranged Damage Bonus:\*\*\s*\+?(-?\d+)\s*\/\s*\+?(-?\d+)\s*\/\s*\+?(-?\d+)/;
  const meleeDamageBonusPerTier = parseTierTuple(meleeBonusRegex.exec(bonusesText));
  const rangedDamageBonusPerTier = parseTierTuple(rangedBonusRegex.exec(bonusesText));

  // Signature Ability section — extract the H6 heading right after.
  const sigMatch = content.match(/#####\s+Signature Ability[\s\S]*?######\s+([^\n]+)/);
  const signatureAbilityId = sigMatch?.[1]
    ? slugifyAbility(id, sigMatch[1].trim())
    : null;

  return {
    id,
    name,
    description,
    raw: content,
    staminaBonus,
    speedBonus,
    stabilityBonus,
    meleeDamageBonusPerTier,
    rangedDamageBonusPerTier,
    signatureAbilityId,
    keywords,
  };
}

// ── Kit signature ability extractor ──────────────────────────────────────────
//
// Kit signature abilities live inline in the kit markdown (under the H6
// heading inside `##### Signature Ability`) rather than under
// `Rules/Abilities/`. The walking parser doesn't see them, so we extract them
// here and emit them as Ability records in build.ts. Resolves the "kit
// signature ability id is in runtime.abilityIds but bundle.abilities doesn't
// have it" gap surfaced when kit attachments started granting abilities.
//
// Parsing is regex-driven and intentionally lenient — any field we can't
// confidently parse becomes undefined / null and the rendered card falls back
// to the raw markdown. The caller wraps the returned Ability through
// AbilitySchema.parse() so defaults fill in.

function parseKitActionType(actionLabel: string): AbilityType {
  const lc = actionLabel.toLowerCase();
  if (lc.includes('maneuver')) return 'maneuver';
  if (lc.includes('free triggered')) return 'free-triggered';
  if (lc.includes('triggered')) return 'triggered';
  // 'main action', 'move action', 'free action', plain 'action' — all map to 'action'.
  return 'action';
}

export function parseKitSignatureAbility(kitId: string, kitMarkdown: string): Ability | null {
  const { content } = matter(kitMarkdown);
  // `#####` is a *prefix* of `######` (H6), so a naive `(?=#####)` lookahead
  // fires on the H6 ability heading. Anchor to a line-start H5 (newline + 5
  // hashes + space) to disambiguate from the H6 heading inside the section.
  const sigBlockMatch = content.match(
    /#####\s+Signature Ability\s*\n([\s\S]*?)(?=\n##### |$)/,
  );
  if (!sigBlockMatch?.[1]) return null;
  const sigBlock = sigBlockMatch[1];

  // H6 heading is the ability name. Strip any costs in parens (none today on
  // signature abilities, but be defensive).
  const nameMatch = sigBlock.match(/######\s+([^\n]+)/);
  if (!nameMatch?.[1]) return null;
  const name = nameMatch[1].trim();

  // Header row: | **<keywords...>** | **<action label>** |
  // Strip leading/trailing pipes and split on the inner pipe.
  const headerRow = sigBlock.match(/\|\s*\*\*([^|*]+)\*\*\s*\|\s*\*\*([^|*]+)\*\*\s*\|/);
  const keywords = headerRow?.[1]
    ? headerRow[1]
        .split(/,\s*/)
        .map((k) => k.trim())
        .filter((k) => k.length > 0)
    : [];
  const actionLabel = headerRow?.[2]?.trim() ?? '';
  const type = parseKitActionType(actionLabel);

  // Distance / target row: 📏 cell and 🎯 cell.
  const distanceMatch = sigBlock.match(/\|\s*\*\*📏\s*([^*]+)\*\*\s*\|/);
  const targetMatch = sigBlock.match(/\|\s*\*\*🎯\s*([^*]+)\*\*\s*\|/);
  const distance = distanceMatch?.[1]?.trim() || undefined;
  const target = targetMatch?.[1]?.trim() || undefined;

  const powerRoll = parsePowerRollFromContent(sigBlock);

  const id = `${kitId}-${name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')}`;

  const result = AbilitySchema.safeParse({
    id,
    name,
    type,
    keywords,
    distance,
    target,
    powerRoll,
    raw: sigBlock.trim(),
    cost: 0, // kit signature abilities are always 0-cost (signature)
    tier: null,
    isSubclass: false,
    sourceClassId: null,
  });
  if (!result.success) return null;
  return result.data;
}
