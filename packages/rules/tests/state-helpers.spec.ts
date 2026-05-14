import type { Participant } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import { type CampaignState, emptyCampaignState, isParticipant, sumPartyVictories } from '../src/index';

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
    ...over,
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
