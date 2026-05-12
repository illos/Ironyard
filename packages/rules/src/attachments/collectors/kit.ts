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

  return out;
}
