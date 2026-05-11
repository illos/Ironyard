import type { Intent, Participant } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import {
  type SessionState,
  type StampedIntent,
  applyIntent,
  emptySessionState,
} from '../src/index';
import { resetParticipantForEndOfEncounter } from '../src/intents/end-encounter';

// Phase 1 cleanup: EndEncounter intent — closes out the active encounter and
// resets every per-encounter pool (heroicResources, extras, surges, malice).
// Recoveries do NOT reset (canon §2.13 — respite-only). Conditions with
// `duration.kind === 'end_of_encounter'` are filtered from every participant.

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
    currentStamina: 30,
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

function monster(over: Partial<Participant> = {}): Participant {
  return {
    id: 'm_goblin',
    name: 'Goblin',
    kind: 'monster',
    level: 1,
    currentStamina: 20,
    maxStamina: 20,
    characteristics: { might: 0, agility: 1, reason: -1, intuition: 0, presence: -1 },
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

function withEncounter(): SessionState {
  let s = emptySessionState(sessionId);
  s = applyIntent(s, intent('StartEncounter', { encounterId: 'enc_1' })).state;
  return s;
}

function firstParticipant(s: SessionState): Participant {
  const p = s.activeEncounter?.participants[0];
  if (!p) throw new Error('no participants');
  return p;
}

function findParticipant(s: SessionState, id: string): Participant {
  const p = s.activeEncounter?.participants.find((x) => x.id === id);
  if (!p) throw new Error(`participant ${id} not found`);
  return p;
}

describe('applyIntent — EndEncounter', () => {
  it('is a no-op when no encounter is active', () => {
    const s0 = emptySessionState(sessionId);
    const r = applyIntent(s0, intent('EndEncounter', { encounterId: 'enc_1' }));
    expect(r.errors).toBeUndefined();
    expect(r.state.activeEncounter).toBeNull();
    expect(r.state.seq).toBe(s0.seq + 1);
    expect(r.log[0]?.text).toMatch(/no active encounter/i);
  });

  it('rejects when the supplied encounterId does not match the active encounter', () => {
    const s = withEncounter();
    const r = applyIntent(s, intent('EndEncounter', { encounterId: 'enc_other' }));
    expect(r.errors?.[0]?.code).toBe('wrong_encounter');
    expect(r.state.activeEncounter?.id).toBe('enc_1'); // unchanged
  });

  it('drops activeEncounter to null on the happy path', () => {
    const s = withEncounter();
    const r = applyIntent(s, intent('EndEncounter', { encounterId: 'enc_1' }));
    expect(r.errors).toBeUndefined();
    expect(r.state.activeEncounter).toBeNull();
    expect(r.state.seq).toBe(s.seq + 1);
  });

  it('rejects invalid payload', () => {
    const s = withEncounter();
    const r = applyIntent(s, intent('EndEncounter', {}));
    expect(r.errors?.[0]?.code).toBe('invalid_payload');
  });

  it('resets every participant heroicResources value to 0 while preserving name/floor/max', () => {
    let s = withEncounter();
    s = applyIntent(
      s,
      intent('BringCharacterIntoEncounter', {
        participant: pc({
          id: 'pc_talent',
          name: 'Talent',
          heroicResources: [{ name: 'clarity', value: -2, floor: -3 }],
        }),
      }),
    ).state;
    s = applyIntent(
      s,
      intent('BringCharacterIntoEncounter', {
        participant: pc({
          id: 'pc_censor',
          name: 'Censor',
          heroicResources: [{ name: 'wrath', value: 7, floor: 0 }],
        }),
      }),
    ).state;

    // Snapshot the participant before EndEncounter wipes activeEncounter.
    const talent = findParticipant(s, 'pc_talent');
    const censor = findParticipant(s, 'pc_censor');
    expect(talent.heroicResources[0]?.value).toBe(-2);

    const clearedTalent = resetParticipantForEndOfEncounter(talent);
    expect(clearedTalent.heroicResources[0]?.value).toBe(0);
    expect(clearedTalent.heroicResources[0]?.name).toBe('clarity');
    expect(clearedTalent.heroicResources[0]?.floor).toBe(-3); // floor preserved

    const clearedCensor = resetParticipantForEndOfEncounter(censor);
    expect(clearedCensor.heroicResources[0]?.value).toBe(0);

    // And after the full EndEncounter dispatch, activeEncounter is null.
    const r = applyIntent(s, intent('EndEncounter', { encounterId: 'enc_1' }));
    expect(r.errors).toBeUndefined();
    expect(r.state.activeEncounter).toBeNull();
  });

  it('resets extras values to 0 on every participant', () => {
    let s = withEncounter();
    s = applyIntent(
      s,
      intent('BringCharacterIntoEncounter', {
        participant: pc({
          extras: [{ name: 'virtue', value: 5, floor: 0 }],
        }),
      }),
    ).state;

    const cleared = resetParticipantForEndOfEncounter(firstParticipant(s));
    expect(cleared.extras[0]?.value).toBe(0);
    expect(cleared.extras[0]?.name).toBe('virtue');
  });

  it('resets surges to 0 on every participant', () => {
    let s = withEncounter();
    s = applyIntent(
      s,
      intent('BringCharacterIntoEncounter', {
        participant: pc({ surges: 3 }),
      }),
    ).state;
    s = applyIntent(
      s,
      intent('BringCharacterIntoEncounter', {
        participant: monster({ surges: 1 }),
      }),
    ).state;

    const before = s.activeEncounter?.participants ?? [];
    expect(before).toHaveLength(2);
    for (const p of before) {
      expect(resetParticipantForEndOfEncounter(p).surges).toBe(0);
    }
  });

  it('does NOT reset recoveries.current (canon §2.13: respite only)', () => {
    let s = withEncounter();
    s = applyIntent(
      s,
      intent('BringCharacterIntoEncounter', {
        participant: pc({ recoveries: { current: 5, max: 8 } }),
      }),
    ).state;

    const cleared = resetParticipantForEndOfEncounter(firstParticipant(s));
    expect(cleared.recoveries.current).toBe(5);
    expect(cleared.recoveries.max).toBe(8);
  });

  it('clears only end_of_encounter-duration conditions', () => {
    let s = withEncounter();
    s = applyIntent(
      s,
      intent('BringCharacterIntoEncounter', {
        participant: pc({
          conditions: [
            {
              type: 'Bleeding',
              source: { kind: 'effect', id: 'spell-a' },
              duration: { kind: 'EoT' },
              appliedAtSeq: 1,
              removable: true,
            },
            {
              type: 'Frightened',
              source: { kind: 'effect', id: 'spell-b' },
              duration: { kind: 'end_of_encounter' },
              appliedAtSeq: 2,
              removable: true,
            },
            {
              type: 'Grabbed',
              source: { kind: 'creature', id: 'm_goblin' },
              duration: { kind: 'save_ends' },
              appliedAtSeq: 3,
              removable: true,
            },
          ],
        }),
      }),
    ).state;

    const cleared = resetParticipantForEndOfEncounter(firstParticipant(s));
    const types = cleared.conditions.map((c) => c.type);
    expect(types).toContain('Bleeding');
    expect(types).toContain('Grabbed');
    expect(types).not.toContain('Frightened');
  });

  it('resets malice to fresh state (current 0, lastMaliciousStrikeRound null)', () => {
    let s = withEncounter();
    s = applyIntent(s, intent('GainMalice', { amount: 12 })).state;
    expect(s.activeEncounter?.malice.current).toBe(12);

    const r = applyIntent(s, intent('EndEncounter', { encounterId: 'enc_1' }));
    expect(r.errors).toBeUndefined();
    expect(r.state.activeEncounter).toBeNull();

    // Re-start a new encounter and confirm malice was wiped (StartEncounter inits
    // to 0 on its own — this is a sanity check that EndEncounter doesn't leak
    // prior state into a freshly-started encounter via the seq increment).
    const r2 = applyIntent(r.state, intent('StartEncounter', { encounterId: 'enc_2' }));
    expect(r2.state.activeEncounter?.malice).toEqual({
      current: 0,
      lastMaliciousStrikeRound: null,
    });
  });

  it('emits no derived intents', () => {
    const s = withEncounter();
    const r = applyIntent(s, intent('EndEncounter', { encounterId: 'enc_1' }));
    expect(r.derived).toEqual([]);
  });
});
