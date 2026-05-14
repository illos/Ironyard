import type { Participant } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import {
  type CampaignState,
  type ReducerContext,
  type StampedIntent,
  applyIntent,
  emptyCampaignState,
  isParticipant,
} from '../src/index';
import { buildBundleWithFury, buildFuryL1Fixture } from './fixtures/character-runtime';

const T = 1_700_000_000_000;
const CAMPAIGN = 'sess_start_enc';

function makeIntent(payload: unknown): StampedIntent {
  return {
    id: `i_${Math.random().toString(36).slice(2)}`,
    campaignId: CAMPAIGN,
    actor: { userId: 'user-owner', role: 'director' },
    timestamp: T,
    source: 'manual',
    type: 'StartEncounter',
    payload,
    causedBy: undefined,
  };
}

function baseState(overrides: Partial<CampaignState> = {}): CampaignState {
  return { ...emptyCampaignState(CAMPAIGN, 'user-owner'), currentSessionId: 'sess-test', ...overrides };
}

describe('applyStartEncounter — new atomic payload shape', () => {
  it('materializes a PC from stampedPcs with ownerId and characterId', () => {
    const character = buildFuryL1Fixture();
    const ctx: ReducerContext = { staticData: buildBundleWithFury() };

    const result = applyIntent(
      baseState(),
      makeIntent({
        characterIds: ['c1'],
        monsters: [],
        stampedPcs: [{ characterId: 'c1', name: 'Hero', ownerId: 'user-1', character }],
        stampedMonsters: [],
      }),
      ctx,
    );

    expect(result.errors).toBeUndefined();
    expect(result.state.encounter).not.toBeNull();

    const pc = result.state.participants.find(
      (p): p is Participant => isParticipant(p) && p.kind === 'pc',
    );
    expect(pc).toBeDefined();
    expect(pc?.ownerId).toBe('user-1');
    expect(pc?.characterId).toBe('c1');
    expect(pc?.id).toBe('pc:c1');
  });

  it('applies persisted currentStamina from the character blob (clamped to max)', () => {
    const character = buildFuryL1Fixture({ currentStamina: 10 });
    const ctx: ReducerContext = { staticData: buildBundleWithFury() };

    const result = applyIntent(
      baseState(),
      makeIntent({
        characterIds: ['c1'],
        monsters: [],
        stampedPcs: [{ characterId: 'c1', name: 'Hero', ownerId: 'u1', character }],
        stampedMonsters: [],
      }),
      ctx,
    );

    const pc = result.state.participants.find(
      (p): p is Participant => isParticipant(p) && p.kind === 'pc',
    );
    expect(pc?.currentStamina).toBe(10);
  });

  it('uses derived maxStamina when character.currentStamina is null (fresh encounter)', () => {
    const character = buildFuryL1Fixture({ currentStamina: null });
    const ctx: ReducerContext = { staticData: buildBundleWithFury() };

    const result = applyIntent(
      baseState(),
      makeIntent({
        characterIds: ['c1'],
        monsters: [],
        stampedPcs: [{ characterId: 'c1', name: 'Hero', ownerId: 'u1', character }],
        stampedMonsters: [],
      }),
      ctx,
    );

    const pc = result.state.participants.find(
      (p): p is Participant => isParticipant(p) && p.kind === 'pc',
    );
    // buildBundleWithFury: startingStamina=21, staminaPerLevel=9, level=1 → maxStamina=21
    expect(pc?.currentStamina).toBe(21);
    expect(pc?.maxStamina).toBe(21);
  });

  it('applies recoveriesUsed to compute recoveries.current', () => {
    // 3 recoveries used out of 10 → 7 remaining
    const character = buildFuryL1Fixture({ recoveriesUsed: 3 });
    const ctx: ReducerContext = { staticData: buildBundleWithFury() };

    const result = applyIntent(
      baseState(),
      makeIntent({
        characterIds: ['c1'],
        monsters: [],
        stampedPcs: [{ characterId: 'c1', name: 'Hero', ownerId: 'u1', character }],
        stampedMonsters: [],
      }),
      ctx,
    );

    const pc = result.state.participants.find(
      (p): p is Participant => isParticipant(p) && p.kind === 'pc',
    );
    // buildBundleWithFury: recoveries = 10
    expect(pc?.recoveries.max).toBe(10);
    expect(pc?.recoveries.current).toBe(7);
  });

  it('materializes monsters from stampedMonsters (respects quantity)', () => {
    const monster = {
      id: 'goblin',
      name: 'Goblin',
      level: 1,
      roles: [],
      ancestry: [],
      ev: { ev: 2 },
      stamina: { base: 15 },
      speed: 5,
      movement: [],
      size: '1S',
      stability: 0,
      freeStrike: 2,
      characteristics: { might: 0, agility: 1, reason: -1, intuition: 0, presence: -1 },
      immunities: [],
      weaknesses: [],
      abilities: [],
    };

    const result = applyIntent(
      baseState(),
      makeIntent({
        characterIds: [],
        monsters: [{ monsterId: 'goblin', quantity: 3 }],
        stampedPcs: [],
        stampedMonsters: [{ monsterId: 'goblin', quantity: 3, monster }],
      }),
    );

    expect(result.errors).toBeUndefined();
    const monsters = result.state.participants.filter(
      (p): p is Participant => isParticipant(p) && p.kind === 'monster',
    );
    expect(monsters.map((m) => m.name)).toEqual(['Goblin 1', 'Goblin 2', 'Goblin 3']);
  });

  it('REPLACES the existing participant roster (no duplicate carry-over)', () => {
    const oldMonster: Participant = {
      id: 'old-monster-1',
      name: 'Old Orc',
      kind: 'monster',
      level: 3,
      currentStamina: 0,
      maxStamina: 40,
      characteristics: { might: 2, agility: 0, reason: -1, intuition: 0, presence: -1 },
      immunities: [],
      weaknesses: [],
      conditions: [],
      heroicResources: [],
      extras: [],
      surges: 0,
      recoveries: { current: 0, max: 0 },
      recoveryValue: 0,
      ownerId: null,
      characterId: null,
      weaponDamageBonus: { melee: [0, 0, 0], ranged: [0, 0, 0] },
      activeAbilities: [],
    };
    const s = baseState({ participants: [oldMonster] });

    const result = applyIntent(
      s,
      makeIntent({
        characterIds: [],
        monsters: [],
        stampedPcs: [],
        stampedMonsters: [],
      }),
    );

    expect(result.state.participants).toHaveLength(0);
  });

  it('rejects if an encounter is already active', () => {
    const s = baseState({
      encounter: {
        id: 'enc-1',
        currentRound: 1,
        turnOrder: [],
        activeParticipantId: null,
        turnState: {},
        malice: { current: 0, lastMaliciousStrikeRound: null },
      },
    });

    const result = applyIntent(
      s,
      makeIntent({ characterIds: [], monsters: [], stampedPcs: [], stampedMonsters: [] }),
    );

    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'encounter_already_active' })]),
    );
  });

  it('accepts an empty payload (no PCs, no monsters) — valid but empty encounter', () => {
    const result = applyIntent(
      baseState(),
      makeIntent({ characterIds: [], monsters: [], stampedPcs: [], stampedMonsters: [] }),
    );

    expect(result.errors).toBeUndefined();
    expect(result.state.encounter).not.toBeNull();
    expect(result.state.participants).toHaveLength(0);
  });

  it('rejects with no_active_session when currentSessionId is null', () => {
    const result = applyIntent(
      baseState({ currentSessionId: null }),
      makeIntent({ characterIds: [], monsters: [], stampedPcs: [], stampedMonsters: [] }),
    );
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'no_active_session' })]),
    );
  });
});
