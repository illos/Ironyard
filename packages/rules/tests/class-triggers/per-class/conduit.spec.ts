import { describe, expect, it } from 'vitest';
import type {
  ActionEvent,
  ActionTriggerContext,
} from '../../../src/class-triggers/action-triggers';
import { evaluate as evaluateConduit } from '../../../src/class-triggers/per-class/conduit';
import {
  baseState,
  makeHeroParticipant,
  makeRunningEncounterPhase,
} from '../../intents/test-utils';

// Pass 3 Slice 2a — Conduit class-δ action triggers.
//
// Conduit has no action-driven triggers in slice 2a. Its only class-δ trigger
// is the StartTurn-driven "Pray to the Gods" prompt (canon § 5.4.2), which
// lives in turn.ts (Task 25). The evaluator here exists for directory
// uniformity and must remain a no-op until/unless Conduit grows an
// action-driven trigger.

const testCtx: ActionTriggerContext = {
  actor: { userId: 'test-user', role: 'director' },
  rolls: {},
};

describe('class-triggers/per-class/conduit.evaluate', () => {
  it('returns empty for every action event kind (no-op)', () => {
    const conduit = makeHeroParticipant('con-1', {
      className: 'Conduit',
      heroicResources: [{ name: 'piety', value: 0, floor: 0 }],
    });
    const state = baseState({
      currentSessionId: 'sess-1',
      participants: [conduit],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const events: ActionEvent[] = [
      { kind: 'damage-applied', dealerId: 'con-1', targetId: 'con-1', amount: 5, type: 'holy' },
      {
        kind: 'ability-used',
        actorId: 'con-1',
        abilityId: 'sanctify',
        abilityCategory: 'heroic',
        abilityKind: 'action',
        sideOfActor: 'heroes',
      },
      { kind: 'surge-spent-with-damage', actorId: 'con-1', surgesSpent: 1, damageType: 'holy' },
      {
        kind: 'creature-force-moved',
        sourceId: 'con-1',
        targetId: 'con-1',
        subkind: 'push',
        distance: 1,
      },
      { kind: 'main-action-used', actorId: 'con-1' },
      { kind: 'malice-spent', amount: 3 },
      {
        kind: 'roll-power-outcome',
        actorId: 'con-1',
        abilityId: 'sanctify',
        naturalValues: [12, 14],
      },
    ];
    for (const event of events) {
      expect(evaluateConduit(state, event, testCtx)).toEqual([]);
    }
  });
});
