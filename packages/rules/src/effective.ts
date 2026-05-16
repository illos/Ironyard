import type { ConditionType, Participant } from '@ironyard/shared';

// Phase 2b Group A+B — read-site helpers for per-encounter dynamic state.
// Pure functions over Participant. Consumers replace direct field reads
// with these so per-encounter dynamic effects layer on cleanly without
// requiring full CharacterRuntime re-derivation.
//
// Slice 2 — isImmuneToCondition. Generalizes 2b.15's Bloodless-specific
// suppression to a typed lookup over participant.conditionImmunities.
// Set-union semantics: additive across all sources.

export function isImmuneToCondition(p: Participant, cond: ConditionType): boolean {
  return p.conditionImmunities.includes(cond);
}
