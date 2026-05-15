import type { Participant } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import { type CampaignState, emptyCampaignState, isParticipant, sumPartyVictories, aliveHeroes, averageVictoriesAlive } from '../src/index';
import { nextPickingSide, participantSide } from '../src/state-helpers';

const campaignId = 'test_campaign';
const ownerId = 'user_owner';

function pc(over: Partial<Participant> = {}): Participant {
  return {
    id: 'pc_alice',
    name: 'Alice',
    kind: 'pc',
    level: 1,
    currentStamina: 20,
    maxStamina: 30,
    characteristics: { might: 2, agility: 1, reason: 0, intuition: 0, presence: 0 },
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
    staminaState: 'healthy',
    staminaOverride: null,
    bodyIntact: true,
    triggeredActionUsedThisRound: false,
    purchasedTraits: [],
    equippedTitleIds: [],
    ...over,
  };
}

function monster(over: Partial<Participant> = {}): Participant {
  return {
    id: 'monster_goblin',
    name: 'Goblin',
    kind: 'monster',
    level: 1,
    currentStamina: 10,
    maxStamina: 10,
    characteristics: { might: 0, agility: 1, reason: 0, intuition: 0, presence: -1 },
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
    staminaState: 'healthy',
    staminaOverride: null,
    bodyIntact: true,
    triggeredActionUsedThisRound: false,
    purchasedTraits: [],
    equippedTitleIds: [],
    ...over,
  };
}

function stateWithPCs(victories: number[]): CampaignState {
  return {
    ...emptyCampaignState(campaignId, ownerId),
    participants: victories.map((v, i) =>
      pc({ id: `pc_${i}`, victories: v, maxStamina: 20, currentStamina: 20 })
    ),
  };
}

describe('sumPartyVictories', () => {
  it('returns 0 for an empty party', () => {
    const state = emptyCampaignState(campaignId, ownerId);
    expect(sumPartyVictories(state)).toBe(0);
  });

  it('sums per-PC victories', () => {
    const state: CampaignState = {
      ...emptyCampaignState(campaignId, ownerId),
      participants: [
        pc({ id: 'pc_alice', victories: 5 }),
        pc({ id: 'pc_bob', victories: 3 }),
        pc({ id: 'pc_carol', victories: 7 }),
      ],
    };
    expect(sumPartyVictories(state)).toBe(15);
  });

  it('ignores monsters', () => {
    const state: CampaignState = {
      ...emptyCampaignState(campaignId, ownerId),
      participants: [
        pc({ id: 'pc_alice', victories: 10 }),
        monster({ id: 'monster_goblin', victories: 5 }),
        pc({ id: 'pc_bob', victories: 8 }),
        monster({ id: 'monster_orc', victories: 3 }),
      ],
    };
    expect(sumPartyVictories(state)).toBe(18);
  });
});

describe('aliveHeroes', () => {
  it('returns PCs whose currentStamina > -windedValue', () => {
    const s = stateWithPCs([2, 2, 2]);
    // windedValue for a PC is maxStamina / 2 (floor). For maxStamina = 20,
    // windedValue = 10, so the boundary is currentStamina > -10.
    (s.participants[0] as Participant).currentStamina = 5;       // healthy
    (s.participants[1] as Participant).currentStamina = 0;       // dying but alive
    (s.participants[2] as Participant).currentStamina = -11;     // past -windedValue; dead-ish
    expect(aliveHeroes(s)).toHaveLength(2);
  });

  it('returns empty when no PCs', () => {
    expect(aliveHeroes(stateWithPCs([]))).toEqual([]);
  });
});

