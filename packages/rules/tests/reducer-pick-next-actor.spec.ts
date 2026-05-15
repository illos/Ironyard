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
    type, payload,
    causedBy: overrides.causedBy,
  };
}

function pc(id: string, ownerId: string | null = id): Participant {
  return {
    id, name: id, kind: 'pc', level: 1, currentStamina: 30, maxStamina: 30,
    characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
    immunities: [], weaknesses: [], conditions: [], heroicResources: [],
    extras: [], surges: 0, recoveries: { current: 0, max: 0 }, recoveryValue: 0,
    ownerId, characterId: null,
    weaponDamageBonus: { melee: [0,0,0], ranged: [0,0,0] },
    activeAbilities: [], victories: 0,
    turnActionUsage: { main: false, maneuver: false, move: false },
    surprised: false,
    role: null, ancestry: [], size: null, speed: null, stability: null,
    freeStrike: null, ev: null, withCaptain: null, className: null,
  };
}

function monster(id: string): Participant {
  return { ...pc(id, null), kind: 'monster' };
}

function readyState(parts: Participant[], picking: 'heroes' | 'foes' = 'heroes'): CampaignState {
  const s = emptyCampaignState(campaignId, 'director-user');
  return {
    ...s,
    activeDirectorId: 'director-user',
    participants: parts,
    encounter: {
      id: 'e1', currentRound: 1,
      firstSide: picking, currentPickingSide: picking, actedThisRound: [],
      activeParticipantId: null,
      turnState: {}, malice: { current: 0, lastMaliciousStrikeRound: null },
    },
  };
}

describe('PickNextActor', () => {
  it('starts the picked PC turn when dispatched by their owner', () => {
    const s = readyState([pc('alice', 'alice-user'), monster('goblin')]);
    const r = applyIntent(
      s,
      intent('PickNextActor', { participantId: 'alice' }, { actor: { userId: 'alice-user', role: 'player' } }),
    );
    expect(r.errors).toBeUndefined();
    // actedThisRound stays empty — the picked participant joins it at EndTurn,
    // not at PickNextActor (canon: "acted" = finished turn).
    expect(r.state.encounter?.actedThisRound).toEqual([]);
    expect(r.state.encounter?.activeParticipantId).toBe('alice');
    // The derived StartTurn is emitted by the reducer; verify it exists.
    expect(r.derived.some((d) => d.type === 'StartTurn')).toBe(true);
  });

  it('allows director override to pick another hero', () => {
    const s = readyState([pc('alice', 'alice-user'), pc('bob', 'bob-user')]);
    const r = applyIntent(
      s,
      intent('PickNextActor', { participantId: 'bob' }, { actor: { userId: 'director-user', role: 'director' } }),
    );
    expect(r.errors).toBeUndefined();
    expect(r.state.encounter?.activeParticipantId).toBe('bob');
  });

  it('rejects a non-owner non-director pick', () => {
    const s = readyState([pc('alice', 'alice-user'), pc('bob', 'bob-user')]);
    const r = applyIntent(
      s,
      intent('PickNextActor', { participantId: 'bob' }, { actor: { userId: 'alice-user', role: 'player' } }),
    );
    expect(r.errors?.[0]?.code).toBe('not_permitted');
  });

  it('rejects when the picked side does not match currentPickingSide', () => {
    const s = readyState([pc('alice', 'alice-user'), monster('goblin')], 'heroes');
    const r = applyIntent(
      s,
      intent('PickNextActor', { participantId: 'goblin' }, { actor: { userId: 'director-user', role: 'director' } }),
    );
    expect(r.errors?.[0]?.code).toBe('wrong_side');
  });

  it('rejects when participant already acted', () => {
    let s = readyState([pc('alice', 'alice-user'), pc('bob', 'bob-user')]);
    s = applyIntent(
      s,
      intent('PickNextActor', { participantId: 'alice' }, { actor: { userId: 'alice-user', role: 'player' } }),
    ).state;
    // After alice acts, the turn is in progress; end it so the side flips correctly.
    s = applyIntent(s, intent('EndTurn', {})).state;
    s.encounter!.currentPickingSide = 'heroes'; // force back for the test
    const r = applyIntent(
      s,
      intent('PickNextActor', { participantId: 'alice' }, { actor: { userId: 'alice-user', role: 'player' } }),
    );
    expect(r.errors?.[0]?.code).toBe('already_acted');
  });

  it('rejects when no firstSide has been set', () => {
    const s = readyState([pc('alice', 'alice-user')]);
    s.encounter!.firstSide = null;
    const r = applyIntent(
      s,
      intent('PickNextActor', { participantId: 'alice' }, { actor: { userId: 'alice-user', role: 'player' } }),
    );
    expect(r.errors?.[0]?.code).toBe('initiative_not_rolled');
  });

  it('rejects when a turn is already in progress', () => {
    let s = readyState([pc('alice', 'alice-user'), pc('bob', 'bob-user')]);
    s = applyIntent(
      s,
      intent('PickNextActor', { participantId: 'alice' }, { actor: { userId: 'alice-user', role: 'player' } }),
    ).state;
    // alice's turn is now active. Try to pick bob before ending alice's turn.
    const r = applyIntent(
      s,
      intent('PickNextActor', { participantId: 'bob' }, { actor: { userId: 'bob-user', role: 'player' } }),
    );
    expect(r.errors?.[0]?.code).toBe('turn_in_progress');
  });
});
