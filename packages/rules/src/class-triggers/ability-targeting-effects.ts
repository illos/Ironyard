import type { TargetingRelationKind } from '@ironyard/shared';

// Pass 3 Slice 2b — auto-set registry for UseAbility → SetTargetingRelation
// derivation. When UseAbility resolves an ability whose id is in this map
// and targetIds is non-empty, the reducer emits a derived
// SetTargetingRelation per target. mode: 'replace' first clears the existing
// relation array (one SetTargetingRelation with present:false per existing
// entry), then adds the new target(s).
//
// Canon-verified against apps/web/public/data/abilities.json:
//   - 'censor-judgment-t1' raw: "The target is judged by you until the end
//     of the encounter, you use this ability again, you willingly end this
//     effect (no action required), or another censor judges the target."
//     → cap-1, replaces on re-cast.
//   - 'tactician-mark-t1' raw: "The target is marked by you until the end
//     of the encounter, until you are dying, or until you use this ability
//     again... You can initially mark only one creature using this ability."
//     → cap-1, replaces on re-cast. (Tactician class features at higher
//     levels mark additional creatures simultaneously; those land with the
//     Q18 / 2b.7 class-feature pipeline and would add additional registry
//     entries with mode: 'add'.)
export type AbilityTargetingEffect = {
  relationKind: TargetingRelationKind;
  mode: 'replace' | 'add';
};

export const ABILITY_TARGETING_EFFECTS: Record<string, AbilityTargetingEffect> = {
  'censor-judgment-t1': { relationKind: 'judged', mode: 'replace' },
  'tactician-mark-t1': { relationKind: 'marked', mode: 'replace' },
};
