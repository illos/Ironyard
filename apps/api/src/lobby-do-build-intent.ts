import type { Intent } from '@ironyard/shared';

// Pure helper extracted from LobbyDO so the source-preservation contract is
// testable in isolation without a Durable Object harness.
//
// What it does: takes a client-dispatched Intent, swaps in the server-stamped
// fields (actor from WS attached headers, timestamp from Date.now(), campaignId
// from the DO), and returns the stamped intent ready for `applyIntent`.
//
// Why it exists: pre-fix, the DO unconditionally overwrote
// `clientIntent.source = 'manual'`, which broke auto-roll attribution in the
// session log (slice 11 spec line 31, line 119-121 workaround). The fix is
// just dropping that override — `clientIntent.source` is validated by
// `IntentSourceSchema` as `'auto' | 'manual'`, and `source` isn't an
// impersonation surface (the actor IS, and the actor is still server-stamped).
export function buildServerStampedIntent(
  clientIntent: Intent,
  attached: { userId: string; role: 'director' | 'player' },
  campaignId: string,
  now: number,
): Intent & { timestamp: number } {
  return {
    ...clientIntent,
    actor: { userId: attached.userId, role: attached.role },
    timestamp: now,
    campaignId,
    // source: NOT overridden — the client says whether they auto-rolled or
    // manually entered the result; the engine treats it as informational
    // metadata for the log. The wire-level Zod validation already constrains
    // source to the 'auto' | 'manual' enum.
  };
}
