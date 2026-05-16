import { describe, it, expect } from 'vitest';
import { IntentTypes } from '@ironyard/shared';
import { applySetTargetingRelation } from '../../src/intents/set-targeting-relation';
import type { CampaignState, StampedIntent } from '../../src/types';

function fixtureState(overrides?: Partial<CampaignState>): CampaignState {
  return {
    campaignId: 'c1',
    seq: 0,
    sessionId: null,
    activeDirectorId: 'dir-1',
    participants: [
      {
        id: 'censor-1',
        name: 'Aldric',
        kind: 'pc',
        ownerId: 'user-aldric',
        characterId: 'char-aldric',
        level: 1,
        currentStamina: 20,
        maxStamina: 20,
        characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
        immunities: [],
        weaknesses: [],
        conditions: [],
        heroicResources: [],
        extras: [],
        surges: 0,
        recoveries: { current: 0, max: 0 },
        recoveryValue: 0,
        weaponDamageBonus: { melee: [0, 0, 0], ranged: [0, 0, 0] },
        activeAbilities: [],
        victories: 0,
        turnActionUsage: { main: false, maneuver: false, move: false },
        surprised: false,
        role: null,
        ancestry: [],
        size: null,
        speed: null,
        stability: null,
        freeStrike: null,
        ev: null,
        withCaptain: null,
        className: 'censor',
        purchasedTraits: [],
        equippedTitleIds: [],
        staminaState: 'healthy',
        staminaOverride: null,
        bodyIntact: true,
        triggeredActionUsedThisRound: false,
        perEncounterFlags: { perTurn: { entries: [], heroesActedThisTurn: [] }, perRound: {}, perEncounter: {} } as any,
        posthumousDramaEligible: false,
        psionFlags: { clarityDamageOptOutThisTurn: false },
        maintainedAbilities: [],
        targetingRelations: { judged: [], marked: [], nullField: [] },
      },
      {
        id: 'goblin-a',
        name: 'Goblin A',
        kind: 'monster',
        ownerId: null,
        characterId: null,
        level: 1,
        currentStamina: 10,
        maxStamina: 10,
        characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
        immunities: [],
        weaknesses: [],
        conditions: [],
        heroicResources: [],
        extras: [],
        surges: 0,
        recoveries: { current: 0, max: 0 },
        recoveryValue: 0,
        weaponDamageBonus: { melee: [0, 0, 0], ranged: [0, 0, 0] },
        activeAbilities: [],
        victories: 0,
        turnActionUsage: { main: false, maneuver: false, move: false },
        surprised: false,
        role: null,
        ancestry: [],
        size: null,
        speed: null,
        stability: null,
        freeStrike: null,
        ev: null,
        withCaptain: null,
        className: null,
        purchasedTraits: [],
        equippedTitleIds: [],
        staminaState: 'healthy',
        staminaOverride: null,
        bodyIntact: true,
        triggeredActionUsedThisRound: false,
        perEncounterFlags: { perTurn: { entries: [], heroesActedThisTurn: [] }, perRound: {}, perEncounter: {} } as any,
        posthumousDramaEligible: false,
        psionFlags: { clarityDamageOptOutThisTurn: false },
        maintainedAbilities: [],
        targetingRelations: { judged: [], marked: [], nullField: [] },
      },
    ],
    encounter: null,
    openActions: [],
    party: { victories: 0, heroTokens: 0 },
    log: [],
    ...overrides,
  } as unknown as CampaignState;
}

function intent(payload: any, actor: { userId: string; role: 'player' | 'director' } = { userId: 'user-aldric', role: 'player' }): StampedIntent {
  return {
    id: 'i-1',
    campaignId: 'c1',
    actor,
    source: 'manual',
    type: IntentTypes.SetTargetingRelation,
    payload,
    timestamp: 0,
  };
}

describe('applySetTargetingRelation', () => {
  it('adds a target id when present=true', () => {
    const state = fixtureState();
    const res = applySetTargetingRelation(
      state,
      intent({ sourceId: 'censor-1', relationKind: 'judged', targetId: 'goblin-a', present: true }),
    );
    const updated = res.state.participants.find((p: any) => p.id === 'censor-1') as any;
    expect(updated.targetingRelations.judged).toEqual(['goblin-a']);
  });
  it('is idempotent on add when target already present', () => {
    const state = fixtureState();
    (state.participants[0] as any).targetingRelations.judged = ['goblin-a'];
    const res = applySetTargetingRelation(
      state,
      intent({ sourceId: 'censor-1', relationKind: 'judged', targetId: 'goblin-a', present: true }),
    );
    const updated = res.state.participants.find((p: any) => p.id === 'censor-1') as any;
    expect(updated.targetingRelations.judged).toEqual(['goblin-a']);
  });
  it('removes a target id when present=false', () => {
    const state = fixtureState();
    (state.participants[0] as any).targetingRelations.marked = ['goblin-a'];
    const res = applySetTargetingRelation(
      state,
      intent({ sourceId: 'censor-1', relationKind: 'marked', targetId: 'goblin-a', present: false }),
    );
    const updated = res.state.participants.find((p: any) => p.id === 'censor-1') as any;
    expect(updated.targetingRelations.marked).toEqual([]);
  });
  it('is idempotent on remove when target absent', () => {
    const state = fixtureState();
    const res = applySetTargetingRelation(
      state,
      intent({ sourceId: 'censor-1', relationKind: 'judged', targetId: 'goblin-a', present: false }),
    );
    expect(res.errors).toBeUndefined();
    const updated = res.state.participants.find((p: any) => p.id === 'censor-1') as any;
    expect(updated.targetingRelations.judged).toEqual([]);
  });
  it('rejects self-targeting', () => {
    const state = fixtureState();
    const res = applySetTargetingRelation(
      state,
      intent({ sourceId: 'censor-1', relationKind: 'judged', targetId: 'censor-1', present: true }),
    );
    expect(res.errors).toBeDefined();
    expect(res.errors?.[0]?.code).toBe('self_targeting');
  });
  it('rejects unknown sourceId', () => {
    const state = fixtureState();
    const res = applySetTargetingRelation(
      state,
      intent({ sourceId: 'no-such', relationKind: 'judged', targetId: 'goblin-a', present: true }),
    );
    expect(res.errors).toBeDefined();
    expect(res.errors?.[0]?.code).toBe('source_missing');
  });
  it('rejects unknown targetId', () => {
    const state = fixtureState();
    const res = applySetTargetingRelation(
      state,
      intent({ sourceId: 'censor-1', relationKind: 'judged', targetId: 'no-such', present: true }),
    );
    expect(res.errors).toBeDefined();
    expect(res.errors?.[0]?.code).toBe('target_missing');
  });
  it('rejects non-owner non-director player', () => {
    const state = fixtureState();
    const res = applySetTargetingRelation(
      state,
      intent(
        { sourceId: 'censor-1', relationKind: 'judged', targetId: 'goblin-a', present: true },
        { userId: 'someone-else', role: 'player' },
      ),
    );
    expect(res.errors).toBeDefined();
    expect(res.errors?.[0]?.code).toBe('not_authorized');
  });
  it('accepts active director', () => {
    const state = fixtureState();
    const res = applySetTargetingRelation(
      state,
      intent(
        { sourceId: 'censor-1', relationKind: 'nullField', targetId: 'goblin-a', present: true },
        { userId: 'dir-1', role: 'director' },
      ),
    );
    expect(res.errors).toBeUndefined();
    const updated = res.state.participants.find((p: any) => p.id === 'censor-1') as any;
    expect(updated.targetingRelations.nullField).toEqual(['goblin-a']);
  });
});
