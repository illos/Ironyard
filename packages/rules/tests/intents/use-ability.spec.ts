import { IntentTypes } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import { applyIntent } from '../../src/reducer';
import { applyUseAbility } from '../../src/intents/use-ability';
import {
  baseState,
  makeHeroParticipant,
  makeMonsterParticipant,
  makeRunningEncounterPhase,
  ownerActor,
  stamped,
} from './test-utils';

const ENCOUNTER_ID = 'enc-1';

describe('applyUseAbility', () => {
  it('appends an active-ability entry to the participant', () => {
    const hero = makeHeroParticipant('pc:alice');
    const state = baseState({
      participants: [hero],
      encounter: makeRunningEncounterPhase(ENCOUNTER_ID),
    });

    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.UseAbility,
        actor: ownerActor,
        payload: {
          participantId: hero.id,
          abilityId: 'human.detect-the-supernatural',
          source: 'ancestry',
          duration: { kind: 'EoT' },
        },
      }),
    );

    expect(result.errors).toBeUndefined();
    const after = result.state.participants[0];
    if (!after || after.kind !== 'pc') throw new Error('expected pc participant');
    expect(after.activeAbilities).toHaveLength(1);
    expect(after.activeAbilities[0]).toMatchObject({
      abilityId: 'human.detect-the-supernatural',
      source: 'ancestry',
      expiresAt: { kind: 'EoT' },
    });
  });

  it('is idempotent — re-activating an already-active ability is a no-op (still logs)', () => {
    const hero = makeHeroParticipant('pc:alice', {
      activeAbilities: [
        {
          abilityId: 'human.detect-the-supernatural',
          source: 'ancestry',
          expiresAt: { kind: 'EoT' },
          appliedAtSeq: 1,
        },
      ],
    });
    const state = baseState({
      participants: [hero],
      encounter: makeRunningEncounterPhase(ENCOUNTER_ID),
    });

    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.UseAbility,
        actor: ownerActor,
        payload: {
          participantId: hero.id,
          abilityId: 'human.detect-the-supernatural',
          source: 'ancestry',
          duration: { kind: 'EoT' },
        },
      }),
    );

    expect(result.errors).toBeUndefined();
    const after = result.state.participants[0];
    if (!after || after.kind !== 'pc') throw new Error('expected pc participant');
    expect(after.activeAbilities).toHaveLength(1);
    expect(result.state.seq).toBe(state.seq + 1);
  });

  it('rejects when no encounter is active', () => {
    const hero = makeHeroParticipant('pc:alice');
    const state = baseState({ participants: [hero], encounter: null });

    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.UseAbility,
        actor: ownerActor,
        payload: {
          participantId: hero.id,
          abilityId: 'human.detect-the-supernatural',
          source: 'ancestry',
          duration: { kind: 'EoT' },
        },
      }),
    );

    expect(result.errors?.[0]?.code).toBe('no_active_encounter');
  });

  it('rejects when the participant is not in the roster', () => {
    const state = baseState({
      participants: [],
      encounter: makeRunningEncounterPhase(ENCOUNTER_ID),
    });

    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.UseAbility,
        actor: ownerActor,
        payload: {
          participantId: 'pc:ghost',
          abilityId: 'human.detect-the-supernatural',
          source: 'ancestry',
          duration: { kind: 'EoT' },
        },
      }),
    );

    expect(result.errors?.[0]?.code).toBe('participant_missing');
  });

  it('rejects an invalid payload', () => {
    const state = baseState({
      encounter: makeRunningEncounterPhase(ENCOUNTER_ID),
    });

    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.UseAbility,
        actor: ownerActor,
        payload: {
          participantId: '',
          abilityId: 'x',
          source: 'ancestry',
          duration: { kind: 'EoT' },
        },
      }),
    );

    expect(result.errors?.[0]?.code).toBe('invalid_payload');
  });
});

