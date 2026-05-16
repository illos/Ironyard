import { describe, expect, it } from 'vitest';
import { IntentTypes } from '@ironyard/shared';
import { applyEndEncounter } from '../../src/intents/end-encounter';
import { baseState, makeHeroParticipant, makeRunningEncounterPhase } from './test-utils';
import { isParticipant } from '../../src/types';

describe('applyEndEncounter — targetingRelations', () => {
  it('clears targetingRelations on every participant', () => {
    const participants = [
      makeHeroParticipant('censor-1', {
        targetingRelations: { judged: ['goblin-a', 'goblin-b'], marked: [], nullField: [] },
      }),
      makeHeroParticipant('tactician-1', {
        targetingRelations: { judged: [], marked: ['goblin-c'], nullField: [] },
      }),
      makeHeroParticipant('null-1', {
        targetingRelations: { judged: [], marked: [], nullField: ['goblin-a', 'goblin-c'] },
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
