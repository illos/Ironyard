import matter from 'gray-matter';
import type { Kit } from '@ironyard/shared';

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

  // Melee/Ranged damage bonus is "+0/+0/+4" (per-echelon). For the prototype,
  // take the third value (highest echelon) as the structural max. 2B can
  // refine per-tier later if needed.
  const meleeMatch = /\*\*Melee Damage Bonus:\*\*\s*[+\-\d]+\/[+\-\d]+\/([+\-]?\d+)/.exec(
    bonusesText,
  );
  const rangedMatch = /\*\*Ranged Damage Bonus:\*\*\s*[+\-\d]+\/[+\-\d]+\/([+\-]?\d+)/.exec(
    bonusesText,
  );
  const meleeDamageBonus = parseIntSafe(meleeMatch?.[1]);
  const rangedDamageBonus = parseIntSafe(rangedMatch?.[1]);

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
    meleeDamageBonus,
    rangedDamageBonus,
    signatureAbilityId,
    keywords,
  };
}
