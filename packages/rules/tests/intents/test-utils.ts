import type { Intent, Monster, Participant } from '@ironyard/shared';
import type { CampaignState, EncounterPhase, StampedIntent } from '../../src/types';
import { emptyCampaignState } from '../../src/types';

export const T = 1_700_000_000_000;
export const CAMPAIGN_ID = 'camp-test';
export const OWNER_ID = 'owner-1';

export const ownerActor: Intent['actor'] = { userId: OWNER_ID, role: 'director' };

export function stamped(
  partial: Pick<Intent, 'type' | 'actor' | 'payload'> & Partial<Intent>,
): StampedIntent {
  return {
    id: partial.id ?? `i_${Math.random().toString(36).slice(2)}`,
    campaignId: partial.campaignId ?? CAMPAIGN_ID,
    actor: partial.actor,
    timestamp: partial.timestamp ?? T,
    source: partial.source ?? 'manual',
    type: partial.type,
    payload: partial.payload,
    causedBy: partial.causedBy,
  };
}

export function baseState(overrides: Partial<CampaignState> = {}): CampaignState {
  return {
    ...emptyCampaignState(CAMPAIGN_ID, OWNER_ID),
    ...overrides,
  };
}

export function makeHeroParticipant(id: string, overrides: Partial<Participant> = {}): Participant {
  return {
    id,
    name: `Hero ${id}`,
    kind: 'pc',
    level: 1,
    currentStamina: 30,
    maxStamina: 30,
    characteristics: { might: 2, agility: 1, reason: 0, intuition: 0, presence: 0 },
    immunities: [],
    weaknesses: [],
    conditions: [],
    heroicResources: [],
    extras: [],
    surges: 0,
    recoveries: { current: 3, max: 3 },
    recoveryValue: 10,
    ...overrides,
  };
}

export function makeMonsterParticipant(
  id: string,
  overrides: Partial<Participant> = {},
): Participant {
  return {
    id,
    name: `Monster ${id}`,
    kind: 'monster',
    level: 1,
    currentStamina: 20,
    maxStamina: 20,
    characteristics: { might: 0, agility: 1, reason: -1, intuition: 0, presence: -1 },
    immunities: [],
    weaknesses: [],
    conditions: [],
    heroicResources: [],
    extras: [],
    surges: 0,
    recoveries: { current: 0, max: 0 },
    recoveryValue: 0,
    ...overrides,
  };
}

export function makeMonsterFixture(overrides: Partial<Monster> = {}): Monster {
  return {
    id: overrides.id ?? 'goblin-warrior-1',
    name: overrides.name ?? 'Goblin Warrior',
    level: overrides.level ?? 1,
    roles: [],
    ancestry: [],
    ev: { ev: 12 },
    stamina: { base: 20 },
    immunities: [],
    weaknesses: [],
    speed: 5,
    movement: ['walk'],
    size: '1M',
    stability: 0,
    freeStrike: 2,
    characteristics: { might: 0, agility: 1, reason: -1, intuition: 0, presence: -1 },
    abilities: [],
    ...overrides,
  };
}

export function makeRunningEncounterPhase(
  id: string,
  overrides: Partial<EncounterPhase> = {},
): EncounterPhase {
  return {
    id,
    currentRound: 1,
    turnOrder: [],
    activeParticipantId: null,
    turnState: {},
    malice: { current: 0, lastMaliciousStrikeRound: null },
    ...overrides,
  };
}
