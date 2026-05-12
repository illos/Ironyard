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
  CreateCampaignRequestSchema,
  JoinCampaignRequestSchema,
  generateInviteCode,
} from './campaign';
export type { CreateCampaignRequest, JoinCampaignRequest } from './campaign';

export {
  AddMonsterPayloadSchema,
  ApproveCharacterPayloadSchema,
  ApplyDamagePayloadSchema,
  ApplyHealPayloadSchema,
  BringCharacterIntoEncounterPayloadSchema,
  ClearLobbyPayloadSchema,
  DenyCharacterPayloadSchema,
  EndEncounterPayloadSchema,
  EndRoundPayloadSchema,
  EndTurnPayloadSchema,
  GainMalicePayloadSchema,
  GainResourcePayloadSchema,
  IntentTypes,
  JoinLobbyPayloadSchema,
  JumpBehindScreenPayloadSchema,
  KickPlayerPayloadSchema,
  LeaveLobbyPayloadSchema,
  LoadEncounterTemplateClientPayloadSchema,
  LoadEncounterTemplatePayloadSchema,
  LoadEncounterTemplateResolvedEntrySchema,
  NotePayloadSchema,
  RemoveApprovedCharacterPayloadSchema,
  RemoveConditionPayloadSchema,
  RespitePayloadSchema,
  RemoveParticipantPayloadSchema,
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
  SubmitCharacterPayloadSchema,
  SwapKitPayloadSchema,
  UndoPayloadSchema,
} from './intents';
export type {
  AddMonsterPayload,
  ApproveCharacterPayload,
  ApplyDamagePayload,
  ApplyHealPayload,
  BringCharacterIntoEncounterPayload,
  ClearLobbyPayload,
  DenyCharacterPayload,
  EndEncounterPayload,
  EndRoundPayload,
  EndTurnPayload,
  GainMalicePayload,
  GainResourcePayload,
  JoinLobbyPayload,
  JumpBehindScreenPayload,
  KickPlayerPayload,
  KnownIntentType,
  LeaveLobbyPayload,
  LoadEncounterTemplateClientPayload,
  LoadEncounterTemplatePayload,
  LoadEncounterTemplateResolvedEntry,
  NotePayload,
  RemoveApprovedCharacterPayload,
  RemoveConditionPayload,
  RespitePayload,
  RemoveParticipantPayload,
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
  SubmitCharacterPayload,
  SwapKitPayload,
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
  TierOutcomeSchema,
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
  TierOutcome,
} from './data/monster';

export { CharacteristicSchema, CharacteristicsSchema } from './characteristic';
export type { Characteristic, Characteristics } from './characteristic';

export { DAMAGE_TYPES, DamageTypeSchema, TypedResistanceSchema } from './damage';
export type { DamageType, TypedResistance } from './damage';

export {
  CONDITION_TYPES,
  ConditionApplicationDispatchSchema,
  ConditionApplicationOutcomeSchema,
  ConditionDurationSchema,
  ConditionInstanceSchema,
  ConditionSourceSchema,
  ConditionTypeSchema,
} from './condition';
export type {
  ConditionApplicationDispatch,
  ConditionApplicationOutcome,
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

export {
  EncounterTemplateDataSchema,
  EncounterTemplateEntrySchema,
  EncounterTemplateSchema,
} from './schemas/encounter-template';
export type {
  EncounterTemplate,
  EncounterTemplateData,
  EncounterTemplateEntry,
} from './schemas/encounter-template';

export {
  CampaignCharacterSchema,
  CampaignCharacterStatusSchema,
} from './schemas/campaign-character';
export type { CampaignCharacter, CampaignCharacterStatus } from './schemas/campaign-character';

// ── Static reference data schemas ─────────────────────────────────────────────

export {
  AncestryFileSchema,
  AncestrySchema,
  AncestryTraitSchema,
} from './data/ancestry';
export type { Ancestry, AncestryFile, AncestryTrait } from './data/ancestry';

export {
  ANCESTRY_TRAIT_POINT_BUDGET,
  getAncestryTraitPointBudget,
} from './data/ancestry-points';

export {
  CareerFileSchema,
  CareerSchema,
  IncitingIncidentSchema,
  PerkTypeSchema,
  SkillGrantSchema,
} from './data/career';
export type {
  Career,
  CareerFile,
  IncitingIncident,
  PerkType,
  SkillGrant,
} from './data/career';

export {
  ComplicationFileSchema,
  ComplicationSchema,
} from './data/complication';
export type { Complication, ComplicationFile } from './data/complication';

export {
  AbilitySlotSchema,
  CharacteristicArraySchema,
  ClassFileSchema,
  ClassLevelSchema,
  ClassSchema,
  SubclassSchema,
} from './data/class';
export type {
  AbilitySlot,
  CharacteristicArray,
  ClassFile,
  ClassLevel,
  HeroClass,
  Subclass,
} from './data/class';

// ── Character blob schemas ─────────────────────────────────────────────────────

export {
  CharacterCultureSchema,
  CharacterCareerChoicesSchema,
  CharacterDetailsSchema,
  CharacterResponseSchema,
  CharacterSchema,
  CompleteCharacterSchema,
  CreateCharacterRequestSchema,
  LevelChoicesSchema,
  UpdateCharacterRequestSchema,
} from './character';
export type {
  Character,
  CharacterCareerChoices,
  CharacterCulture,
  CharacterDetails,
  CharacterResponse,
  CompleteCharacter,
  CreateCharacterRequest,
  LevelChoices,
  UpdateCharacterRequest,
} from './character';
