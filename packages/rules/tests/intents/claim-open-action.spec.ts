import { describe, expect, it } from 'vitest';
import { applyClaimOpenAction } from '../../src/intents/claim-open-action';
import {
  baseState,
  makeHeroParticipant,
  makeRunningEncounterPhase,
  stamped,
} from './test-utils';

function stateWithOA(opts: { participantId: string; ownerId: string }) {
  const pc = makeHeroParticipant(opts.participantId, { ownerId: opts.ownerId });
  const pcOther = makeHeroParticipant('pc-other', { ownerId: 'other-user' });
  const s = baseState({
    currentSessionId: 'sess-1',
    participants: [pc, pcOther],
    encounter: makeRunningEncounterPhase('enc-1'),
  });
  s.openActions = [
    {
      id: 'oa-1',
      kind: '__sentinel_2b_0__',
      participantId: opts.participantId,
      raisedAtRound: 1,
      raisedByIntentId: 'i-prev',
      expiresAtRound: null,
      payload: {},
    },
  ];
  return s;
}

describe('applyClaimOpenAction', () => {
  it('owner of the targeted PC can claim — OA removed', () => {
    const s = stateWithOA({ participantId: 'pc-1', ownerId: 'alice' });
    const intent = stamped({
      actor: { userId: 'alice', role: 'player' },
      type: 'ClaimOpenAction',
      payload: { openActionId: 'oa-1' },
    });
    const result = applyClaimOpenAction(s, intent);
    expect(result.errors ?? []).toEqual([]);
    expect(result.state.openActions).toHaveLength(0);
  });

  it('active director can claim on behalf of a player', () => {
    const s = stateWithOA({ participantId: 'pc-1', ownerId: 'alice' });
    s.activeDirectorId = 'gm';
    const intent = stamped({
      actor: { userId: 'gm', role: 'director' },
      type: 'ClaimOpenAction',
      payload: { openActionId: 'oa-1' },
    });
    const result = applyClaimOpenAction(s, intent);
    expect(result.errors ?? []).toEqual([]);
    expect(result.state.openActions).toHaveLength(0);
  });

  it('rejects when actor is neither owner nor active director', () => {
    const s = stateWithOA({ participantId: 'pc-1', ownerId: 'alice' });
    const intent = stamped({
      actor: { userId: 'bob', role: 'player' },
      type: 'ClaimOpenAction',
      payload: { openActionId: 'oa-1' },
    });
    const result = applyClaimOpenAction(s, intent);
    expect(result.errors?.[0]?.code).toBe('not_authorized');
    expect(result.state.openActions).toHaveLength(1);
  });

  it('rejects an unknown openActionId', () => {
    const s = stateWithOA({ participantId: 'pc-1', ownerId: 'alice' });
    const intent = stamped({
      actor: { userId: 'alice', role: 'player' },
      type: 'ClaimOpenAction',
      payload: { openActionId: 'missing' },
    });
    const result = applyClaimOpenAction(s, intent);
    expect(result.errors?.[0]?.code).toBe('not_found');
  });

  it('rejects a malformed payload', () => {
    const s = stateWithOA({ participantId: 'pc-1', ownerId: 'alice' });
    const intent = stamped({
      actor: { userId: 'alice', role: 'player' },
      type: 'ClaimOpenAction',
      payload: { openActionId: '' },
    });
    const result = applyClaimOpenAction(s, intent);
    expect(result.errors?.[0]?.code).toBe('invalid_payload');
  });
});
