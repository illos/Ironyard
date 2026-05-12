// Override descriptor types for hand-authored structured effect data.
// Each override entry carries a list of CharacterAttachment payloads that
// the rules engine folds in during attachment collection.

import type { CharacterAttachment } from '@ironyard/shared';

export type ItemOverride = { attachments: CharacterAttachment[] };
export type KitOverride = { attachments: CharacterAttachment[] };
export type AbilityOverride = { attachments: CharacterAttachment[] };
export type TitleOverride = { attachments: CharacterAttachment[] };
