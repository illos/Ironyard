import type { Intent, MaliceState, Member, Participant } from '@ironyard/shared';

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

export type ActiveEncounter = {
  id: string;
  participants: Participant[];
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

export type CampaignState = {
  campaignId: string;
  seq: number; // last applied intent seq
  connectedMembers: Member[];
  notes: NoteEntry[];
  encounter: ActiveEncounter | null;
};

export type LogEntry = {
  kind: 'info' | 'error';
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

export function emptyCampaignState(campaignId: string): CampaignState {
  return {
    campaignId,
    seq: 0,
    connectedMembers: [],
    notes: [],
    encounter: null,
  };
}
