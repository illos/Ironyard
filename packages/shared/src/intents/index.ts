// Payload schemas, one per intent type. The blanket IntentSchema.payload stays
// z.unknown() until enough types exist to warrant a discriminated union.

export { AddMonsterPayloadSchema } from './add-monster';
export type { AddMonsterPayload } from './add-monster';
export { AdjustVictoriesPayloadSchema } from './adjust-victories';
export type { AdjustVictoriesPayload } from './adjust-victories';
export { ApproveCharacterPayloadSchema } from './approve-character';
export type { ApproveCharacterPayload } from './approve-character';
export { ApplyDamagePayloadSchema } from './apply-damage';
export type { ApplyDamagePayload } from './apply-damage';
export { ApplyHealPayloadSchema } from './apply-heal';
export type { ApplyHealPayload } from './apply-heal';
export { ApplyParticipantOverridePayloadSchema } from './apply-participant-override';
export type { ApplyParticipantOverridePayload } from './apply-participant-override';
export { BecomeDoomedPayloadSchema } from './become-doomed';
export type { BecomeDoomedPayload } from './become-doomed';
export {
  RaiseOpenActionPayloadSchema,
  ClaimOpenActionPayloadSchema,
} from './raise-open-action';
export type {
  RaiseOpenActionPayload,
  ClaimOpenActionPayload,
} from './raise-open-action';
export { ClearLobbyPayloadSchema } from './clear-lobby';
export type { ClearLobbyPayload } from './clear-lobby';
export { ClearParticipantOverridePayloadSchema } from './clear-participant-override';
export type { ClearParticipantOverridePayload } from './clear-participant-override';
export { DenyCharacterPayloadSchema } from './deny-character';
export type { DenyCharacterPayload } from './deny-character';
export { EndEncounterPayloadSchema } from './end-encounter';
export type { EndEncounterPayload } from './end-encounter';
export { EndSessionPayloadSchema } from './end-session';
export type { EndSessionPayload } from './end-session';
export { EquipItemPayloadSchema } from './equip-item';
export type { EquipItemPayload } from './equip-item';
export { ExecuteTriggerPayloadSchema } from './execute-trigger';
export type { ExecuteTriggerPayload } from './execute-trigger';
export { GainHeroTokenPayloadSchema } from './gain-hero-token';
export type { GainHeroTokenPayload } from './gain-hero-token';
export { GainMalicePayloadSchema } from './gain-malice';
export type { GainMalicePayload } from './gain-malice';
export { GainResourcePayloadSchema } from './gain-resource';
export type { GainResourcePayload } from './gain-resource';
export { GrantExtraMainActionPayloadSchema } from './grant-extra-main-action';
export type { GrantExtraMainActionPayload } from './grant-extra-main-action';
export { JoinLobbyPayloadSchema } from './join-lobby';
export type { JoinLobbyPayload } from './join-lobby';
export { JumpBehindScreenPayloadSchema } from './jump-behind-screen';
export type { JumpBehindScreenPayload } from './jump-behind-screen';
export { KickPlayerPayloadSchema } from './kick-player';
export type { KickPlayerPayload } from './kick-player';
export { KnockUnconsciousPayloadSchema } from './knock-unconscious';
export type { KnockUnconsciousPayload } from './knock-unconscious';
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
export { MarkActionUsedPayloadSchema } from './mark-action-used';
export type { MarkActionUsedPayload } from './mark-action-used';
export { MarkSurprisedPayloadSchema } from './mark-surprised';
export type { MarkSurprisedPayload } from './mark-surprised';
export { NotePayloadSchema } from './note';
export type { NotePayload } from './note';
export { PickNextActorPayloadSchema } from './pick-next-actor';
export type { PickNextActorPayload } from './pick-next-actor';
export { PushItemPayloadSchema } from './push-item';
export type { PushItemPayload } from './push-item';
export { RemoveApprovedCharacterPayloadSchema } from './remove-approved-character';
export type { RemoveApprovedCharacterPayload } from './remove-approved-character';
export { RespitePayloadSchema } from './respite';
export type { RespitePayload, SafelyCarryWarning } from './respite';
export { ResolveTriggerOrderPayloadSchema } from './resolve-trigger-order';
export type { ResolveTriggerOrderPayload } from './resolve-trigger-order';
export { RemoveConditionPayloadSchema } from './remove-condition';
export type { RemoveConditionPayload } from './remove-condition';
export { RemoveParticipantPayloadSchema } from './remove-participant';
export type { RemoveParticipantPayload } from './remove-participant';
export { RollInitiativePayloadSchema } from './roll-initiative';
export type { RollInitiativePayload } from './roll-initiative';
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
export { SpendHeroTokenPayloadSchema } from './spend-hero-token';
export type { SpendHeroTokenPayload } from './spend-hero-token';
export { SpendMalicePayloadSchema } from './spend-malice';
export type { SpendMalicePayload } from './spend-malice';
export { SpendRecoveryPayloadSchema } from './spend-recovery';
export type { SpendRecoveryPayload } from './spend-recovery';
export { SpendResourcePayloadSchema } from './spend-resource';
export type { SpendResourcePayload } from './spend-resource';
export { SpendSurgePayloadSchema } from './spend-surge';
export type { SpendSurgePayload } from './spend-surge';
export { StaminaStateSchema, StaminaTransitionedPayloadSchema } from './stamina-transitioned';
export type { StaminaState, StaminaTransitionedPayload } from './stamina-transitioned';
export { StartMaintenancePayloadSchema } from './start-maintenance';
export type { StartMaintenancePayload } from './start-maintenance';
export { StopMaintenancePayloadSchema } from './stop-maintenance';
export type { StopMaintenancePayload } from './stop-maintenance';
export { TroubadourAutoRevivePayloadSchema } from './troubadour-auto-revive';
export type { TroubadourAutoRevivePayload } from './troubadour-auto-revive';
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

