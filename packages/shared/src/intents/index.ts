// Payload schemas, one per intent type. Phase 1 ships these incrementally —
// slice 1: JoinSession, LeaveSession, Note. Slice 3: StartEncounter,
// BringCharacterIntoEncounter, RollPower, ApplyDamage. The blanket
// IntentSchema.payload stays z.unknown() until enough types exist to warrant
// a discriminated union.

export { ApplyDamagePayloadSchema } from './apply-damage';
export type { ApplyDamagePayload } from './apply-damage';
export { BringCharacterIntoEncounterPayloadSchema } from './bring-character-into-encounter';
export type { BringCharacterIntoEncounterPayload } from './bring-character-into-encounter';
export { JoinSessionPayloadSchema } from './join-session';
export type { JoinSessionPayload } from './join-session';
export { LeaveSessionPayloadSchema } from './leave-session';
export type { LeaveSessionPayload } from './leave-session';
export { NotePayloadSchema } from './note';
export type { NotePayload } from './note';
export { RollPowerPayloadSchema } from './roll-power';
export type { RollPowerPayload } from './roll-power';
export { StartEncounterPayloadSchema } from './start-encounter';
export type { StartEncounterPayload } from './start-encounter';

export const IntentTypes = {
  ApplyDamage: 'ApplyDamage',
  BringCharacterIntoEncounter: 'BringCharacterIntoEncounter',
  JoinSession: 'JoinSession',
  LeaveSession: 'LeaveSession',
  Note: 'Note',
  RollPower: 'RollPower',
  StartEncounter: 'StartEncounter',
} as const;
export type KnownIntentType = (typeof IntentTypes)[keyof typeof IntentTypes];
