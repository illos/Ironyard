// The rules engine. Pure, stateless. Same code runs in the DO and the client.
//
// Phase 0 ships the canon registry + requireCanon gate (item 2).
// Phase 1 adds applyIntent, inverse, canDispatch, and the intent/condition/resource modules.

export const PACKAGE = '@ironyard/rules' as const;

export { requireCanon } from './require-canon';
export type { CanonSlug, CanonStatus } from './canon-status.generated';
export { canonStatus } from './canon-status.generated';