describe('applyUseAbility — slice 2a additions', () => {
  it('appends actor id to encounter.perEncounterFlags.perTurn.heroesActedThisTurn (PC only)', () => {
    const hero = makeHeroParticipant('pc:alice');
    const state = baseState({
      participants: [hero],
      encounter: makeRunningEncounterPhase(ENCOUNTER_ID),
    });

    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.UseAbility,
        actor: ownerActor,
        payload: {
          participantId: hero.id,
          abilityId: 'human.detect-the-supernatural',
          source: 'ancestry',
          duration: { kind: 'EoT' },
        },
      }),
    );

    expect(result.errors).toBeUndefined();
    expect(result.state.encounter?.perEncounterFlags.perTurn.heroesActedThisTurn).toEqual([
      hero.id,
    ]);
  });

  it('dedupes heroesActedThisTurn on second call by the same PC', () => {
    const hero = makeHeroParticipant('pc:alice');
    const state = baseState({
      participants: [hero],
      encounter: makeRunningEncounterPhase(ENCOUNTER_ID, {
        perEncounterFlags: { perTurn: { heroesActedThisTurn: [hero.id] } },
      }),
    });

    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.UseAbility,
        actor: ownerActor,
        payload: {
          participantId: hero.id,
          abilityId: 'polder.shadowmeld',
          source: 'ancestry',
          duration: { kind: 'EoT' },
        },
      }),
    );

    expect(result.errors).toBeUndefined();
    expect(result.state.encounter?.perEncounterFlags.perTurn.heroesActedThisTurn).toEqual([
      hero.id,
    ]);
  });

  it('does NOT append a monster to heroesActedThisTurn', () => {
    const monster = makeMonsterParticipant('mon:goblin');
    const state = baseState({
      participants: [monster],
      encounter: makeRunningEncounterPhase(ENCOUNTER_ID),
    });

    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.UseAbility,
        actor: ownerActor,
        payload: {
          participantId: monster.id,
          abilityId: 'some.monster-trait',
          source: 'class',
          duration: { kind: 'EoT' },
        },
      }),
    );

    expect(result.errors).toBeUndefined();
    expect(result.state.encounter?.perEncounterFlags.perTurn.heroesActedThisTurn).toEqual([]);
  });

  it('emits derived StartMaintenance when startMaintenance: true + Elementalist + costPerTurn > 0', () => {
    const elementalist = makeHeroParticipant('pc:ele', { className: 'Elementalist' });
    const state = baseState({
      participants: [elementalist],
      encounter: makeRunningEncounterPhase(ENCOUNTER_ID),
    });

    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.UseAbility,
        actor: ownerActor,
        payload: {
          participantId: elementalist.id,
          abilityId: 'flame-wall',
          source: 'class',
          duration: { kind: 'end_of_encounter' },
          startMaintenance: true,
          maintenanceCostPerTurn: 2,
        },
      }),
    );

    expect(result.errors).toBeUndefined();
    const startMaint = result.derived.find((d) => d.type === IntentTypes.StartMaintenance);
    expect(startMaint).toBeDefined();
    expect(startMaint?.payload).toMatchObject({
      participantId: elementalist.id,
      abilityId: 'flame-wall',
      costPerTurn: 2,
    });
  });

  it('does NOT emit StartMaintenance for a non-Elementalist (logs a warning instead)', () => {
    const fury = makeHeroParticipant('pc:fury', { className: 'Fury' });
    const state = baseState({
      participants: [fury],
      encounter: makeRunningEncounterPhase(ENCOUNTER_ID),
    });

    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.UseAbility,
        actor: ownerActor,
        payload: {
          participantId: fury.id,
          abilityId: 'flame-wall',
          source: 'class',
          duration: { kind: 'end_of_encounter' },
          startMaintenance: true,
          maintenanceCostPerTurn: 2,
        },
      }),
    );

    expect(result.errors).toBeUndefined();
    const startMaint = result.derived.find((d) => d.type === IntentTypes.StartMaintenance);
    expect(startMaint).toBeUndefined();
    expect(
      result.log.some((l) => l.kind === 'warning' && l.text.includes('not an Elementalist')),
    ).toBe(true);
  });

  it('sets psionFlags.clarityDamageOptOutThisTurn when talentClarityDamageOptOutThisTurn: true', () => {
    const talent = makeHeroParticipant('pc:talent', { className: 'Talent' });
    const state = baseState({
      participants: [talent],
      encounter: makeRunningEncounterPhase(ENCOUNTER_ID),
    });

    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.UseAbility,
        actor: ownerActor,
        payload: {
          participantId: talent.id,
          abilityId: 'mind-spike',
          source: 'class',
          duration: { kind: 'EoT' },
          talentClarityDamageOptOutThisTurn: true,
        },
      }),
    );

    expect(result.errors).toBeUndefined();
    const after = result.state.participants[0];
    if (!after || after.kind !== 'pc') throw new Error('expected pc participant');
    expect(after.psionFlags.clarityDamageOptOutThisTurn).toBe(true);
  });

  it('logs an info entry when talentStrainedOptInRider: true (no-op since rider lives in RollPower)', () => {
    const talent = makeHeroParticipant('pc:talent', { className: 'Talent' });
    const state = baseState({
      participants: [talent],
      encounter: makeRunningEncounterPhase(ENCOUNTER_ID),
    });

    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.UseAbility,
        actor: ownerActor,
        payload: {
          participantId: talent.id,
          abilityId: 'mind-spike',
          source: 'class',
          duration: { kind: 'EoT' },
          talentStrainedOptInRider: true,
        },
      }),
    );

    expect(result.errors).toBeUndefined();
    expect(result.log.some((l) => l.kind === 'info' && l.text.includes('Strained: rider'))).toBe(
      true,
    );
  });

  it('emits Tactician spatial OA when an ally PC uses a heroic ability', () => {
    const tactician = makeHeroParticipant('pc:tac', { className: 'Tactician' });
    const ally = makeHeroParticipant('pc:ally', { className: 'Fury' });
    const state = baseState({
      participants: [tactician, ally],
      encounter: makeRunningEncounterPhase(ENCOUNTER_ID),
    });

    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.UseAbility,
        actor: ownerActor,
        payload: {
          participantId: ally.id,
          abilityId: 'execute',
          source: 'class',
          duration: { kind: 'EoT' },
          abilityCategory: 'heroic',
          abilityKind: 'action',
        },
      }),
    );

    expect(result.errors).toBeUndefined();
    const raiseOA = result.derived.find(
      (d) =>
        d.type === IntentTypes.RaiseOpenAction &&
        (d.payload as { kind?: string }).kind === 'spatial-trigger-tactician-ally-heroic',
    );
    expect(raiseOA).toBeDefined();
    expect((raiseOA?.payload as { participantId?: string }).participantId).toBe(tactician.id);
  });

  it('does NOT emit Tactician OA for a signature ability (default category)', () => {
    const tactician = makeHeroParticipant('pc:tac', { className: 'Tactician' });
    const ally = makeHeroParticipant('pc:ally', { className: 'Fury' });
    const state = baseState({
      participants: [tactician, ally],
      encounter: makeRunningEncounterPhase(ENCOUNTER_ID),
    });

    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.UseAbility,
        actor: ownerActor,
        payload: {
          participantId: ally.id,
          abilityId: 'strike',
          source: 'class',
          duration: { kind: 'EoT' },
          // No abilityCategory → defaults to 'signature'
        },
      }),
    );

    expect(result.errors).toBeUndefined();
    const raiseOA = result.derived.find(
      (d) =>
        d.type === IntentTypes.RaiseOpenAction &&
        (d.payload as { kind?: string }).kind === 'spatial-trigger-tactician-ally-heroic',
    );
    expect(raiseOA).toBeUndefined();
  });

  it('emits Troubadour drama gain when third hero acts this turn', () => {
    const troubadour = makeHeroParticipant('pc:trou', { className: 'Troubadour' });
    const heroA = makeHeroParticipant('pc:heroA', { className: 'Fury' });
    const heroB = makeHeroParticipant('pc:heroB', { className: 'Shadow' });
    const heroC = makeHeroParticipant('pc:heroC', { className: 'Tactician' });
    const state = baseState({
      participants: [troubadour, heroA, heroB, heroC],
      encounter: makeRunningEncounterPhase(ENCOUNTER_ID, {
        // Two heroes have already acted; this UseAbility will be the third.
        perEncounterFlags: {
          perTurn: { heroesActedThisTurn: [heroA.id, heroB.id] },
        },
      }),
    });

    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.UseAbility,
        actor: ownerActor,
        payload: {
          participantId: heroC.id,
          abilityId: 'mark',
          source: 'class',
          duration: { kind: 'EoT' },
        },
      }),
    );

    expect(result.errors).toBeUndefined();
    const dramaGain = result.derived.find(
      (d) =>
        d.type === IntentTypes.GainResource &&
        (d.payload as { name?: string }).name === 'drama' &&
        (d.payload as { participantId?: string }).participantId === troubadour.id,
    );
    expect(dramaGain).toBeDefined();
    expect((dramaGain?.payload as { amount?: number }).amount).toBe(2);
  });
});

