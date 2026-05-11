import type { Intent, Participant } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import {
  type SessionState,
  type StampedIntent,
  applyIntent,
  emptySessionState,
} from '../src/index';

// Phase 1 cleanup: SetStamina — the client-dispatchable manual HP override.
// Slice 11 surfaced this gap: director long-presses HP to edit, but ApplyDamage
// is server-only so the dispatch path doesn't reach the engine. SetStamina is
// the canonical override path. No derived intents fire (manual override
// contract — no Bleeding hooks, no condition triggers, no dying transition).

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

function pc(over: Partial<Participant> = {}): Participant {
  return {
    id: 'pc_alice',
    name: 'Alice',
    kind: 'pc',
    level: 1,
    currentStamina: 20,
    maxStamina: 30,
    characteristics: { might: 2, agility: 1, reason: 0, intuition: 0, presence: 0 },
    immunities: [],
    weaknesses: [],
    conditions: [],
    heroicResources: [],
    extras: [],
    surges: 0,
    recoveries: { current: 0, max: 0 },
    recoveryValue: 0,
    ...over,
  };
}

function ready(over?: Partial<Participant>): SessionState {
  let s = emptySessionState(sessionId);
  s = applyIntent(s, intent('StartEncounter', { encounterId: 'enc_1' })).state;
  s = applyIntent(s, intent('BringCharacterIntoEncounter', { participant: pc(over) })).state;
  return s;
}

function getAlice(s: SessionState): Participant | undefined {
  return s.activeEncounter?.participants.find((p) => p.id === 'pc_alice');
}

describe('applyIntent — SetStamina', () => {
  it('rejects when no active encounter', () => {
    const r = applyIntent(
      emptySessionState(sessionId),
      intent('SetStamina', { participantId: 'pc_alice', currentStamina: 10 }),
    );
    expect(r.errors?.[0]?.code).toBe('no_active_encounter');
  });

  it('rejects when participant not found', () => {
    let s = emptySessionState(sessionId);
    s = applyIntent(s, intent('StartEncounter', { encounterId: 'enc_1' })).state;
    const r = applyIntent(
      s,
      intent('SetStamina', { participantId: 'pc_ghost', currentStamina: 1 }),
    );
    expect(r.errors?.[0]?.code).toBe('target_missing');
  });

  it('sets currentStamina when only currentStamina is supplied', () => {
    const s = ready();
    const r = applyIntent(
      s,
      intent('SetStamina', { participantId: 'pc_alice', currentStamina: 15 }),
    );
    expect(r.errors).toBeUndefined();
    expect(getAlice(r.state)?.currentStamina).toBe(15);
    expect(getAlice(r.state)?.maxStamina).toBe(30); // unchanged
  });

  it('sets maxStamina when only maxStamina is supplied', () => {
    const s = ready();
    const r = applyIntent(s, intent('SetStamina', { participantId: 'pc_alice', maxStamina: 40 }));
    expect(r.errors).toBeUndefined();
    expect(getAlice(r.state)?.currentStamina).toBe(20); // unchanged
    expect(getAlice(r.state)?.maxStamina).toBe(40);
  });

  it('sets both when both are supplied', () => {
    const s = ready();
    const r = applyIntent(
      s,
      intent('SetStamina', { participantId: 'pc_alice', currentStamina: 25, maxStamina: 50 }),
    );
    expect(r.errors).toBeUndefined();
    expect(getAlice(r.state)?.currentStamina).toBe(25);
    expect(getAlice(r.state)?.maxStamina).toBe(50);
  });

  it('rejects when new currentStamina exceeds new maxStamina', () => {
    const s = ready();
    const r = applyIntent(
      s,
      intent('SetStamina', { participantId: 'pc_alice', currentStamina: 60, maxStamina: 50 }),
    );
    expect(r.errors?.[0]?.code).toBe('invalid_value');
  });

  it('rejects when new currentStamina exceeds existing maxStamina', () => {
    const s = ready();
    const r = applyIntent(
      s,
      intent('SetStamina', { participantId: 'pc_alice', currentStamina: 35 }),
    );
    expect(r.errors?.[0]?.code).toBe('invalid_value');
  });

  it('rejects negative currentStamina', () => {
    const s = ready();
    const r = applyIntent(
      s,
      intent('SetStamina', { participantId: 'pc_alice', currentStamina: -3 }),
    );
    expect(r.errors?.[0]?.code).toBe('invalid_value');
  });

  it('rejects maxStamina = 0', () => {
    const s = ready();
    const r = applyIntent(s, intent('SetStamina', { participantId: 'pc_alice', maxStamina: 0 }));
    expect(r.errors?.[0]?.code).toBe('invalid_payload');
  });

  it('rejects empty payload (neither field supplied)', () => {
    const s = ready();
    const r = applyIntent(s, intent('SetStamina', { participantId: 'pc_alice' }));
    expect(r.errors?.[0]?.code).toBe('invalid_payload');
  });

  it('emits no derived intents even when stamina drops to 0', () => {
    const s = ready();
    const r = applyIntent(
      s,
      intent('SetStamina', { participantId: 'pc_alice', currentStamina: 0 }),
    );
    expect(r.errors).toBeUndefined();
    expect(getAlice(r.state)?.currentStamina).toBe(0);
    expect(r.derived).toEqual([]);
  });

  it('log entry includes participant name and both values', () => {
    const s = ready();
    const r = applyIntent(
      s,
      intent('SetStamina', { participantId: 'pc_alice', currentStamina: 12 }),
    );
    expect(r.log[0]?.text).toMatch(/Alice/);
    expect(r.log[0]?.text).toMatch(/20/);
    expect(r.log[0]?.text).toMatch(/12/);
  });
});
