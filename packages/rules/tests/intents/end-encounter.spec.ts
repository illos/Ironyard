import { IntentTypes } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import { applyEndEncounter } from '../../src/intents/end-encounter';
import { isParticipant } from '../../src/types';
import {
  baseState,
  makeHeroParticipant,
  makeMonsterParticipant,
  makeRunningEncounterPhase,
} from './test-utils';

// Helper: build a standard EndEncounter intent for a given encounter id.
function endEncounterIntent(encounterId: string) {
  return {
    id: 'i-end',
    campaignId: 'c1',
    actor: { userId: 'dir-1', role: 'director' as const },
    source: 'manual' as const,
    type: IntentTypes.EndEncounter,
    payload: { encounterId },
    timestamp: 0,
  };
}

describe('applyEndEncounter — targetingRelations', () => {
  it('clears targetingRelations on every participant', () => {
    const participants = [
      makeHeroParticipant('censor-1', {
        targetingRelations: { judged: ['goblin-1', 'goblin-2'], marked: [], nullField: [] },
      }),
      makeHeroParticipant('tactician-1', {
        targetingRelations: { judged: [], marked: ['goblin-1'], nullField: [] },
      }),
      makeHeroParticipant('null-1', {
        targetingRelations: { judged: [], marked: [], nullField: ['censor-1', 'tactician-1'] },
      }),
      // Monster participants — the novel branch that previously returned entry unchanged.
      makeMonsterParticipant('goblin-1', {
        targetingRelations: { judged: ['censor-1'], marked: [], nullField: [] },
      }),
      makeMonsterParticipant('goblin-2', {
        targetingRelations: { judged: [], marked: ['tactician-1'], nullField: ['null-1'] },
      }),
    ];

    const state = baseState({
      currentSessionId: 'sess-1',
      participants,
      encounter: makeRunningEncounterPhase('enc-test-1'),
    });

    const res = applyEndEncounter(state, {
      id: 'i-1',
      campaignId: 'c1',
      actor: { userId: 'dir-1', role: 'director' },
      source: 'manual',
      type: IntentTypes.EndEncounter,
      payload: { encounterId: state.encounter!.id },
      timestamp: 0,
    });

    for (const entry of res.state.participants) {
      if (isParticipant(entry)) {
        expect(entry.targetingRelations).toEqual({ judged: [], marked: [], nullField: [] });
      }
    }
  });
});

// Phase 2b cleanup 2b.12 — Victories grant at EndEncounter (canon §8.1 +
// Combat.md:722). Canon: "At the end of combat, the Director determines if
// the heroes earn any Victories ... Each time your hero survives a combat
// encounter ... you earn 1 Victory." Engine simplification: any PC who is
// not 'dead' at the moment of EndEncounter (after dieAtEncounterEnd resolves)
// gets +1 victory. See docs/superpowers/notes/2026-05-16-phase-2b-shipped-code-audit.md.
describe('applyEndEncounter — victories grant (canon §8.1)', () => {
  it('grants +1 victory to each surviving PC participant', () => {
    const state = baseState({
      participants: [
        makeHeroParticipant('pc:char-a', { victories: 2 }),
        makeHeroParticipant('pc:char-b', { victories: 0 }),
      ],
      encounter: makeRunningEncounterPhase('enc-vic-1'),
    });
    const res = applyEndEncounter(state, endEncounterIntent(state.encounter!.id));
    const a = res.state.participants.find((p) => isParticipant(p) && p.id === 'pc:char-a');
    const b = res.state.participants.find((p) => isParticipant(p) && p.id === 'pc:char-b');
    expect(a && isParticipant(a) ? a.victories : 'MISSING').toBe(3);
    expect(b && isParticipant(b) ? b.victories : 'MISSING').toBe(1);
  });

  it('does NOT grant a victory to a PC at staminaState === "dead"', () => {
    const state = baseState({
      participants: [
        makeHeroParticipant('pc:alive', { victories: 0, staminaState: 'healthy' }),
        makeHeroParticipant('pc:dead', {
          victories: 4,
          staminaState: 'dead',
          currentStamina: -100,
        }),
      ],
      encounter: makeRunningEncounterPhase('enc-vic-2'),
    });
    const res = applyEndEncounter(state, endEncounterIntent(state.encounter!.id));
    const alive = res.state.participants.find((p) => isParticipant(p) && p.id === 'pc:alive');
    const dead = res.state.participants.find((p) => isParticipant(p) && p.id === 'pc:dead');
    expect(alive && isParticipant(alive) ? alive.victories : 'MISSING').toBe(1);
    expect(dead && isParticipant(dead) ? dead.victories : 'MISSING').toBe(4); // unchanged
  });

  it('does NOT grant victories to monster participants', () => {
    const state = baseState({
      participants: [
        makeHeroParticipant('pc:char-a', { victories: 1 }),
        makeMonsterParticipant('monster:goblin-1', { victories: 7 }),
      ],
      encounter: makeRunningEncounterPhase('enc-vic-3'),
    });
    const res = applyEndEncounter(state, endEncounterIntent(state.encounter!.id));
    const monster = res.state.participants.find(
      (p) => isParticipant(p) && p.id === 'monster:goblin-1',
    );
    expect(monster && isParticipant(monster) ? monster.victories : 'MISSING').toBe(7);
  });

  it('does NOT grant a victory to a doomed PC who dies via dieAtEncounterEnd', () => {
    // Hakaan doomed PC alive at encounter end; dieAtEncounterEnd makes them
    // 'dead'. Per canon, they did not "survive" the encounter — no victory.
    const state = baseState({
      participants: [
        makeHeroParticipant('pc:hakaan-doomed', {
          victories: 2,
          staminaState: 'doomed',
          staminaOverride: {
            kind: 'doomed',
            source: 'hakaan-doomsight',
            canRegainStamina: true,
            autoTier3OnPowerRolls: true,
            staminaDeathThreshold: 'none',
            dieAtEncounterEnd: true,
          },
        }),
      ],
      encounter: makeRunningEncounterPhase('enc-vic-4'),
    });
    const res = applyEndEncounter(state, endEncounterIntent(state.encounter!.id));
    const pc = res.state.participants.find((p) => isParticipant(p) && p.id === 'pc:hakaan-doomed');
    expect(pc && isParticipant(pc) ? pc.staminaState : 'MISSING').toBe('dead');
    expect(pc && isParticipant(pc) ? pc.victories : 'MISSING').toBe(2); // unchanged
  });
});