describe('averageVictoriesAlive', () => {
  it('floors the average across alive PCs', () => {
    const s = stateWithPCs([2, 3, 4]);  // avg 3
    expect(averageVictoriesAlive(s)).toBe(3);
  });

  it('floors fractional averages', () => {
    const s = stateWithPCs([1, 2, 4]);  // avg 7/3 = 2.33 → 2
    expect(averageVictoriesAlive(s)).toBe(2);
  });

  it('returns 0 when no alive PCs', () => {
    const s = stateWithPCs([]);
    expect(averageVictoriesAlive(s)).toBe(0);
  });

  it('excludes "dead" PCs from the average', () => {
    const s = stateWithPCs([5, 5, 1]);
    (s.participants[2] as Participant).currentStamina = -11;  // dead
    expect(averageVictoriesAlive(s)).toBe(5);  // (5+5)/2 = 5
  });
});

// ---------------------------------------------------------------------------
// Task 2b.11 — zipper-initiative helpers
// ---------------------------------------------------------------------------

function pcZ(id: string): Participant {
  return {
    id, name: id, kind: 'pc', level: 1, currentStamina: 30, maxStamina: 30,
    characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
    immunities: [], weaknesses: [], conditions: [], heroicResources: [],
    extras: [], surges: 0, recoveries: { current: 0, max: 0 }, recoveryValue: 0,
    ownerId: null, characterId: null,
    weaponDamageBonus: { melee: [0, 0, 0], ranged: [0, 0, 0] },
    activeAbilities: [], victories: 0,
    turnActionUsage: { main: false, maneuver: false, move: false },
    surprised: false,
    role: null, ancestry: [], size: null, speed: null, stability: null,
    freeStrike: null, ev: null, withCaptain: null, className: null,
    staminaState: 'healthy',
    staminaOverride: null,
    bodyIntact: true,
    triggeredActionUsedThisRound: false,
    purchasedTraits: [],
    equippedTitleIds: [],
  };
}

function monsterZ(id: string): Participant {
  return { ...pcZ(id), kind: 'monster' };
}

function stateWithZ(
  parts: Participant[],
  acted: string[],
  current: 'heroes' | 'foes' | null,
): CampaignState {
  const s = emptyCampaignState('c1', 'owner');
  return {
    ...s,
    participants: parts,
    encounter: {
      id: 'e1',
      currentRound: 1,
      firstSide: 'heroes' as const,
      currentPickingSide: current,
      actedThisRound: acted,
      activeParticipantId: null,
      turnState: {},
      malice: { current: 0, lastMaliciousStrikeRound: null },
      pendingTriggers: null,
    },
  };
}

describe('participantSide', () => {
  it('returns heroes for PCs and foes for monsters', () => {
    expect(participantSide(pcZ('alice'))).toBe('heroes');
    expect(participantSide(monsterZ('goblin'))).toBe('foes');
  });
});

describe('nextPickingSide', () => {
  it('flips to the other side when both sides have unacted creatures', () => {
    const s = stateWithZ([pcZ('alice'), monsterZ('goblin')], [], 'heroes');
    expect(nextPickingSide(s)).toBe('foes');
  });

  it('flips back to heroes when foes side just acted', () => {
    const s = stateWithZ([pcZ('alice'), monsterZ('goblin')], ['goblin'], 'foes');
    expect(nextPickingSide(s)).toBe('heroes');
  });

  it('stays on heroes when foes are exhausted (run-out rule)', () => {
    const s = stateWithZ([pcZ('alice'), pcZ('bob'), monsterZ('goblin')], ['goblin'], 'foes');
    expect(nextPickingSide(s)).toBe('heroes');
  });

  it('stays on foes when heroes are exhausted', () => {
    const s = stateWithZ([pcZ('alice'), monsterZ('goblin'), monsterZ('orc')], ['alice'], 'heroes');
    expect(nextPickingSide(s)).toBe('foes');
  });

  it('returns null when both sides are fully acted (round end)', () => {
    const s = stateWithZ([pcZ('alice'), monsterZ('goblin')], ['alice', 'goblin'], 'heroes');
    expect(nextPickingSide(s)).toBeNull();
  });

  it('returns null when there is no encounter', () => {
    const s = emptyCampaignState('c1', 'owner');
    expect(nextPickingSide(s)).toBeNull();
  });
});
