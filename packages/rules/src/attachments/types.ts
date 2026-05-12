// Re-export the canonical attachment types from @ironyard/shared. This file
// remains the rules-package entry point so existing imports don't break;
// the types themselves live in shared to avoid a rules ↔ data cycle.
export type {
  AttachmentSource,
  AttachmentCondition,
  AttachmentEffect,
  CharacterAttachment,
  StatModField,
  StatReplaceField,
} from '@ironyard/shared';
