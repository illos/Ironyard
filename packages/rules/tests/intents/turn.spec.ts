import { IntentTypes, type Participant } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import { applyIntent } from '../../src/reducer';
import type { CampaignState } from '../../src/types';
import { isParticipant } from '../../src/types';
import {
  baseState,
  makeHeroParticipant,
  makeRunningEncounterPhase,
  ownerActor,
  stamped,
} from './test-utils';

// Pass 3 Slice 2a Task 25 — turn.ts (StartTurn / EndTurn / EndRound)
// consolidated additions:
//
//   * StartTurn: clear encounter heroesActedThisTurn; Conduit Pray OA raise;
//     Elementalist Maintenance auto-drop; d3-plus gain (10th-level Psion).
//   * EndTurn:  filter perTurn entries scoped to ending participant; reset
//     psionFlags.clarityDamageOptOutThisTurn; gate Talent EoT clarity damage
//     on the opt-out; prune unclaimed Pray OAs for the ending participant.
//   * EndRound: reset perEncounterFlags.perRound for every PC.
//
// Spec — docs/superpowers/specs/2026-05-15-pass-3-slice-2a-class-delta-and-
// open-actions-design.md § Reset semantics.

const T = 1_700_000_000_000;

function stateWith(
  participants: Participant[],
  encounterOverrides: Partial<CampaignState['encounter']> = {},
): CampaignState {
  return baseState({
    currentSessionId: 'sess-1',
    participants,
    encounter: makeRunningEncounterPhase('enc-1', encounterOverrides ?? {}),
  });
}

function getPc(state: CampaignState, id: string): Participant {
  const p = state.participants.find((x) => isParticipant(x) && x.id === id);
  if (!p || !isParticipant(p)) throw new Error(`PC ${id} missing`);
  return p;
}

