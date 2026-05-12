// CharacterAttachment is the data carrier for any effect that modifies the
// derived CharacterRuntime. Sources (ancestry, kit, item, …) produce these;
// the applier folds them into the runtime. See
// docs/superpowers/specs/2026-05-12-phase-2-epic-2b-attachment-engine-design.md
// for the design rationale.

export type AttachmentSource = {
  kind:
    | 'ancestry-trait'
    | 'ancestry-signature'
    | 'class-feature'
    | 'level-pick'
    | 'kit'
    | 'kit-keyword-bonus'
    | 'item'
    | 'title';
  id: string;
  requireCanonSlug?: string;
};

export type AttachmentCondition =
  | { kind: 'kit-has-keyword'; keyword: string }
  | { kind: 'item-equipped' };

export type StatModField =
  | 'maxStamina'
  | 'recoveriesMax'
  | 'recoveryValue'
  | 'speed'
  | 'stability';

export type StatReplaceField = 'size';

export type AttachmentEffect =
  | { kind: 'stat-mod'; stat: StatModField; delta: number }
  | { kind: 'stat-replace'; stat: StatReplaceField; value: number | string }
  | { kind: 'grant-ability'; abilityId: string }
  | { kind: 'grant-skill'; skill: string }
  | { kind: 'grant-language'; language: string }
  | { kind: 'immunity'; damageKind: string; value: number | 'level' }
  | { kind: 'weakness'; damageKind: string; value: number | 'level' }
  | { kind: 'free-strike-damage'; delta: number };

export type CharacterAttachment = {
  source: AttachmentSource;
  condition?: AttachmentCondition;
  effect: AttachmentEffect;
};
