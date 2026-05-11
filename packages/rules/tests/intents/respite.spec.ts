import { describe, expect, it } from 'vitest';
import { applyRespite } from '../../src/intents/respite';
import { isParticipant } from '../../src/types';
import {
  baseState,
  makeHeroParticipant,
  makeMonsterParticipant,
  makeRunningEncounterPhase,
  stamped,
} from './test-utils';

const RESPITE_INTENT = stamped({
  type: 'Respite',
  actor: { userId: 'owner-1', role: 'director' },
  payload: {},
});

describe('applyRespite', () => {
  it('rejects when an encounter is active', () => {
    const state = baseState({
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const result = applyRespite(state, RESPITE_INTENT);
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0]?.code).toBe('in_encounter');
    // State unchanged on error
    expect(result.state).toBe(state);
  });

  it('refills recoveries.current to recoveries.max for every PC participant', () => {
    const state = baseState({
      participants: [
        makeHeroParticipant('pc:char-1', { recoveries: { current: 1, max: 8 } }),
        makeHeroParticipant('pc:char-2', { recoveries: { current: 0, max: 6 } }),
      ],
    });
    const result = applyRespite(state, RESPITE_INTENT);
    expect(result.errors).toBeUndefined();
    const [p1, p2] = result.state.participants as ReturnType<typeof makeHeroParticipant>[];
    expect(p1?.recoveries.current).toBe(8);
    expect(p2?.recoveries.current).toBe(6);
  });

  it('does not touch monster participants', () => {
    const state = baseState({
      participants: [
        makeHeroParticipant('pc:char-1', { recoveries: { current: 2, max: 8 } }),
        makeMonsterParticipant('monster:goblin-1', { recoveries: { current: 0, max: 0 } }),
      ],
    });
    const result = applyRespite(state, RESPITE_INTENT);
    expect(result.errors).toBeUndefined();
    const monster = result.state.participants
      .filter(isParticipant)
      .find((p) => p.id === 'monster:goblin-1');
    expect(monster?.recoveries.current).toBe(0);
    expect(monster?.recoveries.max).toBe(0);
  });

  it('drains state.partyVictories to 0 after respite', () => {
    const state = baseState({ partyVictories: 3 });
    const result = applyRespite(state, RESPITE_INTENT);
    expect(result.errors).toBeUndefined();
    expect(result.state.partyVictories).toBe(0);
  });

  it('does not touch currentStamina (recoveries refill is separate from healing)', () => {
    const state = baseState({
      participants: [makeHeroParticipant('pc:char-1', { currentStamina: 5, maxStamina: 24 })],
    });
    const result = applyRespite(state, RESPITE_INTENT);
    expect(result.errors).toBeUndefined();
    const pc = result.state.participants[0] as ReturnType<typeof makeHeroParticipant>;
    expect(pc?.currentStamina).toBe(5);
  });

  it('increments seq on success', () => {
    const state = baseState();
    const result = applyRespite(state, RESPITE_INTENT);
    expect(result.errors).toBeUndefined();
    expect(result.state.seq).toBe(state.seq + 1);
  });

  it('still refills recoveries when partyVictories === 0 (no-op XP path)', () => {
    const state = baseState({
      partyVictories: 0,
      participants: [makeHeroParticipant('pc:char-1', { recoveries: { current: 0, max: 5 } })],
    });
    const result = applyRespite(state, RESPITE_INTENT);
    expect(result.errors).toBeUndefined();
    const pc = result.state.participants[0] as ReturnType<typeof makeHeroParticipant>;
    expect(pc?.recoveries.current).toBe(5);
    expect(result.state.partyVictories).toBe(0);
  });

  it('emits an info log entry describing the respite', () => {
    const state = baseState({
      partyVictories: 2,
      participants: [makeHeroParticipant('pc:char-1')],
    });
    const result = applyRespite(state, RESPITE_INTENT);
    expect(result.log).toHaveLength(1);
    expect(result.log[0]?.kind).toBe('info');
    expect(result.log[0]?.text).toMatch(/2 XP/);
  });

  it('handles empty participant roster gracefully', () => {
    const state = baseState({ partyVictories: 5 });
    const result = applyRespite(state, RESPITE_INTENT);
    expect(result.errors).toBeUndefined();
    expect(result.state.partyVictories).toBe(0);
    expect(result.state.participants).toHaveLength(0);
  });
});
