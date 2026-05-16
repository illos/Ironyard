import { ITEM_OVERRIDES } from '@ironyard/data';
import type { Character } from '@ironyard/shared';
import type { StaticDataBundle } from '../../static-data';
import type { CharacterAttachment } from '../types';

export function collectFromItems(
  character: Character,
  _staticData: StaticDataBundle,
): CharacterAttachment[] {
  const out: CharacterAttachment[] = [];
  for (const entry of character.inventory) {
    if (!entry.equipped) continue;
    const override = ITEM_OVERRIDES[entry.itemId];
    if (!override) continue;
    out.push(...override.attachments);
  }
  return out;
}
