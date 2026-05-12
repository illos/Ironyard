import type { Character } from '@ironyard/shared';
import type { StaticDataBundle } from '../../static-data';
import type { CharacterAttachment } from '../types';

export function collectFromAncestry(
  character: Character,
  staticData: StaticDataBundle,
): CharacterAttachment[] {
  if (character.ancestryId === null) return [];

  // Revenant does not inherit former-ancestry immunities (canon).
  const ancestry = staticData.ancestries.get(character.ancestryId);
  if (!ancestry) return [];

  const out: CharacterAttachment[] = [];

  // requireCanonSlug omitted — Slice 6 adds canon entries for this category.
  for (const entry of ancestry.grantedImmunities ?? []) {
    out.push({
      source: {
        kind: 'ancestry-trait',
        id: `${character.ancestryId}.granted-immunity.${entry.kind}`,
      },
      effect: { kind: 'immunity', damageKind: entry.kind, value: entry.value },
    });
  }

  if (character.ancestryId === 'dragon-knight') {
    const { wyrmplateType, prismaticScalesType } = character.ancestryChoices;
    if (wyrmplateType !== null) {
      out.push({
        source: {
          kind: 'ancestry-trait',
          id: 'dragon-knight.wyrmplate',
        },
        effect: { kind: 'immunity', damageKind: wyrmplateType, value: 'level' },
      });
    }
    if (prismaticScalesType !== null) {
      out.push({
        source: {
          kind: 'ancestry-trait',
          id: 'dragon-knight.prismatic-scales',
        },
        effect: { kind: 'immunity', damageKind: prismaticScalesType, value: 'level' },
      });
    }
  }

  return out;
}
