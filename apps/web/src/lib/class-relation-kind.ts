import type { TargetingRelationKind } from '@ironyard/shared';

/**
 * Maps a participant's `className` (lower-cased) to its targeting relation kind.
 * Only the three classes that have persistent targeting relations are listed:
 * Censor → Judgment, Tactician → Mark, Null → Null Field.
 *
 * Used by ParticipantRow (chips), PlayerSheetPanel (card), and FullSheetTab (card).
 */
export const CLASS_RELATION_KIND: Record<string, TargetingRelationKind | undefined> = {
  censor: 'judged',
  tactician: 'marked',
  null: 'nullField',
};
