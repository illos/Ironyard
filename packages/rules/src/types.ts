import type { Intent, Member, Participant } from '@ironyard/shared';

// The DO stamps `timestamp` before calling applyIntent — the reducer signature
// uses StampedIntent so handlers don't need to second-guess that contract.
export type StampedIntent = Intent & { timestamp: number };

// Handlers return DerivedIntent[] for any cascade (e.g. RollPower → ApplyDamage).
// The DO fills in id / timestamp / sessionId before recursively applying.
export type DerivedIntent = Omit<Intent, 'id' | 'timestamp' | 'sessionId'>;

export type NoteEntry = {
  intentId: string;
  actorId: string;
  text: string;
  timestamp: number;
};

export type ActiveEncounter = {
  id: string;
  participants: Participant[];
};

export type SessionState = {
  sessionId: string;
  seq: number; // last applied intent seq
  connectedMembers: Member[];
  notes: NoteEntry[];
  activeEncounter: ActiveEncounter | null;
};

export type LogEntry = {
  kind: 'info' | 'error';
  text: string;
  intentId: string;
};

export type ValidationError = { code: string; message: string };

export type IntentResult = {
  state: SessionState;
  derived: DerivedIntent[];
  log: LogEntry[];
  errors?: ValidationError[];
};

export function emptySessionState(sessionId: string): SessionState {
  return {
    sessionId,
    seq: 0,
    connectedMembers: [],
    notes: [],
    activeEncounter: null,
  };
}
