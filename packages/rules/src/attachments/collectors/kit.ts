import { KIT_OVERRIDES } from '@ironyard/data';
import type { Character } from '@ironyard/shared';
import type { StaticDataBundle } from '../../static-data';
import type { CharacterAttachment } from '../types';

export function collectFromKit(
  character: Character,
  staticData: StaticDataBundle,
): CharacterAttachment[] {
  if (!character.kitId) return [];
  const kit = staticData.kits.get(character.kitId);
  if (!kit) return [];

  const out: CharacterAttachment[] = [];

  // ── Kit stat bonuses (from kit's structural data) ──────────────────────
  // requireCanonSlug omitted — Slice 6 adds canon entries.
  if (kit.staminaBonus) {
    out.push({
      source: { kind: 'kit', id: `${kit.id}.stamina-bonus` },
      effect: { kind: 'stat-mod', stat: 'maxStamina', delta: kit.staminaBonus },
    });
  }
  if (kit.stabilityBonus) {
    out.push({
      source: { kind: 'kit', id: `${kit.id}.stability-bonus` },
      effect: { kind: 'stat-mod', stat: 'stability', delta: kit.stabilityBonus },
    });
  }
  // Slice 6 / Epic 2C § 10.8: emit per-tier weapon-damage-bonus effects when
  // the kit has any non-zero tier value. The applier folds these into
  // `runtime.weaponDamageBonus.{melee,ranged}`; RollPower picks the tier-N slot
  // when the ability has Weapon + Melee/Ranged. Previous behavior was to add
  // the highest-echelon flat number to `freeStrikeDamage` — too narrow (canon
  // applies to *any* damage-dealing Melee+Weapon ability) and tier-collapsed.
  const melee = kit.meleeDamageBonusPerTier;
  if (melee.some((n) => n !== 0)) {
    out.push({
      source: { kind: 'kit', id: `${kit.id}.melee-damage-bonus` },
      effect: { kind: 'weapon-damage-bonus', appliesTo: 'melee', perTier: melee },
    });
  }
  const ranged = kit.rangedDamageBonusPerTier;
  if (ranged.some((n) => n !== 0)) {
    out.push({
      source: { kind: 'kit', id: `${kit.id}.ranged-damage-bonus` },
      effect: { kind: 'weapon-damage-bonus', appliesTo: 'ranged', perTier: ranged },
    });
  }
  // Slice 10 / Phase 2b Group A+B (2b.3): always-on flat distance + disengage
  // bonuses. Applier folds these into runtime.{melee,ranged}DistanceBonus and
  // runtime.disengageBonus; StartEncounter snapshots to the participant.
  // AoE sizes (burst/cube/wall) are NOT adjusted per canon (Kits.md:135) —
  // the read sites (RollPower / UI) gate on the ability's distance kind.
  // Engine doesn't currently ship a Disengage intent (per spec Q4 +
  // project_no_movement_tracking); the disengage bonus flows through to the
  // UI for player adjudication.
  if (kit.meleeDistanceBonus > 0) {
    out.push({
      source: { kind: 'kit', id: `${kit.id}.melee-distance-bonus` },
      effect: {
        kind: 'weapon-distance-bonus',
        appliesTo: 'melee',
        delta: kit.meleeDistanceBonus,
      },
    });
  }
  if (kit.rangedDistanceBonus > 0) {
    out.push({
      source: { kind: 'kit', id: `${kit.id}.ranged-distance-bonus` },
      effect: {
        kind: 'weapon-distance-bonus',
        appliesTo: 'ranged',
        delta: kit.rangedDistanceBonus,
      },
    });
  }
  if (kit.disengageBonus > 0) {
    out.push({
      source: { kind: 'kit', id: `${kit.id}.disengage-bonus` },
      effect: { kind: 'disengage-bonus', delta: kit.disengageBonus },
    });
  }
  if (kit.speedBonus) {
    out.push({
      source: { kind: 'kit', id: `${kit.id}.speed-bonus` },
      effect: { kind: 'stat-mod', stat: 'speed', delta: kit.speedBonus },
    });
  }

  // Kit's signature ability — grants the ability to the character so it
  // appears in runtime.abilityIds and on the sheet / combat tracker.
  if (kit.signatureAbilityId) {
    out.push({
      source: { kind: 'kit', id: `${kit.id}.signature` },
      effect: { kind: 'grant-ability', abilityId: kit.signatureAbilityId },
    });
  }

  // ── Hand-authored overrides (kit-keyword-gated leveled treasures etc.) ──
  // Populated in Task 4.6. Empty today is a no-op.
  const override = KIT_OVERRIDES[kit.id];
  if (override) {
    out.push(...override.attachments);
  }

  return out;
}
