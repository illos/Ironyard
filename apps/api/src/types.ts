import type { D1Database, DurableObjectNamespace } from '@cloudflare/workers-types';
import type { CurrentUser } from '@ironyard/shared';

export type Bindings = {
  DB: D1Database;
  LOBBY_DO: DurableObjectNamespace;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
  MAGIC_LINK_BASE_URL?: string;
  WEB_BASE_URL?: string;
  IRONYARD_DEV_SKIP_AUTH?: string;
};

export type Variables = {
  user: CurrentUser;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: Variables;
};
