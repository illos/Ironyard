// Payload schemas, one per intent type. Phase 1 slice 1 ships three; later
// slices add rolls, damage, conditions, resources, etc. The blanket
// IntentSchema.payload stays z.unknown() until enough types exist to make a
// discriminated union worthwhile (avoids two refactors).

export { JoinSessionPayloadSchema } from './join-session';
export type { JoinSessionPayload } from './join-session';
export { LeaveSessionPayloadSchema } from './leave-session';
export type { LeaveSessionPayload } from './leave-session';
export { NotePayloadSchema } from './note';
export type { NotePayload } from './note';

export const IntentTypes = {
  JoinSession: 'JoinSession',
  LeaveSession: 'LeaveSession',
  Note: 'Note',
} as const;
export type KnownIntentType = (typeof IntentTypes)[keyof typeof IntentTypes];