describe('applyStartTurn — Slice 2a additions', () => {
  it('clears encounter.perEncounterFlags.perTurn.heroesActedThisTurn', () => {
    const pc = makeHeroParticipant('pc-1', {
      className: 'Censor',
      heroicResources: [{ name: 'wrath', value: 0, floor: 0 }],
    });
    const state = stateWith([pc]);
    state.encounter!.perEncounterFlags.perTurn.heroesActedThisTurn = ['pc-1', 'pc-2', 'pc-3'];

    const r = applyIntent(
      state,
      stamped({
        type: IntentTypes.StartTurn,
        actor: ownerActor,
        payload: { participantId: 'pc-1' },
        timestamp: T,
      }),
    );
    expect(r.errors ?? []).toEqual([]);
    expect(r.state.encounter?.perEncounterFlags.perTurn.heroesActedThisTurn).toEqual([]);
  });

  it('Conduit raises a pray-to-the-gods OA as a derived intent on StartTurn', () => {
    const conduit = makeHeroParticipant('pc-conduit', {
      className: 'Conduit',
      heroicResources: [{ name: 'piety', value: 0, floor: 0 }],
    });
    const state = stateWith([conduit]);

    const r = applyIntent(
      state,
      stamped({
        type: IntentTypes.StartTurn,
        actor: ownerActor,
        payload: { participantId: 'pc-conduit', rolls: { d3: 2 } },
        timestamp: T,
      }),
    );
    expect(r.errors ?? []).toEqual([]);
    // The pray OA is emitted as a derived RaiseOpenAction intent — the DO
    // recursively applies derived intents to land it in state.openActions.
    // Inspect r.derived rather than r.state.openActions in this unit test.
    const raiseDerived = r.derived.filter((d) => d.type === IntentTypes.RaiseOpenAction);
    expect(raiseDerived).toHaveLength(1);
    const payload = raiseDerived[0]!.payload as {
      kind: string;
      participantId: string;
    };
    expect(payload.kind).toBe('pray-to-the-gods');
    expect(payload.participantId).toBe('pc-conduit');
    expect(raiseDerived[0]!.actor).toEqual(ownerActor);
    expect(raiseDerived[0]!.source).toBe('server');
  });

  it('non-Conduit PCs do NOT raise pray-to-the-gods OA', () => {
    const censor = makeHeroParticipant('pc-censor', {
      className: 'Censor',
      heroicResources: [{ name: 'wrath', value: 0, floor: 0 }],
    });
    const state = stateWith([censor]);

    const r = applyIntent(
      state,
      stamped({
        type: IntentTypes.StartTurn,
        actor: ownerActor,
        payload: { participantId: 'pc-censor' },
        timestamp: T,
      }),
    );
    expect(r.errors ?? []).toEqual([]);
    const raiseDerived = r.derived.filter(
      (d) =>
        d.type === IntentTypes.RaiseOpenAction &&
        (d.payload as { kind?: string }).kind === 'pray-to-the-gods',
    );
    expect(raiseDerived).toEqual([]);
  });

  it('Elementalist Maintenance: deducts costPerTurn when projected essence stays non-negative', () => {
    const ele = makeHeroParticipant('pc-ele', {
      className: 'Elementalist',
      heroicResources: [{ name: 'essence', value: 3, floor: 0 }],
      maintainedAbilities: [
        { abilityId: 'storm-aegis', costPerTurn: 2, startedAtRound: 1 },
        { abilityId: 'flame-shroud', costPerTurn: 1, startedAtRound: 1 },
      ],
    });
    const state = stateWith([ele]);

    const r = applyIntent(
      state,
      stamped({
        type: IntentTypes.StartTurn,
        actor: ownerActor,
        payload: { participantId: 'pc-ele' },
        timestamp: T,
      }),
    );
    expect(r.errors ?? []).toEqual([]);
    // essence: 3 → +2 (per-turn) = 5 → -2 (storm-aegis) → -1 (flame-shroud) = 2
    const after = getPc(r.state, 'pc-ele');
    const essence = after.heroicResources.find(
      (res: { name: string; value: number }) => res.name === 'essence',
    );
    expect(essence?.value).toBe(2);
    // No StopMaintenance derived (everyone affordable).
    const stopDerived = r.derived.filter((d) => d.type === IntentTypes.StopMaintenance);
    expect(stopDerived).toEqual([]);
  });

  it('Elementalist Maintenance: auto-drops the MOST expensive when projected essence would go negative', () => {
    // essence 1 + gain 2 = 3; storm-aegis costs 4 (drop), flame-shroud costs 1 (keep). Final essence = 3 - 1 = 2.
    const ele = makeHeroParticipant('pc-ele', {
      className: 'Elementalist',
      heroicResources: [{ name: 'essence', value: 1, floor: 0 }],
      maintainedAbilities: [
        { abilityId: 'storm-aegis', costPerTurn: 4, startedAtRound: 1 },
        { abilityId: 'flame-shroud', costPerTurn: 1, startedAtRound: 1 },
      ],
    });
    const state = stateWith([ele]);

    const r = applyIntent(
      state,
      stamped({
        type: IntentTypes.StartTurn,
        actor: ownerActor,
        payload: { participantId: 'pc-ele' },
        timestamp: T,
      }),
    );
    expect(r.errors ?? []).toEqual([]);
    const after = getPc(r.state, 'pc-ele');
    const essence = after.heroicResources.find(
      (res: { name: string; value: number }) => res.name === 'essence',
    );
    // 1 + 2 (gain) - 1 (flame-shroud only — storm-aegis auto-dropped) = 2
    expect(essence?.value).toBe(2);
    // storm-aegis is dropped via a derived StopMaintenance.
    const stopDerived = r.derived.filter((d) => d.type === IntentTypes.StopMaintenance);
    expect(stopDerived).toHaveLength(1);
    expect(stopDerived[0]!.payload).toMatchObject({
      participantId: 'pc-ele',
      abilityId: 'storm-aegis',
    });
    expect(stopDerived[0]!.actor).toEqual(ownerActor);
    expect(stopDerived[0]!.source).toBe('server');
  });

  it('10th-level Talent (Psion) gains rolls.d3 + 2 (d3-plus variant)', () => {
    const psion = makeHeroParticipant('pc-psion', {
      className: 'Talent',
      level: 10,
      heroicResources: [{ name: 'clarity', value: 0, floor: -4 }],
    });
    const state = stateWith([psion]);

    const r = applyIntent(
      state,
      stamped({
        type: IntentTypes.StartTurn,
        actor: ownerActor,
        payload: { participantId: 'pc-psion', rolls: { d3: 2 } },
        timestamp: T,
      }),
    );
    expect(r.errors ?? []).toEqual([]);
    const after = getPc(r.state, 'pc-psion');
    const clarity = after.heroicResources.find(
      (res: { name: string; value: number }) => res.name === 'clarity',
    );
    // d3=2 + bonus=2 = 4
    expect(clarity?.value).toBe(4);
  });

  it('10th-level Talent (Psion) with missing rolls.d3 is rejected (missing_dice)', () => {
    const psion = makeHeroParticipant('pc-psion', {
      className: 'Talent',
      level: 10,
      heroicResources: [{ name: 'clarity', value: 0, floor: -4 }],
    });
    const state = stateWith([psion]);

    const r = applyIntent(
      state,
      stamped({
        type: IntentTypes.StartTurn,
        actor: ownerActor,
        payload: { participantId: 'pc-psion' }, // no rolls
        timestamp: T,
      }),
    );
    expect(r.errors?.[0]?.code).toBe('missing_dice');
  });

  it('non-Elementalist with maintainedAbilities entries does NOT auto-drop or deduct', () => {
    // Defensive — maintainedAbilities is generic schema state, but the auto-
    // drop chain must only run for elementalists.
    const censor = makeHeroParticipant('pc-censor', {
      className: 'Censor',
      heroicResources: [{ name: 'wrath', value: 5, floor: 0 }],
      maintainedAbilities: [{ abilityId: 'mystery-ability', costPerTurn: 10, startedAtRound: 1 }],
    });
    const state = stateWith([censor]);

    const r = applyIntent(
      state,
      stamped({
        type: IntentTypes.StartTurn,
        actor: ownerActor,
        payload: { participantId: 'pc-censor' },
        timestamp: T,
      }),
    );
    expect(r.errors ?? []).toEqual([]);
    // wrath: 5 → +2 = 7 (no deduction)
    const after = getPc(r.state, 'pc-censor');
    expect(after.heroicResources[0]?.value).toBe(7);
    expect(r.derived.filter((d) => d.type === IntentTypes.StopMaintenance)).toEqual([]);
    // Original maintenance unchanged.
    expect(after.maintainedAbilities).toHaveLength(1);
  });
});

