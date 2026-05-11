import type { Intent, Role } from '@ironyard/shared';
import { ulid } from '@ironyard/shared';

// Build a client-side Intent envelope. The DO overrides actor, timestamp,
// campaignId, and source on receipt (see apps/api/src/lobby-do.ts), so the
// values here are placeholders that satisfy IntentSchema parsing. The client-
// supplied id is preserved as the dedupe key.
export function buildIntent(args: {
  campaignId: string;
  type: string;
  payload: unknown;
  actor: { userId: string; role: Role };
}): Intent {
  return {
    id: ulid(),
    campaignId: args.campaignId,
    actor: args.actor,
    source: 'manual',
    type: args.type,
    payload: args.payload,
  };
}
