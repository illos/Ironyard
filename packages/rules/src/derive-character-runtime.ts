import type { Character, Characteristics, ConditionType } from '@ironyard/shared';
import { applyAttachments } from './attachments/apply';
import { collectAttachments } from './attachments/collect';
import { requireCanon } from './require-canon';
import type { StaticDataBundle } from './static-data';

export type CharacterRuntime = {
  characteristics: Characteristics;
  maxStamina: number;
  recoveriesMax: number;
  recoveryValue: number;
  heroicResource: { name: string; max: number | null; floor: number };
  abilityIds: string[];
  skills: string[];
  languages: string[];
  immunities: Array<{ kind: string; value: number }>;
  weaknesses: Array<{ kind: string; value: number }>;
  speed: number;
  size: string;
  stability: number;
  freeStrikeDamage: number;
  // Slice 6 / Epic 2C § 10.8: per-tier weapon damage bonus. Index 0 = tier 1,
  // 1 = tier 2, 2 = tier 3. Summed across all sources (kit, kit-keyword treasure,
  // etc.) by the applier. RollPower picks `[tier - 1]` when an ability has
  // Weapon + Melee/Ranged keywords.
  weaponDamageBonus: {
    melee: [number, number, number];
    ranged: [number, number, number];
  };
  // Phase 2b Group A+B (2b.8): condition-immunity list. Applier appends from
  // `condition-immunity` AttachmentEffects; deduped before return. Snapshotted
  // onto Participant.conditionImmunities at StartEncounter.
  conditionImmunities: ConditionType[];
  // Phase 2b Group A+B (2b.4): kit-side disengage bonus. Sums from
  // `disengage-bonus` AttachmentEffects. Snapshotted onto
  // Participant.disengageBonus at StartEncounter.
  disengageBonus: number;
  // Phase 2b Group A+B (2b.3): kit-side weapon distance bonuses. Sum from
  // `weapon-distance-bonus` AttachmentEffects. Snapshotted onto Participant
  // at StartEncounter; consumed by range-check sites in a later slice.
  meleeDistanceBonus: number;
  rangedDistanceBonus: number;
  // Phase 2b Group A+B (2b.5): skill GROUP names that grant an edge on rolls
  // within that group (Wode + High Elf Glamors). Consumed by skill rolls in
  // a later slice. Deduped before return.
  skillEdges: string[];
};

// Canonical order the 5 characteristic scores always map into.
// AncestrySchema.lockedCharacteristics may declare some of these as "always 2",
// but derivation reads the full array positionally regardless — whatever the
// character stored is what we derive.
const CANONICAL_CHARACTERISTIC_ORDER = [
  'might',
  'agility',
  'reason',
  'intuition',
  'presence',
] as const;

const ZERO_CHARACTERISTICS: Characteristics = {
  might: 0,
  agility: 0,
  reason: 0,
  intuition: 0,
  presence: 0,
};

export function deriveCharacterRuntime(
  character: Character,
  staticData: StaticDataBundle,
): CharacterRuntime {
  const base = deriveBaseRuntime(character, staticData);
  const attachments = collectAttachments(character, staticData);
  const kit = character.kitId ? (staticData.kits.get(character.kitId) ?? null) : null;
  return applyAttachments(base, attachments, { character, kit });
}

