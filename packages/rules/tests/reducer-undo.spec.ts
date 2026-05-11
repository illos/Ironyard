import type { Intent } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import { type StampedIntent, applyIntent, emptySessionState } from '../src/index';

const T = 1_700_000_000_000;
const sessionId = 'sess_test';

function intent(type: string, payload: unknown, overrides: Partial<Intent> = {}): StampedIntent {
  return {
    id: overrides.id ?? `i_${Math.random().toString(36).slice(2)}`,
    sessionId: overrides.sessionId ?? sessionId,
    actor: overrides.actor ?? { userId: 'alice', role: 'director' },
    timestamp: overrides.timestamp ?? T,
    source: overrides.source ?? 'manual',
    type,
    payload,
    causedBy: overrides.causedBy,
  };
}

describe('applyUndo (reducer-side)', () => {
  it('is a no-op on state apart from seq + log (state revert happens at the DO via replay)', () => {
    let s = emptySessionState(sessionId);
    s = applyIntent(s, intent('Note', { text: 'first' })).state;
    const before = s;
    const r = applyIntent(s, intent('Undo', { intentId: 'some-id' }));
    expect(r.errors).toBeUndefined();
    expect(r.state.seq).toBe(before.seq + 1);
    expect(r.state.notes).toEqual(before.notes); // not actually reverted at reducer level
    expect(r.log[0]?.text).toContain('undid intent some-id');
  });

  it('rejects an empty intentId', () => {
    const r = applyIntent(emptySessionState(sessionId), intent('Undo', { intentId: '' }));
    expect(r.errors?.[0]?.code).toBe('invalid_payload');
  });

  it('rejects a missing intentId', () => {
    const r = applyIntent(emptySessionState(sessionId), intent('Undo', {}));
    expect(r.errors?.[0]?.code).toBe('invalid_payload');
  });
});
