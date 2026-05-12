import type { Character } from '@ironyard/shared';
import { KIT_OVERRIDES } from '@ironyard/data';
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
  if (kit.meleeDamageBonus) {
    out.push({
      source: { kind: 'kit', id: `${kit.id}.melee-damage-bonus` },
      effect: { kind: 'free-strike-damage', delta: kit.meleeDamageBonus },
    });
  }
  if (kit.speedBonus) {
    out.push({
      source: { kind: 'kit', id: `${kit.id}.speed-bonus` },
      effect: { kind: 'stat-mod', stat: 'speed', delta: kit.speedBonus },
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