function deriveBaseRuntime(character: Character, staticData: StaticDataBundle): CharacterRuntime {
  const cls = character.classId ? staticData.classes.get(character.classId) : null;
  const ancestry = character.ancestryId ? staticData.ancestries.get(character.ancestryId) : null;

  // Characteristics: map the stored array positionally to canonical order.
  // NOTE: ClassSchema uses `lockedCharacteristics` + `characteristicArrays`
  // to describe the class's characteristic layout, but the character stores
  // all 5 values in one flat array in canonical order. Derivation reads it
  // directly — no class-specific slot mapping needed.
  const characteristics = deriveCharacteristics(character);

  // Stamina: starting + (level - 1) * perLevel. Kit bonus is layered on by the
  // attachment pass via collectFromKit.
  // NOTE: ClassSchema does NOT have staminaCharacteristic/staminaCharacteristicMultiplier
  // fields (the plan assumed these but the actual schema omits them). If a
  // characteristic-scaled stamina formula is added to ClassSchema in future,
  // update this function and the `character-derivation.max-stamina` canon entry.
  const maxStamina = requireCanon('character-derivation.max-stamina')
    ? deriveMaxStamina(character, cls)
    : 0;

  // Recoveries: ClassSchema uses `recoveries` (not `recoveriesPerLevel`).
  const recoveriesMax = requireCanon('character-derivation.recoveries')
    ? (cls?.recoveries ?? 0)
    : 0;

  const recoveryValue = requireCanon('character-derivation.recovery-value')
    ? Math.floor(maxStamina / 3)
    : 0;

  // Heroic resource: ClassSchema stores this as a plain string (the resource name).
  // Phase C wraps it in the { name, floor, max } shape with sentinel defaults.
  // If the schema is extended later to include floor/max, update here.
  const heroicResource: CharacterRuntime['heroicResource'] = {
    name: cls?.heroicResource ?? 'unknown',
    max: null,
    floor: 0,
  };

  const abilityIds: string[] = [];
  const skills = collectSkills(character);
  const languages = collectLanguages(character);

  const immunities: CharacterRuntime['immunities'] = [];
  const weaknesses: CharacterRuntime['weaknesses'] = [];

  // ── Size derivation ────────────────────────────────────────────────────────
  // Revenant inherits size from its former ancestry; all others read
  // defaultSize from their own ancestry entry. Falls back to '1M'.
  let size = '1M';
  if (character.ancestryId !== null) {
    if (character.ancestryId === 'revenant') {
      const formerAncestryId = character.ancestryChoices.formerAncestryId;
      if (formerAncestryId !== null) {
        const formerAncestry = staticData.ancestries.get(formerAncestryId);
        size = formerAncestry?.defaultSize ?? '1M';
      }
      // If formerAncestryId is null, keep '1M' (former life not yet chosen).
    } else {
      size = ancestry?.defaultSize ?? '1M';
    }
  }

  // ── Speed derivation ───────────────────────────────────────────────────────
  // Revenant speed is always 5 per canon, regardless of former ancestry.
  // Others read defaultSpeed from their ancestry. Falls back to 5.
  let speed: number;
  if (character.ancestryId === null || character.ancestryId === 'revenant') {
    speed = 5;
  } else {
    speed = ancestry?.defaultSpeed ?? 5;
  }

  // ── Ancestry immunities ────────────────────────────────────────────────────
  // grantedImmunities (and Dragon Knight Wyrmplate / Prismatic Scales) now
  // flow through the attachment pass via collectFromAncestry. The `immunities`
  // local is initialised empty here and populated by the attachment applier.

  // Stability and freeStrikeDamage base values; kit bonuses are layered on by
  // the attachment pass via collectFromKit.
  const stability = 0;
  const freeStrikeDamage = 2; // canon: free-strike base 2

  // Slice 6: weapon damage bonus starts at zero per tier. Kit + treasure
  // attachments add into these via `weapon-damage-bonus` effects.
  const weaponDamageBonus: CharacterRuntime['weaponDamageBonus'] = {
    melee: [0, 0, 0],
    ranged: [0, 0, 0],
  };

  return {
    characteristics,
    maxStamina,
    recoveriesMax,
    recoveryValue,
    heroicResource,
    abilityIds,
    skills,
    languages,
    immunities,
    weaknesses,
    speed,
    size,
    stability,
    freeStrikeDamage,
    weaponDamageBonus,
    // Phase 2b Group A+B (2b.3, 2b.4, 2b.5, 2b.8): scaffolding fields. The
    // applier populates these via the new effect kinds; this slice ships
    // empty / zero defaults with no read sites yet.
    conditionImmunities: [],
    disengageBonus: 0,
    meleeDistanceBonus: 0,
    rangedDistanceBonus: 0,
    skillEdges: [],
  };
}

function deriveCharacteristics(character: Character): Characteristics {
  if (!requireCanon('character-derivation.characteristics')) return ZERO_CHARACTERISTICS;
  if (!character.characteristicArray) return ZERO_CHARACTERISTICS;

  const out: Characteristics = { ...ZERO_CHARACTERISTICS };
  CANONICAL_CHARACTERISTIC_ORDER.forEach((slot, idx) => {
    const value = character.characteristicArray?.[idx];
    if (typeof value === 'number') {
      (out as Record<string, number>)[slot] = value;
    }
  });
  return out;
}

function deriveMaxStamina(
  character: Character,
  cls:
    | {
        startingStamina?: number;
        staminaPerLevel?: number;
      }
    | null
    | undefined,
): number {
  if (!cls) return 0;
  const base = cls.startingStamina ?? 0;
  const perLevel = (cls.staminaPerLevel ?? 0) * Math.max(0, character.level - 1);
  return base + perLevel;
}

function collectSkills(character: Character): string[] {
  const out: string[] = [];
  if (character.culture.environmentSkill) out.push(character.culture.environmentSkill);
  if (character.culture.organizationSkill) out.push(character.culture.organizationSkill);
  if (character.culture.upbringingSkill) out.push(character.culture.upbringingSkill);
  out.push(...character.careerChoices.skills);
  for (const lvl of Object.keys(character.levelChoices)) {
    const sk = character.levelChoices[lvl]?.skillId;
    if (sk) out.push(sk);
  }
  return [...new Set(out)];
}

function collectLanguages(character: Character): string[] {
  const out: string[] = [];
  if (character.culture.language) out.push(character.culture.language);
  out.push(...character.careerChoices.languages);
  return [...new Set(out)];
}
