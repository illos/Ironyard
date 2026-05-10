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
export type { ClientMsg, ServerMsg } from './wire';

export { ulid } from './ulid';
