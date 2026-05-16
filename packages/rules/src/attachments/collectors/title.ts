import { TITLE_OVERRIDES } from '@ironyard/data';
import type { Character } from '@ironyard/shared';
import type { StaticDataBundle } from '../../static-data';
import type { CharacterAttachment } from '../types';

export function collectFromTitle(
  character: Character,
  _staticData: StaticDataBundle,
): CharacterAttachment[] {
  if (!character.titleId) return [];
  const override = TITLE_OVERRIDES[character.titleId];
  if (!override) return [];
  return override.attachments;
}
