import { IntentTypes } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import { applyIntent } from '../../src/reducer';
import {
  baseState,
  makeHeroParticipant,
  makeMonsterParticipant,
  makeRunningEncounterPhase,
  ownerActor,
  stamped,
} from './test-utils';

describe('applyMarkActionUsed', () => {
  it('flips the named slot to true on the named participant (owner of the participant is the actor)', () => {
    const hero = makeHeroParticipant('pc-1', { ownerId: 'u-mira', name: 'Mira' });
    const state = baseState({
      participants: [hero],
      encounter: makeRunningEncounterPhase('enc-1'),
      activeDirectorId: ownerActor.userId,
    });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.MarkActionUsed,
        actor: { userId: 'u-mira', role: 'player' },
        payload: { participantId: 'pc-1', slot: 'main', used: true },
      }),
    );
    expect(result.errors).toBeUndefined();
    const p = result.state.participants.find((x) => x.id === 'pc-1');
    expect(p?.turnActionUsage).toEqual({ main: true, maneuver: false, move: false });
  });

  it('supports clearing (used: false) — used by the undo path', () => {
    const hero = makeHeroParticipant('pc-2', {
      ownerId: 'u-mira',
      name: 'Mira',
      turnActionUsage: { main: true, maneuver: true, move: false },
    });
    const state = baseState({
      participants: [hero],
      encounter: makeRunningEncounterPhase('enc-1'),
      activeDirectorId: ownerActor.userId,
    });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.MarkActionUsed,
        actor: { userId: 'u-mira', role: 'player' },
        payload: { participantId: 'pc-2', slot: 'main', used: false },
      }),
    );
    expect(result.errors).toBeUndefined();
    const p = result.state.participants.find((x) => x.id === 'pc-2');
    expect(p?.turnActionUsage).toEqual({ main: false, maneuver: true, move: false });
  });

  it('rejects when actor is neither owner nor active director', () => {
    const hero = makeHeroParticipant('pc-3', { ownerId: 'u-mira', name: 'Mira' });
    const state = baseState({
      participants: [hero],
      encounter: makeRunningEncounterPhase('enc-1'),
      activeDirectorId: ownerActor.userId, // owner-1 is director, not 'u-intruder'
    });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.MarkActionUsed,
        actor: { userId: 'u-intruder', role: 'player' },
        payload: { participantId: 'pc-3', slot: 'maneuver', used: true },
      }),
    );
    expect(result.errors).toBeDefined();
    expect(result.errors![0]!.code).toBe('forbidden');
  });

  it('rejects for a missing participant id', () => {
    const state = baseState({
      participants: [],
      encounter: makeRunningEncounterPhase('enc-1'),
      activeDirectorId: ownerActor.userId,
    });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.MarkActionUsed,
        actor: ownerActor,
        payload: { participantId: 'no-such-participant', slot: 'move', used: true },
      }),
    );
    expect(result.errors).toBeDefined();
    expect(result.errors![0]!.code).toBe('participant_not_found');
  });
});

describe('applyMarkActionUsed — class-δ main-action-used trigger wiring (Task 24)', () => {
  it('director marks main on an enemy monster → Null hero gets a spatial Null Field OA raised with causedBy', () => {
    const nullPc = makeHeroParticipant('null-1', { className: 'Null' });
    const enemy = makeMonsterParticipant('mon-1', { name: 'Goblin' });
    const state = baseState({
      participants: [nullPc, enemy],
      encounter: makeRunningEncounterPhase('enc-1'),
      activeDirectorId: ownerActor.userId,
    });
    const intent = stamped({
      type: IntentTypes.MarkActionUsed,
      actor: ownerActor,
      payload: { participantId: 'mon-1', slot: 'main', used: true },
    });
    const result = applyIntent(state, intent);
    expect(result.errors).toBeUndefined();
    const oa = result.derived.find((d) => d.type === 'RaiseOpenAction');
    expect(oa).toBeDefined();
    const oaPayload = oa!.payload as {
      kind: string;
      participantId: string;
      payload: { actorId: string; actorName: string };
    };
    expect(oaPayload.kind).toBe('spatial-trigger-null-field');
    expect(oaPayload.participantId).toBe('null-1');
    expect(oaPayload.payload.actorId).toBe('mon-1');
    expect(oa!.causedBy).toBe(intent.id);
  });

  it('main action used on a PC ally (not a monster) → no Null OA emitted', () => {
    const nullPc = makeHeroParticipant('null-1', { className: 'Null' });
    const ally = makeHeroParticipant('pc-ally', {
      ownerId: 'u-ally',
      className: 'Censor',
    });
    const state = baseState({
      participants: [nullPc, ally],
      encounter: makeRunningEncounterPhase('enc-1'),
      activeDirectorId: ownerActor.userId,
    });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.MarkActionUsed,
        actor: { userId: 'u-ally', role: 'player' },
        payload: { participantId: 'pc-ally', slot: 'main', used: true },
      }),
    );
    expect(result.errors).toBeUndefined();
    expect(result.derived.find((d) => d.type === 'RaiseOpenAction')).toBeUndefined();
  });

  it('slot=maneuver or slot=move on an enemy → no Null Field OA (only main triggers)', () => {
    const nullPc = makeHeroParticipant('null-1', { className: 'Null' });
    const enemy = makeMonsterParticipant('mon-1', { name: 'Goblin' });
    const state = baseState({
      participants: [nullPc, enemy],
      encounter: makeRunningEncounterPhase('enc-1'),
      activeDirectorId: ownerActor.userId,
    });
    const maneuverResult = applyIntent(
      state,
      stamped({
        type: IntentTypes.MarkActionUsed,
        actor: ownerActor,
        payload: { participantId: 'mon-1', slot: 'maneuver', used: true },
      }),
    );
    expect(maneuverResult.errors).toBeUndefined();
    expect(maneuverResult.derived.find((d) => d.type === 'RaiseOpenAction')).toBeUndefined();

    const moveResult = applyIntent(
      state,
      stamped({
        type: IntentTypes.MarkActionUsed,
        actor: ownerActor,
        payload: { participantId: 'mon-1', slot: 'move', used: true },
      }),
    );
    expect(moveResult.errors).toBeUndefined();
    expect(moveResult.derived.find((d) => d.type === 'RaiseOpenAction')).toBeUndefined();
  });
});
