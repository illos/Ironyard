// The rules engine. Pure, stateless. Same code runs in the DO (authoritative)
// and — eventually — the client (optimistic). Phase 1 slice 1 ships three
// intent types (JoinLobby, LeaveLobby, Note); subsequent slices add rolls,
// damage, conditions, resources, undo.

export const PACKAGE = '@ironyard/rules' as const;

export { applyIntent } from './reducer';
export { canDispatch } from './permissions';
export { emptyCampaignState, isParticipant } from './types';
export { sumPartyVictories, aliveHeroes, averageVictoriesAlive, windedValue, participantSide, nextPickingSide } from './state-helpers';
export type {
  ActiveEncounter,
  CampaignState,
  DerivedIntent,
  EncounterPhase,
  IntentResult,
  LogEntry,
  NoteEntry,
  ReducerContext,
  RosterEntry,
  StampedIntent,
  ValidationError,
} from './types';

export { applyDamageStep } from './damage';
export { applyKnockOut, applyTransitionSideEffects, recomputeStaminaState } from './stamina';
export { cancelEdgesAndBanes, resolvePowerRoll, tierFromTotal } from './power-roll';
export type { PowerRollOutcome, Tier } from './power-roll';

export { requireCanon } from './require-canon';
export type { CanonSlug, CanonStatus } from './canon-status.generated';
export { canonStatus } from './canon-status.generated';

export type { StaticDataBundle } from './static-data';
export { ResolvedKitSchema } from './static-data';
export type { ResolvedKit } from './static-data';

export { deriveCharacterRuntime } from './derive-character-runtime';
export type { CharacterRuntime } from './derive-character-runtime';

export { HEROIC_RESOURCES, getResourceConfigForParticipant } from './heroic-resources';
export type { HeroicResourceConfig, TurnStartGain } from './heroic-resources';

// Re-export hand-authored override tables that consumers outside `@ironyard/data`
// (e.g. the API Worker, which only depends on `@ironyard/rules` + `@ironyard/shared`)
// still need at intent-stamping time.
export { CONSUMABLE_HEAL_AMOUNTS } from '@ironyard/data';
