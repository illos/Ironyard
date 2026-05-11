// The rules engine. Pure, stateless. Same code runs in the DO (authoritative)
// and — eventually — the client (optimistic). Phase 1 slice 1 ships three
// intent types (JoinSession, LeaveSession, Note); subsequent slices add rolls,
// damage, conditions, resources, undo.

export const PACKAGE = '@ironyard/rules' as const;

export { applyIntent } from './reducer';
export { emptySessionState } from './types';
export type {
  ActiveEncounter,
  DerivedIntent,
  IntentResult,
  LogEntry,
  NoteEntry,
  SessionState,
  StampedIntent,
  ValidationError,
} from './types';

export { applyDamageStep } from './damage';
export { cancelEdgesAndBanes, resolvePowerRoll, tierFromTotal } from './power-roll';
export type { PowerRollOutcome, Tier } from './power-roll';

export { requireCanon } from './require-canon';
export type { CanonSlug, CanonStatus } from './canon-status.generated';
export { canonStatus } from './canon-status.generated';
