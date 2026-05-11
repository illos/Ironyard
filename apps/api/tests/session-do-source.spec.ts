import type { Intent } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import { buildServerStampedIntent } from '../src/session-do-build-intent';

// Slice 11 wrote a workaround for this: the DO unconditionally rewrote
// `clientIntent.source` to `'manual'` on every dispatch, so even an auto-rolled
// RollPower came back as manual in the session log. The fix: preserve the
// client-supplied source value end-to-end. The four impersonation-sensitive
// fields (actor, timestamp, sessionId, id-stays-from-client-for-dedupe) are
// still server-stamped — only `source` is now honored.

const baseClient = (over: Partial<Intent> = {}): Intent => ({
  id: 'i_client',
  sessionId: 'sess_client',
  actor: { userId: 'spoofed', role: 'player' },
  source: 'manual',
  type: 'RollPower',
  payload: { ok: true },
  ...over,
});

describe('buildServerStampedIntent', () => {
  it('preserves source: auto from the client', () => {
    const stamped = buildServerStampedIntent(
      baseClient({ source: 'auto' }),
      { userId: 'real-user', role: 'director' },
      'sess_authoritative',
      1_700_000_000_000,
    );
    expect(stamped.source).toBe('auto');
  });

  it('preserves source: manual from the client', () => {
    const stamped = buildServerStampedIntent(
      baseClient({ source: 'manual' }),
      { userId: 'real-user', role: 'director' },
      'sess_authoritative',
      1_700_000_000_000,
    );
    expect(stamped.source).toBe('manual');
  });

  it('overrides actor / timestamp / sessionId with the server-supplied values', () => {
    const stamped = buildServerStampedIntent(
      baseClient(),
      { userId: 'real-user', role: 'director' },
      'sess_authoritative',
      1_700_000_000_000,
    );
    expect(stamped.actor).toEqual({ userId: 'real-user', role: 'director' });
    expect(stamped.timestamp).toBe(1_700_000_000_000);
    expect(stamped.sessionId).toBe('sess_authoritative');
  });

  it('preserves the client-supplied intent id (dedupe key)', () => {
    const stamped = buildServerStampedIntent(
      baseClient({ id: 'i_specific_client_ulid' }),
      { userId: 'real-user', role: 'director' },
      'sess_authoritative',
      1_700_000_000_000,
    );
    expect(stamped.id).toBe('i_specific_client_ulid');
  });

  it('preserves the type and payload unchanged', () => {
    const stamped = buildServerStampedIntent(
      baseClient({ type: 'SetStamina', payload: { participantId: 'pc_alice', currentStamina: 7 } }),
      { userId: 'real-user', role: 'director' },
      'sess_authoritative',
      1_700_000_000_000,
    );
    expect(stamped.type).toBe('SetStamina');
    expect(stamped.payload).toEqual({ participantId: 'pc_alice', currentStamina: 7 });
  });
});
