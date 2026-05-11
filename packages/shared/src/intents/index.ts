// Payload schemas, one per intent type. Phase 1 ships these incrementally —
// slice 1: JoinSession, LeaveSession, Note. Slice 3: StartEncounter,
// BringCharacterIntoEncounter, RollPower, ApplyDamage. Slice 4: StartRound,
// EndRound, StartTurn, EndTurn, SetInitiative. Slice 5: SetCondition,
// RemoveCondition, RollResistance. Slice 7: GainResource, SpendResource,
// SetResource, SpendSurge, SpendRecovery, ApplyHeal, GainMalice, SpendMalice.
// The blanket IntentSchema.payload stays z.unknown() until enough types exist
// to warrant a discriminated union.

export { ApplyDamagePayloadSchema } from './apply-damage';
export type { ApplyDamagePayload } from './apply-damage';
export { ApplyHealPayloadSchema } from './apply-heal';
export type { ApplyHealPayload } from './apply-heal';
export { BringCharacterIntoEncounterPayloadSchema } from './bring-character-into-encounter';
export type { BringCharacterIntoEncounterPayload } from './bring-character-into-encounter';
export { EndEncounterPayloadSchema } from './end-encounter';
export type { EndEncounterPayload } from './end-encounter';
export { GainMalicePayloadSchema } from './gain-malice';
export type { GainMalicePayload } from './gain-malice';
export { GainResourcePayloadSchema } from './gain-resource';
export type { GainResourcePayload } from './gain-resource';
export { JoinLobbyPayloadSchema } from './join-lobby';
export type { JoinLobbyPayload } from './join-lobby';
export { LeaveLobbyPayloadSchema } from './leave-lobby';
export type { LeaveLobbyPayload } from './leave-lobby';
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
export { SetResourcePayloadSchema } from './set-resource';
export type { SetResourcePayload } from './set-resource';
export { SetStaminaPayloadSchema } from './set-stamina';
export type { SetStaminaPayload } from './set-stamina';
export { SpendMalicePayloadSchema } from './spend-malice';
export type { SpendMalicePayload } from './spend-malice';
export { SpendRecoveryPayloadSchema } from './spend-recovery';
export type { SpendRecoveryPayload } from './spend-recovery';
export { SpendResourcePayloadSchema } from './spend-resource';
export type { SpendResourcePayload } from './spend-resource';
export { SpendSurgePayloadSchema } from './spend-surge';
export type { SpendSurgePayload } from './spend-surge';
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
  ApplyHeal: 'ApplyHeal',
  BringCharacterIntoEncounter: 'BringCharacterIntoEncounter',
  EndEncounter: 'EndEncounter',
  EndRound: 'EndRound',
  EndTurn: 'EndTurn',
  GainMalice: 'GainMalice',
  GainResource: 'GainResource',
  JoinLobby: 'JoinLobby',
  LeaveLobby: 'LeaveLobby',
  Note: 'Note',
  RemoveCondition: 'RemoveCondition',
  RollPower: 'RollPower',
  RollResistance: 'RollResistance',
  SetCondition: 'SetCondition',
  SetInitiative: 'SetInitiative',
  SetResource: 'SetResource',
  SetStamina: 'SetStamina',
  SpendMalice: 'SpendMalice',
  SpendRecovery: 'SpendRecovery',
  SpendResource: 'SpendResource',
  SpendSurge: 'SpendSurge',
  StartEncounter: 'StartEncounter',
  StartRound: 'StartRound',
  StartTurn: 'StartTurn',
  Undo: 'Undo',
} as const;
export type KnownIntentType = (typeof IntentTypes)[keyof typeof IntentTypes];
