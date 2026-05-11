// Zod schemas for everything that crosses a boundary live here.
// Phase 0 lands the envelope shapes; Phase 1 narrows Intent.payload per type
// and replaces the unknown() state slots with a real SessionStateSchema.

export const PACKAGE = '@ironyard/shared' as const;

export { ActorSchema, RoleSchema } from './actor';
export type { Actor, Role } from './actor';

export {
  IntentSchema,
  IntentSourceSchema,
  IntentTypeSchema,
} from './intent';
export type { Intent, IntentSource, IntentType } from './intent';

export { ClientMsgSchema, ServerMsgSchema } from './wire';
export type { ClientMsg, Member, ServerMsg } from './wire';

export { ulid } from './ulid';

export {
  CurrentUserSchema,
  DevLoginRequestSchema,
  MagicLinkRequestSchema,
} from './auth';
export type { CurrentUser, DevLoginRequest, MagicLinkRequest } from './auth';

export {
  CreateSessionRequestSchema,
  JoinSessionRequestSchema,
  generateInviteCode,
} from './session';
export type { CreateSessionRequest, JoinSessionRequest } from './session';

export {
  ApplyDamagePayloadSchema,
  ApplyHealPayloadSchema,
  BringCharacterIntoEncounterPayloadSchema,
  EndEncounterPayloadSchema,
  EndRoundPayloadSchema,
  EndTurnPayloadSchema,
  GainMalicePayloadSchema,
  GainResourcePayloadSchema,
  IntentTypes,
  JoinSessionPayloadSchema,
  LeaveSessionPayloadSchema,
  NotePayloadSchema,
  RemoveConditionPayloadSchema,
  RollPowerPayloadSchema,
  RollResistancePayloadSchema,
  SetConditionPayloadSchema,
  SetInitiativePayloadSchema,
  SetResourcePayloadSchema,
  SetStaminaPayloadSchema,
  SpendMalicePayloadSchema,
  SpendRecoveryPayloadSchema,
  SpendResourcePayloadSchema,
  SpendSurgePayloadSchema,
  StartEncounterPayloadSchema,
  StartRoundPayloadSchema,
  StartTurnPayloadSchema,
  UndoPayloadSchema,
} from './intents';
export type {
  ApplyDamagePayload,
  ApplyHealPayload,
  BringCharacterIntoEncounterPayload,
  EndEncounterPayload,
  EndRoundPayload,
  EndTurnPayload,
  GainMalicePayload,
  GainResourcePayload,
  JoinSessionPayload,
  KnownIntentType,
  LeaveSessionPayload,
  NotePayload,
  RemoveConditionPayload,
  RollPowerPayload,
  RollResistancePayload,
  SetConditionPayload,
  SetInitiativePayload,
  SetResourcePayload,
  SetStaminaPayload,
  SpendMalicePayload,
  SpendRecoveryPayload,
  SpendResourcePayload,
  SpendSurgePayload,
  StartEncounterPayload,
  StartRoundPayload,
  StartTurnPayload,
  UndoPayload,
} from './intents';

export {
  ABILITY_TYPES,
  AbilitySchema,
  AbilityTypeSchema,
  EvSchema,
  MOVEMENT_MODES,
  MonsterFileSchema,
  MonsterSchema,
  MovementModeSchema,
  PowerRollSchema,
  StaminaSchema,
} from './data/monster';
export type {
  Ability,
  AbilityType,
  Ev,
  Monster,
  MonsterFile,
  MovementMode,
  PowerRoll,
  Stamina,
} from './data/monster';

export { CharacteristicSchema, CharacteristicsSchema } from './characteristic';
export type { Characteristic, Characteristics } from './characteristic';

export { DAMAGE_TYPES, DamageTypeSchema, TypedResistanceSchema } from './damage';
export type { DamageType, TypedResistance } from './damage';

export {
  ConditionDurationSchema,
  ConditionInstanceSchema,
  ConditionSourceSchema,
  ConditionTypeSchema,
} from './condition';
export type {
  ConditionDuration,
  ConditionInstance,
  ConditionSource,
  ConditionType,
} from './condition';

export {
  ExtraResourceInstanceSchema,
  HEROIC_RESOURCE_NAMES,
  HeroicResourceInstanceSchema,
  HeroicResourceNameSchema,
  ResourceRefSchema,
} from './resource';
export type {
  ExtraResourceInstance,
  HeroicResourceInstance,
  HeroicResourceName,
  ResourceRef,
} from './resource';

export { MaliceStateSchema } from './malice';
export type { MaliceState } from './malice';

export { ParticipantSchema } from './participant';
export type { Participant } from './participant';
