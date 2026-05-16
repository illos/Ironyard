import type { Character } from '@ironyard/shared';
import type { StaticDataBundle } from '../static-data';
import { collectFromAncestry } from './collectors/ancestry';
import { collectFromClassFeatures } from './collectors/class-features';
import { collectFromItems } from './collectors/items';
import { collectFromKit } from './collectors/kit';
import { collectFromLevelPicks } from './collectors/level-picks';
import { collectFromTitle } from './collectors/title';
import type { CharacterAttachment } from './types';

export function collectAttachments(
  character: Character,
  staticData: StaticDataBundle,
): CharacterAttachment[] {
  return [
    ...collectFromAncestry(character, staticData),
    ...collectFromClassFeatures(character, staticData),
    ...collectFromLevelPicks(character, staticData),
    ...collectFromKit(character, staticData),
    ...collectFromItems(character, staticData),
    ...collectFromTitle(character, staticData),
  ];
}
