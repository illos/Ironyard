import type { Character } from '@ironyard/shared';
import type { StaticDataBundle } from '../static-data';
import type { CharacterAttachment } from './types';
import { collectFromAncestry } from './collectors/ancestry';
import { collectFromClassFeatures } from './collectors/class-features';
import { collectFromLevelPicks } from './collectors/level-picks';
import { collectFromKit } from './collectors/kit';
import { collectFromItems } from './collectors/items';
import { collectFromTitle } from './collectors/title';

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
