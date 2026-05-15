import type { Intent, Participant } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import {
  type CampaignState,
  type StampedIntent,
  applyIntent,
  emptyCampaignState,
} from '../src/index';

const T = 1_700_000_000_000;
const campaignId = 'c1';

function intent(type: string, payload: unknown, overrides: Partial<Intent> = {}): StampedIntent {
  return {
    id: overrides.id ?? `i_${Math.random().toString(36).slice(2)}`,
    campaignId: overrides.campaignId ?? campaignId,
    actor: overrides.actor ?? { userId: 'alice', role: 'director' },
    timestamp: overrides.timestamp ?? T,
    source: overrides.source ?? 'manual',
    type,
    payload,
    causedBy: overrides.causedBy,
  };
}

function pc(id: string): Participant {
  return {
    id, name: id, kind: 'pc', level: 1, currentStamina: 30, maxStamina: 30,
    characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
    immunities: [], weaknesses: [], conditions: [], heroicResources: [],
    extras: [], surges: 0, recoveries: { current: 0, max: 0 }, recoveryValue: 0,
    ownerId: null, characterId: null,
    weaponDamageBonus: { melee: [0,0,0], ranged: [0,0,0] },
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

function monster(id: string): Participant {
  return { ...pc(id), kind: 'monster' };
}

function readyState(parts: Participant[]): CampaignState {
  const s = emptyCampaignState(campaignId, 'owner');
  return {
    ...s,
    participants: parts,
    encounter: {
      id: 'e1', currentRound: 1,
      firstSide: null, currentPickingSide: null, actedThisRound: [],
      activeParticipantId: null,
      turnState: {}, malice: { current: 0, lastMaliciousStrikeRound: null },
    },
  };
}

describe('RollInitiative', () => {
  it('stamps firstSide and currentPickingSide to the winner', () => {
    const s = readyState([pc('alice'), monster('goblin')]);
    const r = applyIntent(s, intent('RollInitiative', { winner: 'heroes', surprised: [], rolledD10: 7 }));
    expect(r.errors).toBeUndefined();
    expect(r.state.encounter?.firstSide).toBe('heroes');
    expect(r.state.encounter?.currentPickingSide).toBe('heroes');
    expect(r.state.encounter?.actedThisRound).toEqual([]);
  });

  it('stamps surprised flag on named participants', () => {
    const s = readyState([pc('alice'), monster('goblin'), monster('orc')]);
    const r = applyIntent(s, intent('RollInitiative', { winner: 'heroes', surprised: ['goblin'] }));
    expect(r.errors).toBeUndefined();
    const goblin = r.state.participants.find((p) => 'id' in p && p.id === 'goblin') as Participant;
    expect(goblin.surprised).toBe(true);
    const alice = r.state.participants.find((p) => 'id' in p && p.id === 'alice') as Participant;
    expect(alice.surprised).toBe(false);
  });

  it('rejects when no active encounter', () => {
    const s = emptyCampaignState(campaignId, 'owner');
    const r = applyIntent(s, intent('RollInitiative', { winner: 'heroes', surprised: [] }));
    expect(r.errors?.[0]?.code).toBe('no_active_encounter');
  });

  it('rejects a second roll (idempotent guard)', () => {
    let s = readyState([pc('alice'), monster('goblin')]);
    s = applyIntent(s, intent('RollInitiative', { winner: 'heroes', surprised: [] })).state;
    const r = applyIntent(s, intent('RollInitiative', { winner: 'foes', surprised: [] }));
    expect(r.errors?.[0]?.code).toBe('already_rolled');
  });

  it('rejects unknown participant ids in surprised[]', () => {
    const s = readyState([pc('alice')]);
    const r = applyIntent(s, intent('RollInitiative', { winner: 'heroes', surprised: ['ghost'] }));
    expect(r.errors?.[0]?.code).toBe('unknown_participant');
  });

  it('rejects when surprise auto-pick would override the chosen winner', () => {
    // All foes will be surprised; canon: heroes (un-surprised side) must win.
    const s = readyState([pc('alice'), monster('goblin'), monster('orc')]);
    const r = applyIntent(
      s,
      intent('RollInitiative', { winner: 'foes', surprised: ['goblin', 'orc'] }),
    );
    expect(r.errors?.[0]?.code).toBe('surprise_override_mismatch');
  });

  it('accepts when the chosen winner matches the surprise auto-pick', () => {
    const s = readyState([pc('alice'), monster('goblin'), monster('orc')]);
    const r = applyIntent(
      s,
      intent('RollInitiative', { winner: 'heroes', surprised: ['goblin', 'orc'] }),
    );
    expect(r.errors).toBeUndefined();
    expect(r.state.encounter?.firstSide).toBe('heroes');
  });
});
