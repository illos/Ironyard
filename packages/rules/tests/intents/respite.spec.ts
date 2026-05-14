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

  it('restores currentStamina to maxStamina for every PC participant', () => {
    const state = baseState({
      participants: [
        makeHeroParticipant('pc:char-1', { currentStamina: 5, maxStamina: 24 }),
        makeHeroParticipant('pc:char-2', { currentStamina: 0, maxStamina: 30 }),
      ],
    });
    const result = applyRespite(state, RESPITE_INTENT);
    expect(result.errors).toBeUndefined();
    const [p1, p2] = result.state.participants as ReturnType<typeof makeHeroParticipant>[];
    expect(p1?.currentStamina).toBe(24);
    expect(p2?.currentStamina).toBe(30);
  });

  it('does not touch monster currentStamina', () => {
    const state = baseState({
      participants: [
        makeMonsterParticipant('monster:goblin-1', { currentStamina: 4, maxStamina: 20 }),
      ],
    });
    const result = applyRespite(state, RESPITE_INTENT);
    expect(result.errors).toBeUndefined();
    const monster = result.state.participants
      .filter(isParticipant)
      .find((p) => p.id === 'monster:goblin-1');
    expect(monster?.currentStamina).toBe(4);
  });

  it('clamps negative heroicResources value to 0', () => {
    const state = baseState({
      participants: [
        makeHeroParticipant('pc:char-1', {
          heroicResources: [{ name: 'clarity', value: -3, floor: -3 }],
        }),
      ],
    });
    const result = applyRespite(state, RESPITE_INTENT);
    expect(result.errors).toBeUndefined();
    const pc = result.state.participants[0] as ReturnType<typeof makeHeroParticipant>;
    expect(pc?.heroicResources[0]?.value).toBe(0);
  });

  it('leaves non-negative heroicResources unchanged', () => {
    const state = baseState({
      participants: [
        makeHeroParticipant('pc:char-1', {
          heroicResources: [
            { name: 'wrath', value: 4, floor: 0 },
            { name: 'piety', value: 0, floor: 0 },
          ],
        }),
      ],
    });
    const result = applyRespite(state, RESPITE_INTENT);
    expect(result.errors).toBeUndefined();
    const pc = result.state.participants[0] as ReturnType<typeof makeHeroParticipant>;
    expect(pc?.heroicResources[0]?.value).toBe(4);
    expect(pc?.heroicResources[1]?.value).toBe(0);
  });

  it('emits warning log entries for safelyCarryWarnings', () => {
    const state = baseState({
      participants: [makeHeroParticipant('pc:char-1')],
    });
    const result = applyRespite(
      state,
      stamped({
        type: 'Respite',
        actor: { userId: 'owner-1', role: 'director' },
        payload: {
          safelyCarryWarnings: [
            {
              characterId: 'char-1',
              characterName: 'Aria',
              count: 4,
              items: ['amulet-of-vigor', 'cloak-of-protection', 'ring-of-might', 'boots-of-speed'],
            },
          ],
        },
      }),
    );
    expect(result.errors).toBeUndefined();
    const warnings = result.log.filter((l) => l.kind === 'warning');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.text).toMatch(/Aria/);
    expect(warnings[0]?.text).toMatch(/4 leveled treasures/);
    expect(warnings[0]?.text).toMatch(/§ 10\.17/);
  });

  it('accepts wyrmplateChoices in payload and logs each pick', () => {
    const state = baseState({ participants: [makeHeroParticipant('pc:char-1')] });
    const result = applyRespite(
      state,
      stamped({
        type: 'Respite',
        actor: { userId: 'owner-1', role: 'director' },
        payload: {
          wyrmplateChoices: { 'char-1': 'fire', 'char-2': 'cold' },
        },
      }),
    );
    expect(result.errors).toBeUndefined();
    const infoLogs = result.log.filter((l) => l.kind === 'info');
    // 1 summary line + 2 wyrmplate picks
    expect(infoLogs.length).toBeGreaterThanOrEqual(3);
    expect(infoLogs.some((l) => l.text.includes('fire'))).toBe(true);
    expect(infoLogs.some((l) => l.text.includes('cold'))).toBe(true);
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
    const infoLogs = result.log.filter((l) => l.kind === 'info');
    expect(infoLogs.length).toBeGreaterThanOrEqual(1);
    expect(infoLogs[0]?.text).toMatch(/2 XP/);
  });

  it('handles empty participant roster gracefully', () => {
    const state = baseState({ partyVictories: 5 });
    const result = applyRespite(state, RESPITE_INTENT);
    expect(result.errors).toBeUndefined();
    expect(result.state.partyVictories).toBe(0);
    expect(result.state.participants).toHaveLength(0);
  });

  it("increments each attending PC's victories by 1", () => {
    const state = baseState({
      attendingCharacterIds: ['char-a', 'char-b'],
      participants: [
        makeHeroParticipant('pc:char-a', { characterId: 'char-a', victories: 2 }),
        makeHeroParticipant('pc:char-b', { characterId: 'char-b', victories: 2 }),
        makeHeroParticipant('pc:char-c', { characterId: 'char-c', victories: 2 }),
      ],
    });
    const result = applyRespite(state, RESPITE_INTENT);
    expect(result.errors).toBeUndefined();
    const charA = result.state.participants.find((p) => isParticipant(p) && p.characterId === 'char-a');
    const charB = result.state.participants.find((p) => isParticipant(p) && p.characterId === 'char-b');
    const charC = result.state.participants.find((p) => isParticipant(p) && p.characterId === 'char-c');
    expect(charA?.victories).toBe(3);
    expect(charB?.victories).toBe(3);
    expect(charC?.victories).toBe(2); // not attending
  });
});