describe('applyEndTurn — Slice 2a additions', () => {
  it('filters perEncounterFlags.perTurn.entries whose scopedToTurnOf === endingId, across ALL participants', () => {
    const pcA = makeHeroParticipant('pc-A');
    const pcB = makeHeroParticipant('pc-B');
    pcA.perEncounterFlags = {
      ...pcA.perEncounterFlags,
      perTurn: {
        entries: [
          { scopedToTurnOf: 'pc-A', key: 'damageDealtThisTurn', value: 4 },
          { scopedToTurnOf: 'pc-B', key: 'damageTakenThisTurn', value: 3 },
        ],
      },
    };
    pcB.perEncounterFlags = {
      ...pcB.perEncounterFlags,
      perTurn: {
        entries: [{ scopedToTurnOf: 'pc-A', key: 'damageTakenThisTurn', value: 6 }],
      },
    };
    const state = stateWith([pcA, pcB], { activeParticipantId: 'pc-A' });

    const r = applyIntent(
      state,
      stamped({
        type: IntentTypes.EndTurn,
        actor: ownerActor,
        payload: {},
        timestamp: T,
      }),
    );
    expect(r.errors ?? []).toEqual([]);
    const a = getPc(r.state, 'pc-A');
    const b = getPc(r.state, 'pc-B');
    // pcA: entry scoped to pc-A removed; entry scoped to pc-B preserved.
    expect(a.perEncounterFlags.perTurn.entries).toEqual([
      { scopedToTurnOf: 'pc-B', key: 'damageTakenThisTurn', value: 3 },
    ]);
    // pcB: entry scoped to pc-A removed.
    expect(b.perEncounterFlags.perTurn.entries).toEqual([]);
  });

  it('resets ending participant psionFlags.clarityDamageOptOutThisTurn to false', () => {
    const psion = makeHeroParticipant('pc-psion', {
      className: 'Talent',
      psionFlags: { clarityDamageOptOutThisTurn: true },
      heroicResources: [{ name: 'clarity', value: 2, floor: -4 }], // not negative — no EoT damage either way
    });
    const state = stateWith([psion], { activeParticipantId: 'pc-psion' });

    const r = applyIntent(
      state,
      stamped({
        type: IntentTypes.EndTurn,
        actor: ownerActor,
        payload: {},
        timestamp: T,
      }),
    );
    expect(r.errors ?? []).toEqual([]);
    const after = getPc(r.state, 'pc-psion');
    expect(after.psionFlags.clarityDamageOptOutThisTurn).toBe(false);
  });

  it('skips Talent EoT clarity damage when psionFlags.clarityDamageOptOutThisTurn is set', () => {
    const psion = makeHeroParticipant('pc-psion', {
      className: 'Talent',
      level: 10,
      psionFlags: { clarityDamageOptOutThisTurn: true },
      heroicResources: [{ name: 'clarity', value: -3, floor: -4 }],
    });
    const state = stateWith([psion], { activeParticipantId: 'pc-psion' });

    const r = applyIntent(
      state,
      stamped({
        type: IntentTypes.EndTurn,
        actor: ownerActor,
        payload: {},
        timestamp: T,
      }),
    );
    expect(r.errors ?? []).toEqual([]);
    // No derived ApplyDamage — opt-out suppressed it.
    const dmgDerived = r.derived.filter((d) => d.type === IntentTypes.ApplyDamage);
    expect(dmgDerived).toEqual([]);
    // Opt-out flag still resets.
    const after = getPc(r.state, 'pc-psion');
    expect(after.psionFlags.clarityDamageOptOutThisTurn).toBe(false);
  });

  it('still fires Talent EoT clarity damage when opt-out is NOT set (regression)', () => {
    const talent = makeHeroParticipant('pc-talent', {
      className: 'Talent',
      psionFlags: { clarityDamageOptOutThisTurn: false },
      heroicResources: [{ name: 'clarity', value: -3, floor: -4 }],
    });
    const state = stateWith([talent], { activeParticipantId: 'pc-talent' });

    const r = applyIntent(
      state,
      stamped({
        type: IntentTypes.EndTurn,
        actor: ownerActor,
        payload: {},
        timestamp: T,
      }),
    );
    expect(r.errors ?? []).toEqual([]);
    const dmgDerived = r.derived.filter((d) => d.type === IntentTypes.ApplyDamage);
    expect(dmgDerived).toHaveLength(1);
    expect(dmgDerived[0]!.payload).toMatchObject({
      targetId: 'pc-talent',
      amount: 3,
      damageType: 'untyped',
    });
  });

  it('prunes unclaimed pray-to-the-gods OAs for the ending participant', () => {
    const conduit = makeHeroParticipant('pc-conduit', {
      className: 'Conduit',
      heroicResources: [{ name: 'piety', value: 0, floor: 0 }],
    });
    const state = stateWith([conduit], { activeParticipantId: 'pc-conduit' });
    state.openActions = [
      {
        id: 'oa-pray-1',
        kind: 'pray-to-the-gods',
        participantId: 'pc-conduit',
        raisedAtRound: 1,
        raisedByIntentId: 'i_x',
        expiresAtRound: 1,
        payload: {},
      },
      // OA for a different participant — should be preserved.
      {
        id: 'oa-pray-other',
        kind: 'pray-to-the-gods',
        participantId: 'pc-other',
        raisedAtRound: 1,
        raisedByIntentId: 'i_x',
        expiresAtRound: 1,
        payload: {},
      },
    ];

    const r = applyIntent(
      state,
      stamped({
        type: IntentTypes.EndTurn,
        actor: ownerActor,
        payload: {},
        timestamp: T,
      }),
    );
    expect(r.errors ?? []).toEqual([]);
    const remaining = r.state.openActions.map((oa) => oa.id);
    expect(remaining).toEqual(['oa-pray-other']);
  });
});

