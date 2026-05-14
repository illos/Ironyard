import type { Intent, Participant } from '@ironyard/shared';
import { HEROIC_RESOURCE_NAMES } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import {
  type CampaignState,
  type StampedIntent,
  applyIntent,
  emptyCampaignState,
} from '../src/index';
import { HEROIC_RESOURCES, resolveFloor } from '../src/heroic-resources';
import { isParticipant } from '../src/types';

const T = 1_700_000_000_000;
const campaignId = 'sess_heroic_int';

function intent(
  type: string,
  payload: unknown,
  overrides: Partial<Intent> = {},
): StampedIntent {
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

function pcWithResource(opts: {
  id: string;
  resourceName: (typeof HEROIC_RESOURCE_NAMES)[number];
  startValue: number;
  floor?: number;
  victories?: number;
}): Participant {
  return {
    id: opts.id,
    name: opts.id,
    kind: 'pc',
    level: 1,
    currentStamina: 30,
    maxStamina: 30,
    characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
    immunities: [],
    weaknesses: [],
    conditions: [],
    heroicResources: [
      { name: opts.resourceName, value: opts.startValue, floor: opts.floor ?? 0 },
    ],
    extras: [],
    surges: 0,
    recoveries: { current: 0, max: 0 },
    recoveryValue: 0,
    ownerId: null,
    characterId: null,
    weaponDamageBonus: { melee: [0, 0, 0], ranged: [0, 0, 0] },
    activeAbilities: [],
    victories: opts.victories ?? 0,
    turnActionUsage: { main: false, maneuver: false, move: false },
  };
}

describe('HEROIC_RESOURCES table', () => {
  it('has an entry for every HeroicResourceName', () => {
    for (const name of HEROIC_RESOURCE_NAMES) {
      expect(HEROIC_RESOURCES[name]).toBeDefined();
      expect(HEROIC_RESOURCES[name].name).toBe(name);
    }
  });

  it('Censor (wrath) gains +2 flat per turn', () => {
    expect(HEROIC_RESOURCES.wrath.baseGain.onTurnStart).toEqual({ kind: 'flat', amount: 2 });
  });

  it('Conduit (piety) rolls 1d3 per turn', () => {
    expect(HEROIC_RESOURCES.piety.baseGain.onTurnStart).toEqual({ kind: 'd3' });
  });

  it('Talent (clarity) has a negative-floor formula', () => {
    expect(HEROIC_RESOURCES.clarity.floor).toEqual({ formula: 'negative_one_plus_reason' });
  });

  it('all other resources floor at 0', () => {
    for (const name of HEROIC_RESOURCE_NAMES) {
      if (name === 'clarity') continue;
      expect(HEROIC_RESOURCES[name].floor).toBe(0);
    }
  });

  it('every resource preloads from victories on encounter start', () => {
    for (const name of HEROIC_RESOURCE_NAMES) {
      expect(HEROIC_RESOURCES[name].baseGain.onEncounterStart).toBe('victories');
    }
  });
});

describe('resolveFloor', () => {
  it('returns 0 for a numeric floor', () => {
    expect(resolveFloor(0, { reason: 2 })).toBe(0);
  });

  it('returns -(1 + reason) for the clarity formula', () => {
    expect(
      resolveFloor(
        { formula: 'negative_one_plus_reason' },
        { reason: 2 },
      ),
    ).toBe(-3);
  });

  it('returns -1 when reason is 0', () => {
    expect(
      resolveFloor(
        { formula: 'negative_one_plus_reason' },
        { reason: 0 },
      ),
    ).toBe(-1);
  });
});

describe('full encounter resource generation cycle (canon § 5 integration)', () => {
  it('5-class party: round-N malice ticks, per-turn gains, end-encounter zeroes everything', () => {
    // Materialize a 5-PC party mid-encounter (skipping StartEncounter — that
    // path is covered by start-encounter.spec.ts integration cases). Each PC
    // is preloaded as if encounter-start had already run with avg victories = 3.
    const pcs: Participant[] = [
      pcWithResource({ id: 'censor',    resourceName: 'wrath',    startValue: 3, victories: 3 }),
      pcWithResource({ id: 'conduit',   resourceName: 'piety',    startValue: 3, victories: 3 }),
      pcWithResource({ id: 'tactician', resourceName: 'focus',    startValue: 3, victories: 3 }),
      pcWithResource({ id: 'fury',      resourceName: 'ferocity', startValue: 3, victories: 3 }),
      pcWithResource({ id: 'talent',    resourceName: 'clarity',  startValue: 3, victories: 3, floor: -1 }),
    ];

    let s: CampaignState = {
      ...emptyCampaignState(campaignId, 'user-owner'),
      participants: pcs,
      encounter: {
        id: 'enc_int',
        currentRound: 1, // round-1 already ticked at StartEncounter time
        turnOrder: pcs.map((p) => p.id),
        activeParticipantId: null,
        turnState: {},
        malice: { current: 9, lastMaliciousStrikeRound: null }, // canon worked example post-round-1
      },
    };

    // StartRound → round 2; malice += 5 alive + 2 = +7 → 16
    s = applyIntent(s, intent('StartRound', {})).state;
    expect(s.encounter?.currentRound).toBe(2);
    expect(s.encounter?.malice.current).toBe(16);

    // Per-turn gains for each PC. d3-classes pin to 2 for determinism.
    const turns: Array<{ id: string; rolls?: { d3: number } }> = [
      { id: 'censor' },                          // flat +2
      { id: 'conduit',   rolls: { d3: 2 } },     // +2
      { id: 'tactician' },                       // flat +2
      { id: 'fury',      rolls: { d3: 2 } },     // +2
      { id: 'talent',    rolls: { d3: 2 } },     // +2
    ];
    for (const t of turns) {
      const payload = t.rolls
        ? { participantId: t.id, rolls: t.rolls }
        : { participantId: t.id };
      s = applyIntent(s, intent('StartTurn', payload)).state;
      s = applyIntent(s, intent('EndTurn', {})).state;
    }

    // Each PC's resource pool: 3 (preload) + 2 (per-turn gain) = 5
    for (const t of turns) {
      const pc = s.participants.find((p) => isParticipant(p) && p.id === t.id);
      const value = pc && isParticipant(pc) ? pc.heroicResources[0]?.value : null;
      expect(value).toBe(5);
    }

    // EndRound → round-2 ends, but currentRound stays 2 (StartRound increments).
    s = applyIntent(s, intent('EndRound', {})).state;

    // StartRound → round 3; malice += 5 alive + 3 = +8 → 24
    s = applyIntent(s, intent('StartRound', {})).state;
    expect(s.encounter?.currentRound).toBe(3);
    expect(s.encounter?.malice.current).toBe(24);

    // EndEncounter zeros every PC's heroic resource value + surges; clears OAs.
    s = applyIntent(s, intent('EndEncounter', { encounterId: 'enc_int' })).state;
    expect(s.encounter).toBeNull();
    for (const t of turns) {
      const pc = s.participants.find((p) => isParticipant(p) && p.id === t.id);
      if (pc && isParticipant(pc)) {
        for (const r of pc.heroicResources) {
          expect(r.value).toBe(0);
        }
        expect(pc.surges).toBe(0);
      }
    }
    expect(s.openActions).toEqual([]);
  });
});