export { StartSessionPayloadSchema } from './start-session';
export type { StartSessionPayload } from './start-session';

export {
  EndRoundPayloadSchema,
  EndTurnPayloadSchema,
  StartRoundPayloadSchema,
  StartTurnPayloadSchema,
} from './turn';
export type {
  EndRoundPayload,
  EndTurnPayload,
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
export { UpdateSessionAttendancePayloadSchema } from './update-session-attendance';
export type { UpdateSessionAttendancePayload } from './update-session-attendance';
export { UseAbilityPayloadSchema } from './use-ability';
export type { UseAbilityPayload } from './use-ability';
export { UseConsumablePayloadSchema } from './use-consumable';
export type { UseConsumablePayload } from './use-consumable';

export const IntentTypes = {
  AddMonster: 'AddMonster',
  AdjustVictories: 'AdjustVictories',
  ApplyDamage: 'ApplyDamage',
  ApplyHeal: 'ApplyHeal',
  ApplyParticipantOverride: 'ApplyParticipantOverride',
  ApproveCharacter: 'ApproveCharacter',
  BecomeDoomed: 'BecomeDoomed',
  ClaimOpenAction: 'ClaimOpenAction',
  ClearLobby: 'ClearLobby',
  ClearParticipantOverride: 'ClearParticipantOverride',
  DenyCharacter: 'DenyCharacter',
  EndEncounter: 'EndEncounter',
  EndRound: 'EndRound',
  EndSession: 'EndSession',
  EndTurn: 'EndTurn',
  EquipItem: 'EquipItem',
  ExecuteTrigger: 'ExecuteTrigger',
  GainHeroToken: 'GainHeroToken',
  GainMalice: 'GainMalice',
  GainResource: 'GainResource',
  GrantExtraMainAction: 'GrantExtraMainAction',
  JoinLobby: 'JoinLobby',
  JumpBehindScreen: 'JumpBehindScreen',
  KickPlayer: 'KickPlayer',
  KnockUnconscious: 'KnockUnconscious',
  LeaveLobby: 'LeaveLobby',
  LoadEncounterTemplate: 'LoadEncounterTemplate',
  MarkActionUsed: 'MarkActionUsed',
  MarkSurprised: 'MarkSurprised',
  Note: 'Note',
  PickNextActor: 'PickNextActor',
  PushItem: 'PushItem',
  RemoveApprovedCharacter: 'RemoveApprovedCharacter',
  RemoveCondition: 'RemoveCondition',
  RemoveParticipant: 'RemoveParticipant',
  RaiseOpenAction: 'RaiseOpenAction',
  RollInitiative: 'RollInitiative',
  RollPower: 'RollPower',
  RollResistance: 'RollResistance',
  SetCondition: 'SetCondition',
  SetResource: 'SetResource',
  SetStamina: 'SetStamina',
  SpendHeroToken: 'SpendHeroToken',
  SpendMalice: 'SpendMalice',
  SpendRecovery: 'SpendRecovery',
  SpendResource: 'SpendResource',
  Respite: 'Respite',
  ResolveTriggerOrder: 'ResolveTriggerOrder',
  SpendSurge: 'SpendSurge',
  StartEncounter: 'StartEncounter',
  StartRound: 'StartRound',
  StaminaTransitioned: 'StaminaTransitioned',
  StartMaintenance: 'StartMaintenance',
  StartSession: 'StartSession',
  StartTurn: 'StartTurn',
  StopMaintenance: 'StopMaintenance',
  SubmitCharacter: 'SubmitCharacter',
  SwapKit: 'SwapKit',
  TroubadourAutoRevive: 'TroubadourAutoRevive',
  UnequipItem: 'UnequipItem',
  Undo: 'Undo',
  UpdateSessionAttendance: 'UpdateSessionAttendance',
  UseAbility: 'UseAbility',
  UseConsumable: 'UseConsumable',
} as const;
export type KnownIntentType = (typeof IntentTypes)[keyof typeof IntentTypes];

// Intent types that are only valid when dispatched by the server (the DO or its
// derived-intent pipeline). Clients dispatching these are rejected at the lobby
// envelope boundary. See docs/intent-protocol.md §3.
export const SERVER_ONLY_INTENTS = new Set<string>([
  IntentTypes.ApplyDamage,
  IntentTypes.ExecuteTrigger,
  IntentTypes.GrantExtraMainAction,
  IntentTypes.RaiseOpenAction,
  IntentTypes.StaminaTransitioned,
  IntentTypes.TroubadourAutoRevive,
]);
