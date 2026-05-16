import { defaultPerEncounterFlags, defaultPsionFlags, defaultTargetingRelations } from '@ironyard/shared';
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
    actor: overrides.actor ?? { userId: 'director-user', role: 'director' },
    timestamp: overrides.timestamp ?? T,
    source: overrides.source ?? 'manual',
    type, payload,
    causedBy: overrides.causedBy,
  };
}

function pc(id: string): Participant {
  return {
    id, name: id, kind: 'pc', level: 1, currentStamina: 30, maxStamina: 30,
    characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
    immunities: [], weaknesses: [], conditions: [], heroicResources: [],
    extras: [], surges: 0, recoveries: { current: 0, max: 0 }, recoveryValue: 0,
    ownerId: id, characterId: null,
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
    perEncounterFlags: defaultPerEncounterFlags(),
    posthumousDramaEligible: false,
    psionFlags: defaultPsionFlags(),
    maintainedAbilities: [],
    purchasedTraits: [],
    equippedTitleIds: [],
    targetingRelations: defaultTargetingRelations(),
  };
}

function readyState(round: number | null = 1): CampaignState {
  const s = emptyCampaignState(campaignId, 'director-user');
  return {
    ...s,
    activeDirectorId: 'director-user',
    participants: [pc('alice')],
    encounter: {
      id: 'e1', currentRound: round,
      firstSide: null, currentPickingSide: null, actedThisRound: [],
      activeParticipantId: null,
      turnState: {}, malice: { current: 0, lastMaliciousStrikeRound: null },
      pendingTriggers: null,
      perEncounterFlags: { perTurn: { heroesActedThisTurn: [] } },
    },
  };
}

describe('MarkSurprised', () => {
  it('toggles surprised true on a participant when dispatched by the director', () => {
    const s = readyState();
    const r = applyIntent(s, intent('MarkSurprised', { participantId: 'alice', surprised: true }));
    expect(r.errors).toBeUndefined();
    const alice = r.state.participants[0] as Participant;
    expect(alice.surprised).toBe(true);
  });

  it('toggles surprised back to false', () => {
    let s = readyState();
    s = applyIntent(s, intent('MarkSurprised', { participantId: 'alice', surprised: true })).state;
    s = applyIntent(s, intent('MarkSurprised', { participantId: 'alice', surprised: false })).state;
    expect((s.participants[0] as Participant).surprised).toBe(false);
  });

  it('rejects from a non-director', () => {
    const s = readyState();
    const r = applyIntent(
      s,
      intent('MarkSurprised', { participantId: 'alice', surprised: true }, { actor: { userId: 'alice', role: 'player' } }),
    );
    expect(r.errors?.[0]?.code).toBe('not_permitted');
  });

  it('rejects after round 1', () => {
    const s = readyState(2);
    const r = applyIntent(s, intent('MarkSurprised', { participantId: 'alice', surprised: true }));
    expect(r.errors?.[0]?.code).toBe('surprise_window_closed');
  });

  it('rejects unknown participant', () => {
    const s = readyState();
    const r = applyIntent(s, intent('MarkSurprised', { participantId: 'ghost', surprised: true }));
    expect(r.errors?.[0]?.code).toBe('unknown_participant');
  });
});
