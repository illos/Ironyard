import type { Intent, MaliceState, Member, Participant } from '@ironyard/shared';
import type { StaticDataBundle } from './static-data';

// The lobby roster is a flat list of fully-materialized participants.
// `RosterEntry` exists as a forward-compatible seam for any future roster
// variant (e.g. pre-staged join requests); today it is structurally `Participant`.
export type RosterEntry = Participant;

export function isParticipant(e: RosterEntry): e is Participant {
  return e.kind === 'pc' || e.kind === 'monster';
}

// Context threaded through every applyIntent call. Most handlers ignore it;
// applyStartEncounter uses staticData to materialize PC participants.
export type ReducerContext = { staticData: StaticDataBundle };

// The DO stamps `timestamp` before calling applyIntent — the reducer signature
// uses StampedIntent so handlers don't need to second-guess that contract.
export type StampedIntent = Intent & { timestamp: number };

// Handlers return DerivedIntent[] for any cascade (e.g. RollPower → ApplyDamage).
// The DO fills in id / timestamp / campaignId before recursively applying.
export type DerivedIntent = Omit<Intent, 'id' | 'timestamp' | 'campaignId'>;

export type NoteEntry = {
  intentId: string;
  actorId: string;
  text: string;
  timestamp: number;
};

// Slice 6: per-actor turn-scoped flags consulted by condition hooks. Today only
// `dazeActionUsedThisTurn` is tracked (Dazed allows one of {main, maneuver, move}
// per turn — canon §3.5.2 / §4.9). Slice 7 will replace this with the full
// canon §4.10 record (mainSpent, maneuversSpent, etc.) without renaming the
// field. Map keys are participant ids; absent entries default to all-false.
export type TurnState = {
  dazeActionUsedThisTurn: boolean;
};

// Encounter-phase-only state. `participants` moved to CampaignState so they
// survive EndEncounter. This type holds only the transient combat-tracking data.
export type EncounterPhase = {
  id: string;
  // Slice 4: turn state. `currentRound` is null between rounds; `activeParticipantId`
  // is null when no one's turn is currently running (between turns or rounds).
  // `turnOrder` is the explicit initiative list; SetInitiative replaces it.
  currentRound: number | null;
  turnOrder: string[];
  activeParticipantId: string | null;
  // Slice 6: per-actor turn-state flags. `StartTurn` resets the entry for the
  // starting participant; `EndTurn` clears it. Empty by default.
  turnState: Record<string, TurnState>;
  // Slice 7: Director's Malice (canon §5.5). Encounter-scoped pool. Initialized
  // by `StartEncounter`. `current` may be negative (canon explicitly permits).
  // `lastMaliciousStrikeRound` is reserved for the canon §5.5 "not two rounds
  // in a row" rule; slice 7 only initializes it to null.
  malice: MaliceState;
};

// Keep ActiveEncounter as an alias for backwards compatibility within this
// package (turn.ts imports it). Will be cleaned up in a follow-up.
export type ActiveEncounter = EncounterPhase;

export type CampaignState = {
  campaignId: string;
  // Cached from campaigns.owner_id at load(); immutable per campaign for v1.
  // Used by the reducer to authorise owner-only intents without a D1 round-trip.
  ownerId: string;
  // The user currently behind the screen. Defaults to ownerId on creation.
  // Mutated by JumpBehindScreen. Operational "director-only" intents are
  // gated on actor.userId === activeDirectorId.
  activeDirectorId: string;
  seq: number; // last applied intent seq
  connectedMembers: Member[];
  notes: NoteEntry[];
  // Participants for the current encounter. Empty between encounters.
  // StartEncounter replaces this list atomically.
  participants: RosterEntry[];
  // Encounter phase. null when there is no active encounter.
  encounter: EncounterPhase | null;
  // Party victories earned this session. Drained by Respite to per-character XP.
  partyVictories: number;
  // The active session ID. null when no session is running.
  currentSessionId: string | null;
  // Character IDs attending the current session.
  attendingCharacterIds: string[];
  // Hero tokens available this session.
  heroTokens: number;
};

export type LogEntry = {
  kind: 'info' | 'error' | 'warning';
  text: string;
  intentId: string;
};

export type ValidationError = { code: string; message: string };

export type IntentResult = {
  state: CampaignState;
  derived: DerivedIntent[];
  log: LogEntry[];
  errors?: ValidationError[];
};

export function emptyCampaignState(campaignId: string, ownerId: string): CampaignState {
  return {
    campaignId,
    ownerId,
    activeDirectorId: ownerId,
    seq: 0,
    connectedMembers: [],
    notes: [],
    participants: [],
    encounter: null,
    partyVictories: 0,
    currentSessionId: null,
    attendingCharacterIds: [],
    heroTokens: 0,
  };
}
