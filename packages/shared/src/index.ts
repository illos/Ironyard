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
  ClearLobbyPayloadSchema,
  ClaimOpenActionPayloadSchema,
  DenyCharacterPayloadSchema,
  EndEncounterPayloadSchema,
  EndRoundPayloadSchema,
  EndSessionPayloadSchema,
  EndTurnPayloadSchema,
  EquipItemPayloadSchema,
  GainHeroTokenPayloadSchema,
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
  MarkActionUsedPayloadSchema,
  NotePayloadSchema,
  PushItemPayloadSchema,
  RaiseOpenActionPayloadSchema,
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
  SpendHeroTokenPayloadSchema,
  SpendMalicePayloadSchema,
  SpendRecoveryPayloadSchema,
  SpendResourcePayloadSchema,
  SpendSurgePayloadSchema,
  StartEncounterPayloadSchema,
  StartRoundPayloadSchema,
  StartSessionPayloadSchema,
  StartTurnPayloadSchema,
  SubmitCharacterPayloadSchema,
  SwapKitPayloadSchema,
  UndoPayloadSchema,
  UnequipItemPayloadSchema,
  UpdateSessionAttendancePayloadSchema,
  UseAbilityPayloadSchema,
  UseConsumablePayloadSchema,
} from './intents';
export type {
  AddMonsterPayload,
  ApproveCharacterPayload,
  ApplyDamagePayload,
  ApplyHealPayload,
  ClearLobbyPayload,
  ClaimOpenActionPayload,
  DenyCharacterPayload,
  EndEncounterPayload,
  EndRoundPayload,
  EndSessionPayload,
  EndTurnPayload,
  EquipItemPayload,
  GainHeroTokenPayload,
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
  MarkActionUsedPayload,
  NotePayload,
  PushItemPayload,
  RaiseOpenActionPayload,
  RemoveApprovedCharacterPayload,
  RemoveConditionPayload,
  RespitePayload,
  SafelyCarryWarning,
  RemoveParticipantPayload,
  RollPowerPayload,
  RollResistancePayload,
  SetConditionPayload,
  SetInitiativePayload,
  SetResourcePayload,
  SetStaminaPayload,
  SpendHeroTokenPayload,
  SpendMalicePayload,
  SpendRecoveryPayload,
  SpendResourcePayload,
  SpendSurgePayload,
  StartEncounterPayload,
  StartEncounterStampedMonster,
  StartEncounterStampedPc,
  StartRoundPayload,
  StartSessionPayload,
  StartTurnPayload,
  SubmitCharacterPayload,
  SwapKitPayload,
  UndoPayload,
  UnequipItemPayload,
  UpdateSessionAttendancePayload,
  UseAbilityPayload,
  UseConsumablePayload,
} from './intents';

export {
  AbilitySchema,
  AbilityFileSchema,
} from './data/ability';
export type { Ability, AbilityFile } from './data/ability';

export {
  ABILITY_TYPES,
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
  ActiveAbilityExpirySchema,
  ActiveAbilityInstanceSchema,
  ActiveAbilitySourceSchema,
} from './active-ability';
export type {
  ActiveAbilityExpiry,
  ActiveAbilityInstance,
  ActiveAbilitySource,
} from './active-ability';

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

export { OpenActionKindSchema, OpenActionSchema } from './open-action';
export type { OpenAction, OpenActionKind } from './open-action';

export { OPEN_ACTION_COPY } from './open-action-copy';
export type { OpenActionCopy } from './open-action-copy';

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
  ARCHETYPICAL_CULTURES,
  CULTURE_ASPECT_DESCRIPTIONS,
  TYPICAL_ANCESTRY_CULTURES,
  getTypicalAncestryCulture,
} from './data/cultures';
export type {
  ArchetypicalCulture,
  CultureEnvironment,
  CultureOrganization,
  CultureUpbringing,
  TypicalAncestryCulture,
} from './data/cultures';

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

export { KitFileSchema, KitSchema } from './data/kit';
export type { Kit, KitFile } from './data/kit';

export {
  ItemSchema,
  ItemFileSchema,
  type Item,
  type ItemFile,
  type Artifact,
  type Consumable,
  type LeveledTreasure,
  type Trinket,
} from './data/item';

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

export { TitleSchema, TitleFileSchema, type Title, type TitleFile } from './data/title';

export {
  AttachmentConditionSchema,
  AttachmentEffectSchema,
  AttachmentSourceSchema,
  CharacterAttachmentSchema,
  StatModFieldSchema,
  StatReplaceFieldSchema,
} from './data/attachment';
export type {
  AttachmentCondition,
  AttachmentEffect,
  AttachmentSource,
  CharacterAttachment,
  StatModField,
  StatReplaceField,
} from './data/attachment';

// ── Character blob schemas ─────────────────────────────────────────────────────

export {
  AncestryChoicesSchema,
  CharacterCultureSchema,
  CharacterCareerChoicesSchema,
  CharacterDetailsSchema,
  CharacterResponseSchema,
  CharacterSchema,
  CompleteCharacterSchema,
  CreateCharacterRequestSchema,
  InventoryEntrySchema,
  LevelChoicesSchema,
  UpdateCharacterRequestSchema,
} from './character';
export type {
  AncestryChoices,
  Character,
  CharacterCareerChoices,
  CharacterCulture,
  CharacterDetails,
  CharacterResponse,
  CompleteCharacter,
  CreateCharacterRequest,
  InventoryEntry,
  LevelChoices,
  UpdateCharacterRequest,
} from './character';
