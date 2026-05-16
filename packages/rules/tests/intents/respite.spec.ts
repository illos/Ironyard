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
      attendingCharacterIds: ['char-1'],
      participants: [
        makeHeroParticipant('pc:char-1', {
          name: 'Aria',
          characterId: 'char-1',
          victories: 2,
        }),
      ],
    });
    const result = applyRespite(state, RESPITE_INTENT);
    const infoLogs = result.log.filter((l) => l.kind === 'info');
    expect(infoLogs.length).toBeGreaterThanOrEqual(1);
    // Phase 2b 2b.12: XP is per-PC, derived from each PC's victories
    expect(infoLogs[0]?.text).toMatch(/Aria/);
    expect(infoLogs[0]?.text).toMatch(/\+?2/);
  });

  it('handles empty participant roster gracefully', () => {
    const state = baseState({ partyVictories: 5 });
    const result = applyRespite(state, RESPITE_INTENT);
    expect(result.errors).toBeUndefined();
    expect(result.state.partyVictories).toBe(0);
    expect(result.state.participants).toHaveLength(0);
  });

  // Phase 2b cleanup 2b.12 — canon §8.1 / heroes-flat:1417-1419 + 1443-1445:
  // Respite converts each hero's Victories to XP and resets Victories to 0.
  // Per-character (not party-wide). Non-attending PCs are untouched.
  describe('Phase 2b 2b.12 — Victories→XP conversion (canon §8.1)', () => {
    it("resets each attending PC's victories to 0 after respite", () => {
      const state = baseState({
        attendingCharacterIds: ['char-a', 'char-b'],
        participants: [
          makeHeroParticipant('pc:char-a', { characterId: 'char-a', victories: 3 }),
          makeHeroParticipant('pc:char-b', { characterId: 'char-b', victories: 1 }),
        ],
      });
      const result = applyRespite(state, RESPITE_INTENT);
      expect(result.errors).toBeUndefined();
      const charA = result.state.participants.find(
        (p) => isParticipant(p) && p.characterId === 'char-a',
      );
      const charB = result.state.participants.find(
        (p) => isParticipant(p) && p.characterId === 'char-b',
      );
      expect(charA && isParticipant(charA) ? charA.victories : 'MISSING').toBe(0);
      expect(charB && isParticipant(charB) ? charB.victories : 'MISSING').toBe(0);
    });

    it("does NOT touch non-attending PCs' victories", () => {
      const state = baseState({
        attendingCharacterIds: ['char-a'],
        participants: [
          makeHeroParticipant('pc:char-a', { characterId: 'char-a', victories: 3 }),
          makeHeroParticipant('pc:char-b', { characterId: 'char-b', victories: 5 }),
        ],
      });
      const result = applyRespite(state, RESPITE_INTENT);
      expect(result.errors).toBeUndefined();
      const charB = result.state.participants.find(
        (p) => isParticipant(p) && p.characterId === 'char-b',
      );
      expect(charB && isParticipant(charB) ? charB.victories : 'MISSING').toBe(5);
    });

    it('log message reports per-PC XP amounts derived from each PC pre-respite victories', () => {
      const state = baseState({
        attendingCharacterIds: ['char-a', 'char-b'],
        participants: [
          makeHeroParticipant('pc:char-a', {
            name: 'Aldric',
            characterId: 'char-a',
            victories: 3,
          }),
          makeHeroParticipant('pc:char-b', { name: 'Korva', characterId: 'char-b', victories: 2 }),
        ],
      });
      const result = applyRespite(state, RESPITE_INTENT);
      expect(result.errors).toBeUndefined();
      const infoLogs = result.log.filter((l) => l.kind === 'info');
      const summary = infoLogs[0]?.text ?? '';
      // Each PC's XP appears with their name and amount.
      expect(summary).toMatch(/Aldric/);
      expect(summary).toMatch(/\+?3/);
      expect(summary).toMatch(/Korva/);
      expect(summary).toMatch(/\+?2/);
      // Old behavior — single "X XP each" line — must NOT appear.
      expect(summary).not.toMatch(/XP each/);
    });

    it('log message omits XP awards when all attending PCs have 0 victories', () => {
      const state = baseState({
        attendingCharacterIds: ['char-a'],
        participants: [
          makeHeroParticipant('pc:char-a', { characterId: 'char-a', victories: 0 }),
        ],
      });
      const result = applyRespite(state, RESPITE_INTENT);
      expect(result.errors).toBeUndefined();
      const infoLogs = result.log.filter((l) => l.kind === 'info');
      const summary = infoLogs[0]?.text ?? '';
      expect(summary).toMatch(/refilled recoveries/);
      expect(summary).not.toMatch(/XP/);
    });
  });

  // Pass 3 Slice 1 — Task 15c: CoP override clears when recoveries refill
  describe('Pass 3 Slice 1 — CoP extra-dying-trigger override clears on respite', () => {
    it('clears CoP override and recomputes staminaState to healthy when recoveries refill above 0', () => {
      // PC is dying because CoP override + recoveries 0. Stamina is positive (20/30)
      // so the only reason it's dying is the CoP predicate.
      const state = baseState({
        participants: [
          makeHeroParticipant('pc:cop-hero', {
            maxStamina: 30,
            currentStamina: 20,
            recoveries: { current: 0, max: 3 },
            staminaState: 'dying',
            staminaOverride: {
              kind: 'extra-dying-trigger',
              source: 'curse-of-punishment',
              predicate: 'recoveries-exhausted',
            },
          }),
        ],
      });

      const result = applyRespite(state, RESPITE_INTENT);
      expect(result.errors).toBeUndefined();

      const pc = result.state.participants.find((p) => isParticipant(p) && p.id === 'pc:cop-hero');
      expect(pc && isParticipant(pc) ? pc.staminaOverride : 'MISSING').toBeNull();
      expect(pc && isParticipant(pc) ? pc.staminaState : 'MISSING').toBe('healthy');
    });

    it('emits a StaminaTransitioned derived intent with cause recoveries-refilled when CoP override cleared', () => {
      const state = baseState({
        participants: [
          makeHeroParticipant('pc:cop-hero', {
            maxStamina: 30,
            currentStamina: 20,
            recoveries: { current: 0, max: 3 },
            staminaState: 'dying',
            staminaOverride: {
              kind: 'extra-dying-trigger',
              source: 'curse-of-punishment',
              predicate: 'recoveries-exhausted',
            },
          }),
        ],
      });

      const result = applyRespite(state, RESPITE_INTENT);
      expect(result.errors).toBeUndefined();

      const transitions = result.derived.filter((d) => d.type === 'StaminaTransitioned');
      expect(transitions).toHaveLength(1);
      const payload = transitions[0]?.payload as {
        participantId: string;
        from: string;
        to: string;
        cause: string;
      };
      expect(payload.participantId).toBe('pc:cop-hero');
      expect(payload.from).toBe('dying');
      expect(payload.to).toBe('healthy');
      expect(payload.cause).toBe('recoveries-refilled');
    });

    it('does not clear staminaOverride for a PC without CoP override', () => {
      const state = baseState({
        participants: [
          makeHeroParticipant('pc:normal', {
            maxStamina: 30,
            currentStamina: 25,
            recoveries: { current: 0, max: 3 },
            staminaState: 'healthy',
            staminaOverride: null,
          }),
        ],
      });

      const result = applyRespite(state, RESPITE_INTENT);
      expect(result.errors).toBeUndefined();

      const pc = result.state.participants.find((p) => isParticipant(p) && p.id === 'pc:normal');
      expect(pc && isParticipant(pc) ? pc.staminaOverride : 'MISSING').toBeNull();
      // No StaminaTransitioned derived intents from this PC
      const transitions = result.derived.filter((d) => d.type === 'StaminaTransitioned');
      expect(transitions).toHaveLength(0);
    });
  });
});
