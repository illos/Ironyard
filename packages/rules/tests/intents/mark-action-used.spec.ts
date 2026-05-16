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
  // Slice 2b: the OA detour is gone. The trigger now auto-applies GainResource
  // directly when the enemy is in nullPc.targetingRelations.nullField[].
  it('engine-derived MarkActionUsed on enemy in nullField → Null hero gains +1 discipline (no OA)', () => {
    // Phase 2b 2b.16 B18 — only engine-source MarkActionUsed (`'auto'` from
    // RollPower or `'server'` from the DO) fires the main-action-used trigger.
    // Manual director toggles must NOT mint Discipline.
    const nullPc = makeHeroParticipant('null-1', {
      className: 'Null',
      targetingRelations: { judged: [], marked: [], nullField: ['mon-1'] },
    });
    const enemy = makeMonsterParticipant('mon-1', { name: 'Goblin' });
    const state = baseState({
      participants: [nullPc, enemy],
      encounter: makeRunningEncounterPhase('enc-1'),
      activeDirectorId: ownerActor.userId,
    });
    const intent = stamped({
      type: IntentTypes.MarkActionUsed,
      actor: ownerActor,
      source: 'auto',
      payload: { participantId: 'mon-1', slot: 'main', used: true },
    });
    const result = applyIntent(state, intent);
    expect(result.errors).toBeUndefined();
    // No OA detour
    expect(result.derived.find((d) => d.type === 'RaiseOpenAction')).toBeUndefined();
    // Auto-applied GainResource with causedBy wired
    const gain = result.derived.find((d) => d.type === 'GainResource');
    expect(gain).toBeDefined();
    expect(gain!.payload as { participantId: string; name: string; amount: number }).toMatchObject({
      participantId: 'null-1',
      name: 'discipline',
      amount: 1,
    });
    expect(gain!.causedBy).toBe(intent.id);
  });

  it('B18 — manual MarkActionUsed (director toggle) does NOT mint Discipline', () => {
    const nullPc = makeHeroParticipant('null-1', {
      className: 'Null',
      targetingRelations: { judged: [], marked: [], nullField: ['mon-1'] },
    });
    const enemy = makeMonsterParticipant('mon-1', { name: 'Goblin' });
    const state = baseState({
      participants: [nullPc, enemy],
      encounter: makeRunningEncounterPhase('enc-1'),
      activeDirectorId: ownerActor.userId,
    });
    // Default source is 'manual' from the stamped helper.
    const intent = stamped({
      type: IntentTypes.MarkActionUsed,
      actor: ownerActor,
      payload: { participantId: 'mon-1', slot: 'main', used: true },
    });
    const result = applyIntent(state, intent);
    expect(result.errors).toBeUndefined();
    expect(result.derived.find((d) => d.type === 'GainResource')).toBeUndefined();
  });

  it('director marks main on enemy NOT in nullField → no discipline gain (regression)', () => {
    const nullPc = makeHeroParticipant('null-1', {
      className: 'Null',
      targetingRelations: { judged: [], marked: [], nullField: [] },
    });
    const enemy = makeMonsterParticipant('mon-1', { name: 'Goblin' });
    const state = baseState({
      participants: [nullPc, enemy],
      encounter: makeRunningEncounterPhase('enc-1'),
      activeDirectorId: ownerActor.userId,
    });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.MarkActionUsed,
        actor: ownerActor,
        payload: { participantId: 'mon-1', slot: 'main', used: true },
      }),
    );
    expect(result.errors).toBeUndefined();
    expect(result.derived.find((d) => d.type === 'GainResource')).toBeUndefined();
    expect(result.derived.find((d) => d.type === 'RaiseOpenAction')).toBeUndefined();
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
