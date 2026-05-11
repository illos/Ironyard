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
  BringCharacterIntoEncounterPayloadSchema,
  IntentTypes,
  JoinSessionPayloadSchema,
  LeaveSessionPayloadSchema,
  NotePayloadSchema,
  RollPowerPayloadSchema,
  StartEncounterPayloadSchema,
} from './intents';
export type {
  ApplyDamagePayload,
  BringCharacterIntoEncounterPayload,
  JoinSessionPayload,
  KnownIntentType,
  LeaveSessionPayload,
  NotePayload,
  RollPowerPayload,
  StartEncounterPayload,
} from './intents';

export { MonsterFileSchema, MonsterSchema } from './data/monster';
export type { Monster, MonsterFile } from './data/monster';

export { CharacteristicSchema, CharacteristicsSchema } from './characteristic';
export type { Characteristic, Characteristics } from './characteristic';

export { DAMAGE_TYPES, DamageTypeSchema, TypedResistanceSchema } from './damage';
export type { DamageType, TypedResistance } from './damage';

export { ParticipantSchema } from './participant';
export type { Participant } from './participant';
