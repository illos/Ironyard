// Payload schemas, one per intent type. Phase 1 ships these incrementally —
// slice 1: JoinSession, LeaveSession, Note. Slice 3: StartEncounter,
// BringCharacterIntoEncounter, RollPower, ApplyDamage. Slice 4: StartRound,
// EndRound, StartTurn, EndTurn, SetInitiative. Slice 5: SetCondition,
// RemoveCondition, RollResistance. The blanket IntentSchema.payload stays
// z.unknown() until enough types exist to warrant a discriminated union.

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
export { RemoveConditionPayloadSchema } from './remove-condition';
export type { RemoveConditionPayload } from './remove-condition';
export { RollPowerPayloadSchema } from './roll-power';
export type { RollPowerPayload } from './roll-power';
export { RollResistancePayloadSchema } from './roll-resistance';
export type { RollResistancePayload } from './roll-resistance';
export { SetConditionPayloadSchema } from './set-condition';
export type { SetConditionPayload } from './set-condition';
export { StartEncounterPayloadSchema } from './start-encounter';
export type { StartEncounterPayload } from './start-encounter';

export {
  EndRoundPayloadSchema,
  EndTurnPayloadSchema,
  SetInitiativePayloadSchema,
  StartRoundPayloadSchema,
  StartTurnPayloadSchema,
} from './turn';
export type {
  EndRoundPayload,
  EndTurnPayload,
  SetInitiativePayload,
  StartRoundPayload,
  StartTurnPayload,
} from './turn';

export { UndoPayloadSchema } from './undo';
export type { UndoPayload } from './undo';

export const IntentTypes = {
  ApplyDamage: 'ApplyDamage',
  BringCharacterIntoEncounter: 'BringCharacterIntoEncounter',
  EndRound: 'EndRound',
  EndTurn: 'EndTurn',
  JoinSession: 'JoinSession',
  LeaveSession: 'LeaveSession',
  Note: 'Note',
  RemoveCondition: 'RemoveCondition',
  RollPower: 'RollPower',
  RollResistance: 'RollResistance',
  SetCondition: 'SetCondition',
  SetInitiative: 'SetInitiative',
  StartEncounter: 'StartEncounter',
  StartRound: 'StartRound',
  StartTurn: 'StartTurn',
  Undo: 'Undo',
} as const;
export type KnownIntentType = (typeof IntentTypes)[keyof typeof IntentTypes];
