import type { Character } from '@ironyard/shared';
import { ABILITY_OVERRIDES } from '@ironyard/data';
import type { StaticDataBundle } from '../../static-data';
import type { CharacterAttachment } from '../types';

// Class features ARE abilities in Draw Steel. Iterate the character's
// level-pick ability ids and pull any matching ABILITY_OVERRIDES entries.
export function collectFromClassFeatures(
  character: Character,
  _staticData: StaticDataBundle,
): CharacterAttachment[] {
  const out: CharacterAttachment[] = [];
  for (const lvl of Object.keys(character.levelChoices)) {
    const choices = character.levelChoices[lvl];
    if (!choices) continue;
    for (const abilityId of [...choices.abilityIds, ...choices.subclassAbilityIds]) {
      const override = ABILITY_OVERRIDES[abilityId];
      if (override) out.push(...override.attachments);
    }
  }
  return out;
}
