import { describe, expect, it } from 'vitest';
import type { PendingTriggerSet } from '@ironyard/shared';
import type { CampaignState } from '../../src/types';
import { applyResolveTriggerOrder } from '../../src/intents/resolve-trigger-order';
import {
  OWNER_ID,
  baseState,
  makeHeroParticipant,
  makeMonsterParticipant,
  makeRunningEncounterPhase,
  stamped,
} from './test-utils';

const SET_ID = '01HW000000000000000000000A';
const HERO_ID = 'pc:hero-1';
const MONSTER_ID = 'm:monster-1';

const TRIGGER_EVENT: PendingTriggerSet['triggerEvent'] = {
  kind: 'damage-applied',
  targetId: HERO_ID,
  attackerId: null,
  amount: 5,
  type: 'fire',
};

const CANDIDATES: PendingTriggerSet['candidates'] = [
  { participantId: HERO_ID, triggeredActionId: 'action-a', side: 'heroes' },
  { participantId: MONSTER_ID, triggeredActionId: 'action-b', side: 'foes' },
];

function stateWithPendingTriggers(
  pendingTriggers: PendingTriggerSet | null = makePendingSet(),
): CampaignState {
  return baseState({
    currentSessionId: 'sess-1',
    participants: [
      makeHeroParticipant(HERO_ID, { ownerId: OWNER_ID }),
      makeMonsterParticipant(MONSTER_ID),
    ],
    encounter: makeRunningEncounterPhase('enc-1', { pendingTriggers }),
  });
}

function makePendingSet(overrides: Partial<PendingTriggerSet> = {}): PendingTriggerSet {
  return {
    id: SET_ID,
    triggerEvent: TRIGGER_EVENT,
    candidates: CANDIDATES,
    order: null,
    ...overrides,
  };
}

function resolveIntent(opts: {
  pendingTriggerSetId?: string;
  order?: string[];
  userId?: string;
} = {}) {
  return stamped({
    type: 'ResolveTriggerOrder',
    actor: { userId: opts.userId ?? OWNER_ID, role: 'director' },
    payload: {
      pendingTriggerSetId: opts.pendingTriggerSetId ?? SET_ID,
      order: opts.order ?? [HERO_ID, MONSTER_ID],
    },
  });
}

describe('applyResolveTriggerOrder', () => {
  it('rejects when pendingTriggers is null', () => {
    const s = stateWithPendingTriggers(null);
    const result = applyResolveTriggerOrder(s, resolveIntent());
    expect(result.errors?.[0]?.code).toBe('no_pending_triggers');
  });

  it('rejects when pendingTriggerSetId does not match', () => {
    const s = stateWithPendingTriggers();
    const result = applyResolveTriggerOrder(
      s,
      resolveIntent({ pendingTriggerSetId: 'wrong-id' }),
    );
    expect(result.errors?.[0]?.code).toBe('id_mismatch');
  });

  it('rejects when order is missing a candidate', () => {
    const s = stateWithPendingTriggers();
    // Only one of the two candidates
    const result = applyResolveTriggerOrder(s, resolveIntent({ order: [HERO_ID] }));
    expect(result.errors?.[0]?.code).toBe('order_mismatch');
  });

  it('rejects when order contains an extra id', () => {
    const s = stateWithPendingTriggers();
    const result = applyResolveTriggerOrder(
      s,
      resolveIntent({ order: [HERO_ID, MONSTER_ID, 'pc:extra'] }),
    );
    expect(result.errors?.[0]?.code).toBe('order_mismatch');
  });

  it('rejects when order has duplicates', () => {
    const s = stateWithPendingTriggers();
    // Two entries for HERO_ID, none for MONSTER_ID
    const result = applyResolveTriggerOrder(
      s,
      resolveIntent({ order: [HERO_ID, HERO_ID] }),
    );
    expect(result.errors?.[0]?.code).toBe('order_duplicates');
  });

  it('rejects when actor is not active director', () => {
    const s = stateWithPendingTriggers();
    const result = applyResolveTriggerOrder(
      s,
      resolveIntent({ userId: 'some-player-id' }),
    );
    expect(result.errors?.[0]?.code).toBe('not_authorized');
  });

  it('emits ExecuteTrigger derived intents in the chosen order', () => {
    const s = stateWithPendingTriggers();
    // Reverse order: monster fires first, hero second
    const result = applyResolveTriggerOrder(
      s,
      resolveIntent({ order: [MONSTER_ID, HERO_ID] }),
    );
    expect(result.errors ?? []).toEqual([]);
    expect(result.derived).toHaveLength(2);

    const first = result.derived[0]!;
    const second = result.derived[1]!;

    expect(first.type).toBe('ExecuteTrigger');
    expect((first.payload as { participantId: string }).participantId).toBe(MONSTER_ID);
    expect((first.payload as { triggeredActionId: string }).triggeredActionId).toBe('action-b');

    expect(second.type).toBe('ExecuteTrigger');
    expect((second.payload as { participantId: string }).participantId).toBe(HERO_ID);
    expect((second.payload as { triggeredActionId: string }).triggeredActionId).toBe('action-a');
  });

  it('clears pendingTriggers after the cascade', () => {
    const s = stateWithPendingTriggers();
    const result = applyResolveTriggerOrder(s, resolveIntent());
    expect(result.errors ?? []).toEqual([]);
    expect(result.state.encounter?.pendingTriggers).toBeNull();
  });
});
