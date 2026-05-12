// Override descriptor types for hand-authored structured effect data.
// Empty in Epic 2A — grows in 2B when the CharacterAttachment activation
// engine defines what fields each override carries (e.g. stat modifiers,
// granted abilities, condition immunities).

export type ItemOverride = Record<string, never>;
export type KitOverride = Record<string, never>;
export type AbilityOverride = Record<string, never>;
export type TitleOverride = Record<string, never>;