// ── Slice 2b: ABILITY_TARGETING_EFFECTS derivation ──────────────────────────

function makeUseAbilityState(
  participants: ReturnType<typeof makeHeroParticipant>[],
) {
  return baseState({
    participants,
    encounter: makeRunningEncounterPhase(ENCOUNTER_ID),
  });
}

describe('applyUseAbility — ABILITY_TARGETING_EFFECTS derivation', () => {
  it('emits derived SetTargetingRelation { present:true } for Judgment with empty existing relation', () => {
    const state = makeUseAbilityState([
      makeHeroParticipant('censor-1', { className: 'censor', ownerId: 'u-aldric' }),
      makeMonsterParticipant('goblin-a'),
    ]);
    const res = applyUseAbility(state, stamped({
      id: 'i-1',
      actor: ownerActor,
      type: IntentTypes.UseAbility,
      payload: {
        participantId: 'censor-1',
        abilityId: 'censor-judgment-t1',
        source: 'class',
        duration: { kind: 'end_of_encounter' },
        targetIds: ['goblin-a'],
      },
    }));
    const setRel = res.derived.filter((d) => d.type === IntentTypes.SetTargetingRelation);
    expect(setRel).toHaveLength(1);
    expect(setRel[0]!.payload).toEqual({
      sourceId: 'censor-1',
      relationKind: 'judged',
      targetId: 'goblin-a',
      present: true,
    });
  });

  it('first emits present:false for existing entries, then present:true for new target (replace mode)', () => {
    const state = makeUseAbilityState([
      makeHeroParticipant('censor-1', {
        className: 'censor',
        ownerId: 'u-aldric',
        targetingRelations: { judged: ['goblin-a', 'goblin-c'], marked: [], nullField: [] },
      }),
      makeMonsterParticipant('goblin-a'),
      makeMonsterParticipant('goblin-b'),
      makeMonsterParticipant('goblin-c'),
    ]);
    const res = applyUseAbility(state, stamped({
      id: 'i-1',
      actor: ownerActor,
      type: IntentTypes.UseAbility,
      payload: {
        participantId: 'censor-1',
        abilityId: 'censor-judgment-t1',
        source: 'class',
        duration: { kind: 'end_of_encounter' },
        targetIds: ['goblin-b'],
      },
    }));
    const setRel = res.derived.filter((d) => d.type === IntentTypes.SetTargetingRelation);
    expect(setRel).toHaveLength(3);
    expect(setRel[0]!.payload).toMatchObject({ targetId: 'goblin-a', present: false });
    expect(setRel[1]!.payload).toMatchObject({ targetId: 'goblin-c', present: false });
    expect(setRel[2]!.payload).toMatchObject({ targetId: 'goblin-b', present: true });
  });

  it('does NOT emit SetTargetingRelation for unregistered ability ids', () => {
    const state = makeUseAbilityState([
      makeHeroParticipant('censor-1', { className: 'censor', ownerId: 'u-aldric' }),
      makeMonsterParticipant('goblin-a'),
    ]);
    const res = applyUseAbility(state, stamped({
      id: 'i-1',
      actor: ownerActor,
      type: IntentTypes.UseAbility,
      payload: {
        participantId: 'censor-1',
        abilityId: 'some-other-ability',
        source: 'class',
        duration: { kind: 'EoT' },
        targetIds: ['goblin-a'],
      },
    }));
    const setRel = res.derived.filter((d) => d.type === IntentTypes.SetTargetingRelation);
    expect(setRel).toHaveLength(0);
  });

  it('does NOT emit SetTargetingRelation when targetIds is empty', () => {
    const state = makeUseAbilityState([
      makeHeroParticipant('censor-1', { className: 'censor', ownerId: 'u-aldric' }),
    ]);
    const res = applyUseAbility(state, stamped({
      id: 'i-1',
      actor: ownerActor,
      type: IntentTypes.UseAbility,
      payload: {
        participantId: 'censor-1',
        abilityId: 'censor-judgment-t1',
        source: 'class',
        duration: { kind: 'end_of_encounter' },
        targetIds: [],
      },
    }));
    const setRel = res.derived.filter((d) => d.type === IntentTypes.SetTargetingRelation);
    expect(setRel).toHaveLength(0);
  });

  it('emits Mark replace path for tactician-mark-t1', () => {
    const state = makeUseAbilityState([
      makeHeroParticipant('tactician-1', {
        className: 'tactician',
        ownerId: 'u-korva',
        targetingRelations: { judged: [], marked: ['goblin-a'], nullField: [] },
      }),
      makeMonsterParticipant('goblin-a'),
      makeMonsterParticipant('goblin-b'),
    ]);
    const res = applyUseAbility(state, stamped({
      id: 'i-1',
      actor: ownerActor,
      type: IntentTypes.UseAbility,
      payload: {
        participantId: 'tactician-1',
        abilityId: 'tactician-mark-t1',
        source: 'class',
        duration: { kind: 'end_of_encounter' },
        targetIds: ['goblin-b'],
      },
    }));
    const setRel = res.derived.filter((d) => d.type === IntentTypes.SetTargetingRelation);
    expect(setRel).toHaveLength(2);
    expect(setRel[0]!.payload).toMatchObject({
      relationKind: 'marked',
      targetId: 'goblin-a',
      present: false,
    });
    expect(setRel[1]!.payload).toMatchObject({
      relationKind: 'marked',
      targetId: 'goblin-b',
      present: true,
    });
  });
});
