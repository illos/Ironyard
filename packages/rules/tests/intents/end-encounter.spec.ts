import { describe, expect, it } from 'vitest';
import { IntentTypes } from '@ironyard/shared';
import { applyEndEncounter } from '../../src/intents/end-encounter';
import { baseState, makeHeroParticipant, makeMonsterParticipant, makeRunningEncounterPhase } from './test-utils';
import { isParticipant } from '../../src/types';

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
