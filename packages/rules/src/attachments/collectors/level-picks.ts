import type { Character } from '@ironyard/shared';
import type { StaticDataBundle } from '../../static-data';
import type { CharacterAttachment } from '../types';

export function collectFromLevelPicks(
  character: Character,
  _staticData: StaticDataBundle,
): CharacterAttachment[] {
  const out: CharacterAttachment[] = [];
  for (const lvl of Object.keys(character.levelChoices)) {
    const choices = character.levelChoices[lvl];
    if (!choices) continue;
    for (const abilityId of choices.abilityIds) {
      out.push({
        source: { kind: 'level-pick', id: `level-${lvl}.ability.${abilityId}` },
        effect: { kind: 'grant-ability', abilityId },
      });
    }
    for (const abilityId of choices.subclassAbilityIds) {
      out.push({
        source: { kind: 'level-pick', id: `level-${lvl}.subclass-ability.${abilityId}` },
        effect: { kind: 'grant-ability', abilityId },
      });
    }
  }
  return out;
}