describe('applyEndRound — Slice 2a perRound reset', () => {
  it('resets perEncounterFlags.perRound to defaults for every PC', () => {
    const pcA = makeHeroParticipant('pc-A');
    const pcB = makeHeroParticipant('pc-B');
    pcA.perEncounterFlags = {
      ...pcA.perEncounterFlags,
      perRound: {
        ...pcA.perEncounterFlags.perRound,
        tookDamage: true,
        judgedTargetDamagedMe: true,
        markedTargetDamagedByAnyone: true,
        creatureForceMoved: true,
      },
    };
    pcB.perEncounterFlags = {
      ...pcB.perEncounterFlags,
      perRound: {
        ...pcB.perEncounterFlags.perRound,
        directorSpentMalice: true,
        dealtSurgeDamage: true,
      },
    };
    const state = stateWith([pcA, pcB], { currentRound: 3 });

    const r = applyIntent(
      state,
      stamped({
        type: IntentTypes.EndRound,
        actor: ownerActor,
        payload: {},
        timestamp: T,
      }),
    );
    expect(r.errors ?? []).toEqual([]);
    const a = getPc(r.state, 'pc-A');
    const b = getPc(r.state, 'pc-B');
    // All perRound flags back to false.
    expect(a.perEncounterFlags.perRound.tookDamage).toBe(false);
    expect(a.perEncounterFlags.perRound.judgedTargetDamagedMe).toBe(false);
    expect(a.perEncounterFlags.perRound.markedTargetDamagedByAnyone).toBe(false);
    expect(a.perEncounterFlags.perRound.creatureForceMoved).toBe(false);
    expect(b.perEncounterFlags.perRound.directorSpentMalice).toBe(false);
    expect(b.perEncounterFlags.perRound.dealtSurgeDamage).toBe(false);
  });

  it('does NOT touch perEncounter latches or perTurn entries on EndRound', () => {
    const pc = makeHeroParticipant('pc-A');
    pc.perEncounterFlags = {
      perTurn: {
        entries: [{ scopedToTurnOf: 'pc-A', key: 'damageDealtThisTurn', value: 4 }],
      },
      perRound: { ...pc.perEncounterFlags.perRound, tookDamage: true },
      perEncounter: {
        ...pc.perEncounterFlags.perEncounter,
        firstTimeWindedTriggered: true,
        troubadourThreeHeroesTriggered: true,
      },
    };
    const state = stateWith([pc], { currentRound: 2 });

    const r = applyIntent(
      state,
      stamped({
        type: IntentTypes.EndRound,
        actor: ownerActor,
        payload: {},
        timestamp: T,
      }),
    );
    expect(r.errors ?? []).toEqual([]);
    const after = getPc(r.state, 'pc-A');
    // perRound reset…
    expect(after.perEncounterFlags.perRound.tookDamage).toBe(false);
    // …but perTurn entries preserved (those reset at EndTurn).
    expect(after.perEncounterFlags.perTurn.entries).toHaveLength(1);
    // …and perEncounter latches preserved (those reset at EndEncounter).
    expect(after.perEncounterFlags.perEncounter.firstTimeWindedTriggered).toBe(true);
    expect(after.perEncounterFlags.perEncounter.troubadourThreeHeroesTriggered).toBe(true);
  });
});
