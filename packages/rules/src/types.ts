import type { Intent, Member } from '@ironyard/shared';

// The DO stamps `timestamp` before calling applyIntent — the reducer signature
// uses StampedIntent so handlers don't need to second-guess that contract.
export type StampedIntent = Intent & { timestamp: number };

export type NoteEntry = {
  intentId: string;
  actorId: string;
  text: string;
  timestamp: number;
};

export type SessionState = {
  sessionId: string;
  seq: number; // last applied intent seq
  connectedMembers: Member[];
  notes: NoteEntry[];
};

export type LogEntry = {
  kind: 'info' | 'error';
  text: string;
  intentId: string;
};

export type ValidationError = { code: string; message: string };

export type IntentResult = {
  state: SessionState;
  derived: Intent[];
  log: LogEntry[];
  errors?: ValidationError[];
};

export function emptySessionState(sessionId: string): SessionState {
  return {
    sessionId,
    seq: 0,
    connectedMembers: [],
    notes: [],
  };
}
