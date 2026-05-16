import type { Participant, StaminaTransitionedPayload } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import { evaluateOnStaminaTransitioned } from '../../src/ancestry-triggers';
import {
  baseState,
  makeHeroParticipant,
  makeMonsterParticipant,
  makeRunningEncounterPhase,
  ownerActor,
} from '../intents/test-utils';

// Phase 2b Group A+B (slice 9) — Orc Relentless (signature trait).
// Canon (Orc.md): "Whenever a creature deals damage to you that leaves you
// dying, you can make a free strike against any creature."

function orcHero(overrides: Partial<Participant> = {}) {
  return makeHeroParticipant('pc-orc', {
    ownerId: 'u-orc',
    ancestry: ['orc'],
    ...overrides,
  });
}

function transition(
  participantId: string,
  to: StaminaTransitionedPayload['to'],
  cause: StaminaTransitionedPayload['cause'],
): StaminaTransitionedPayload {
  return {
    participantId,
    from: 'healthy',
    to,
    cause,
  };
}

describe('ancestry-triggers/relentless — Orc dying-via-damage raise', () => {
  it('raises orc-relentless-free-strike when an Orc PC transitions to dying via damage', () => {
    const orc = orcHero();
    const state = baseState({
      participants: [orc],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const derived = evaluateOnStaminaTransitioned(
      state,
      transition('pc-orc', 'dying', 'damage'),
      { actor: ownerActor },
    );
    expect(derived).toHaveLength(1);
    expect(derived[0]!.type).toBe('RaiseOpenAction');
    expect(derived[0]!.payload).toMatchObject({
      kind: 'orc-relentless-free-strike',
      participantId: 'pc-orc',
    });
  });

  it('does NOT raise when the cause is not damage (e.g. override-applied)', () => {
    const orc = orcHero();
    const state = baseState({
      participants: [orc],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const derived = evaluateOnStaminaTransitioned(
      state,
      transition('pc-orc', 'dying', 'override-applied'),
      { actor: ownerActor },
    );
    expect(derived).toEqual([]);
  });

  it('does NOT raise when transitioning to a state other than dying', () => {
    const orc = orcHero();
    const state = baseState({
      participants: [orc],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const derived = evaluateOnStaminaTransitioned(
      state,
      transition('pc-orc', 'winded', 'damage'),
      { actor: ownerActor },
    );
    expect(derived).toEqual([]);
  });

  it('does NOT raise for a non-Orc PC', () => {
    const human = makeHeroParticipant('pc-human', { ancestry: ['human'] });
    const state = baseState({
      participants: [human],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const derived = evaluateOnStaminaTransitioned(
      state,
      transition('pc-human', 'dying', 'damage'),
      { actor: ownerActor },
    );
    expect(derived).toEqual([]);
  });

  it('does NOT raise for a monster', () => {
    const monster = makeMonsterParticipant('mon-1');
    const state = baseState({
      participants: [monster],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const derived = evaluateOnStaminaTransitioned(
      state,
      transition('mon-1', 'dying', 'damage'),
      { actor: ownerActor },
    );
    expect(derived).toEqual([]);
  });
});
