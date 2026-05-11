import type { Intent, Role } from '@ironyard/shared';
import { ulid } from '@ironyard/shared';

// Build a client-side Intent envelope. The DO overrides actor, timestamp,
// sessionId, and source on receipt (see apps/api/src/session-do.ts), so the
// values here are placeholders that satisfy IntentSchema parsing. The client-
// supplied id is preserved as the dedupe key.
export function buildIntent(args: {
  sessionId: string;
  type: string;
  payload: unknown;
  actor: { userId: string; role: Role };
}): Intent {
  return {
    id: ulid(),
    sessionId: args.sessionId,
    actor: args.actor,
    source: 'manual',
    type: args.type,
    payload: args.payload,
  };
}
