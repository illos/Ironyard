// Payload schemas, one per intent type. Phase 1 ships these incrementally —
// slice 1: JoinSession, LeaveSession, Note. Slice 3: StartEncounter,
// BringCharacterIntoEncounter, RollPower, ApplyDamage. Slice 4: StartRound,
// EndRound, StartTurn, EndTurn, SetInitiative. Slice 5: SetCondition,
// RemoveCondition, RollResistance. Slice 7: GainResource, SpendResource,
// SetResource, SpendSurge, SpendRecovery, ApplyHeal, GainMalice, SpendMalice.
// The blanket IntentSchema.payload stays z.unknown() until enough types exist
// to warrant a discriminated union.

export { AddMonsterPayloadSchema } from './add-monster';
export type { AddMonsterPayload } from './add-monster';
export { ApproveCharacterPayloadSchema } from './approve-character';
export type { ApproveCharacterPayload } from './approve-character';
export { ApplyDamagePayloadSchema } from './apply-damage';
export type { ApplyDamagePayload } from './apply-damage';
export { ApplyHealPayloadSchema } from './apply-heal';
export type { ApplyHealPayload } from './apply-heal';
export { ClearLobbyPayloadSchema } from './clear-lobby';
export type { ClearLobbyPayload } from './clear-lobby';
export { DenyCharacterPayloadSchema } from './deny-character';
export type { DenyCharacterPayload } from './deny-character';
export { EndEncounterPayloadSchema } from './end-encounter';
export type { EndEncounterPayload } from './end-encounter';
export { EquipItemPayloadSchema } from './equip-item';
export type { EquipItemPayload } from './equip-item';
export { GainMalicePayloadSchema } from './gain-malice';
export type { GainMalicePayload } from './gain-malice';
export { GainResourcePayloadSchema } from './gain-resource';
export type { GainResourcePayload } from './gain-resource';
export { JoinLobbyPayloadSchema } from './join-lobby';
export type { JoinLobbyPayload } from './join-lobby';
export { JumpBehindScreenPayloadSchema } from './jump-behind-screen';
export type { JumpBehindScreenPayload } from './jump-behind-screen';
export { KickPlayerPayloadSchema } from './kick-player';
export type { KickPlayerPayload } from './kick-player';
export { LeaveLobbyPayloadSchema } from './leave-lobby';
export type { LeaveLobbyPayload } from './leave-lobby';
export {
  LoadEncounterTemplateClientPayloadSchema,
  LoadEncounterTemplatePayloadSchema,
  LoadEncounterTemplateResolvedEntrySchema,
} from './load-encounter-template';
export type {
  LoadEncounterTemplateClientPayload,
  LoadEncounterTemplatePayload,
  LoadEncounterTemplateResolvedEntry,
} from './load-encounter-template';
export { NotePayloadSchema } from './note';
export type { NotePayload } from './note';
export { PushItemPayloadSchema } from './push-item';
export type { PushItemPayload } from './push-item';
export { RemoveApprovedCharacterPayloadSchema } from './remove-approved-character';
export type { RemoveApprovedCharacterPayload } from './remove-approved-character';
export { RespitePayloadSchema } from './respite';
export type { RespitePayload, SafelyCarryWarning } from './respite';
export { RemoveConditionPayloadSchema } from './remove-condition';
export type { RemoveConditionPayload } from './remove-condition';
export { RemoveParticipantPayloadSchema } from './remove-participant';
export type { RemoveParticipantPayload } from './remove-participant';
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
export {
  MonsterEntrySchema,
  StartEncounterPayloadSchema,
  StartEncounterStampedMonsterSchema,
  StartEncounterStampedPcSchema,
} from './start-encounter';
export type {
  MonsterEntry,
  StartEncounterPayload,
  StartEncounterStampedMonster,
  StartEncounterStampedPc,
} from './start-encounter';

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

export { SubmitCharacterPayloadSchema } from './submit-character';
export type { SubmitCharacterPayload } from './submit-character';
export { SwapKitPayloadSchema } from './swap-kit';
export type { SwapKitPayload } from './swap-kit';
export { UnequipItemPayloadSchema } from './unequip-item';
export type { UnequipItemPayload } from './unequip-item';
export { UndoPayloadSchema } from './undo';
export type { UndoPayload } from './undo';
export { UseConsumablePayloadSchema } from './use-consumable';
export type { UseConsumablePayload } from './use-consumable';

export const IntentTypes = {
  AddMonster: 'AddMonster',
  ApplyDamage: 'ApplyDamage',
  ApplyHeal: 'ApplyHeal',
  ApproveCharacter: 'ApproveCharacter',
  ClearLobby: 'ClearLobby',
  DenyCharacter: 'DenyCharacter',
  EndEncounter: 'EndEncounter',
  EndRound: 'EndRound',
  EndTurn: 'EndTurn',
  EquipItem: 'EquipItem',
  GainMalice: 'GainMalice',
  GainResource: 'GainResource',
  JoinLobby: 'JoinLobby',
  JumpBehindScreen: 'JumpBehindScreen',
  KickPlayer: 'KickPlayer',
  LeaveLobby: 'LeaveLobby',
  LoadEncounterTemplate: 'LoadEncounterTemplate',
  Note: 'Note',
  PushItem: 'PushItem',
  RemoveApprovedCharacter: 'RemoveApprovedCharacter',
  RemoveCondition: 'RemoveCondition',
  RemoveParticipant: 'RemoveParticipant',
  RollPower: 'RollPower',
  RollResistance: 'RollResistance',
  SetCondition: 'SetCondition',
  SetInitiative: 'SetInitiative',
  SetResource: 'SetResource',
  SetStamina: 'SetStamina',
  SpendMalice: 'SpendMalice',
  SpendRecovery: 'SpendRecovery',
  SpendResource: 'SpendResource',
  Respite: 'Respite',
  SpendSurge: 'SpendSurge',
  StartEncounter: 'StartEncounter',
  StartRound: 'StartRound',
  StartTurn: 'StartTurn',
  SubmitCharacter: 'SubmitCharacter',
  SwapKit: 'SwapKit',
  UnequipItem: 'UnequipItem',
  Undo: 'Undo',
  UseConsumable: 'UseConsumable',
} as const;
export type KnownIntentType = (typeof IntentTypes)[keyof typeof IntentTypes];
