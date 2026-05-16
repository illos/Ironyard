import {
  defaultPerEncounterFlags,
  defaultPsionFlags,
  defaultTargetingRelations,
} from '@ironyard/shared';
import type { Intent, Participant } from '@ironyard/shared';
import { HEROIC_RESOURCE_NAMES } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import {
  HEROIC_RESOURCES,
  getResourceConfigForParticipant,
  resolveFloor,
} from '../src/heroic-resources';
import {
  type CampaignState,
  type StampedIntent,
  applyIntent,
  emptyCampaignState,
} from '../src/index';
import { isParticipant } from '../src/types';

const T = 1_700_000_000_000;
const campaignId = 'sess_heroic_int';

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

function pcWithResource(opts: {
  id: string;
  resourceName: (typeof HEROIC_RESOURCE_NAMES)[number];
  startValue: number;
  floor?: number;
  victories?: number;
  level?: number;
  className?: string | null;
}): Participant {
  return {
    id: opts.id,
    name: opts.id,
    kind: 'pc',
    level: opts.level ?? 1,
    currentStamina: 30,
    maxStamina: 30,
    characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
    immunities: [],
    weaknesses: [],
    conditions: [],
    heroicResources: [{ name: opts.resourceName, value: opts.startValue, floor: opts.floor ?? 0 }],
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
    surprised: false,
    role: null,
    ancestry: [],
    size: null,
    speed: null,
    stability: null,
    freeStrike: null,
    ev: null,
    withCaptain: null,
    className: opts.className ?? null,
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
    movementMode: null,
    bloodfireActive: false,
    conditionImmunities: [],
    disengageBonus: 0,
    meleeDistanceBonus: 0,
    rangedDistanceBonus: 0,
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
    expect(resolveFloor({ formula: 'negative_one_plus_reason' }, { reason: 2 })).toBe(-3);
  });

  it('returns -1 when reason is 0', () => {
    expect(resolveFloor({ formula: 'negative_one_plus_reason' }, { reason: 0 })).toBe(-1);
  });
});

describe('getResourceConfigForParticipant — slice 2a additions', () => {
  function emptyState(participants: Participant[]): CampaignState {
    return {
      ...emptyCampaignState(campaignId, 'user-owner'),
      participants,
    };
  }

  it('Talent at level 10 returns d3-plus variant with bonus 2', () => {
    const talent = pcWithResource({
      id: 'psion',
      resourceName: 'clarity',
      startValue: 0,
      floor: -1,
      level: 10,
      className: 'Talent',
    });
    const config = getResourceConfigForParticipant(emptyState([talent]), talent);
    expect(config).not.toBeNull();
    expect(config?.baseGain.onTurnStart.kind).toBe('d3-plus');
    if (config?.baseGain.onTurnStart.kind === 'd3-plus') {
      expect(config.baseGain.onTurnStart.bonus).toBe(2);
    }
    // floor still resolves from the base config — slice-2a only mutates baseGain
    expect(config?.floor).toEqual({ formula: 'negative_one_plus_reason' });
  });

  it('Talent below 10th level returns the plain d3 variant', () => {
    const talent = pcWithResource({
      id: 'apprentice',
      resourceName: 'clarity',
      startValue: 0,
      floor: -1,
      level: 9,
      className: 'Talent',
    });
    const config = getResourceConfigForParticipant(emptyState([talent]), talent);
    expect(config?.baseGain.onTurnStart).toEqual({ kind: 'd3' });
  });

  it('non-Talent classes are unaffected by the Psion-specific d3→d3-plus(+2) override', () => {
    // Regression for the Psion-leak path. Non-Talent classes at L10 receive
    // their OWN level features (see 2b.13 tests below) but NOT the Psion
    // +2 bonus that's specific to the Talent Psion 10th-level feature.
    const fury = pcWithResource({
      id: 'fury',
      resourceName: 'ferocity',
      startValue: 0,
      level: 10,
      className: 'Fury',
    });
    const state = emptyState([fury]);
    // Fury has no per-turn level scaling — plain d3 at every level.
    expect(getResourceConfigForParticipant(state, fury)?.baseGain.onTurnStart).toEqual({
      kind: 'd3',
    });
  });

  it('returns null for a participant with no heroic resource pool', () => {
    const talent = pcWithResource({
      id: 'novice',
      resourceName: 'clarity',
      startValue: 0,
      floor: -1,
      level: 10,
      className: 'Talent',
    });
    const noResourcePc: Participant = { ...talent, heroicResources: [] };
    const config = getResourceConfigForParticipant(emptyState([noResourcePc]), noResourcePc);
    expect(config).toBeNull();
  });
});

// Phase 2b cleanup 2b.13 — per-turn heroic-resource level scaling. Each named
// class level feature ramps the per-turn gain by +1. Sources verified against
// .reference/data-md/Rules/Classes/{Censor,Conduit,Elementalist,Tactician}.md
// and recorded in docs/superpowers/notes/2026-05-16-phase-2b-shipped-code-audit.md
// cluster 3 (bugs B9-B12 + Tactician noticed-while-verifying).
describe('getResourceConfigForParticipant — Phase 2b 2b.13 level-scaling', () => {
  function emptyState(participants: Participant[]): CampaignState {
    return {
      ...emptyCampaignState(campaignId, 'user-owner'),
      participants,
    };
  }

  describe('Censor wrath per-turn (Focused Wrath L7, Wrath of the Gods L10)', () => {
    it('L1-L6 censor gets +2 wrath per turn (baseline)', () => {
      const censor = pcWithResource({
        id: 'censor',
        resourceName: 'wrath',
        startValue: 0,
        level: 6,
        className: 'Censor',
      });
      expect(
        getResourceConfigForParticipant(emptyState([censor]), censor)?.baseGain.onTurnStart,
      ).toEqual({ kind: 'flat', amount: 2 });
    });

    it('L7-L9 censor gets +3 wrath per turn (Focused Wrath)', () => {
      const censor = pcWithResource({
        id: 'censor',
        resourceName: 'wrath',
        startValue: 0,
        level: 7,
        className: 'Censor',
      });
      expect(
        getResourceConfigForParticipant(emptyState([censor]), censor)?.baseGain.onTurnStart,
      ).toEqual({ kind: 'flat', amount: 3 });
    });

    it('L10 censor gets +4 wrath per turn (Wrath of the Gods)', () => {
      const censor = pcWithResource({
        id: 'censor',
        resourceName: 'wrath',
        startValue: 0,
        level: 10,
        className: 'Censor',
      });
      expect(
        getResourceConfigForParticipant(emptyState([censor]), censor)?.baseGain.onTurnStart,
      ).toEqual({ kind: 'flat', amount: 4 });
    });
  });

  describe('Conduit piety per-turn (Faithful\'s Reward L7)', () => {
    it('L1-L6 conduit gets plain d3 per turn', () => {
      const conduit = pcWithResource({
        id: 'conduit',
        resourceName: 'piety',
        startValue: 0,
        level: 6,
        className: 'Conduit',
      });
      expect(
        getResourceConfigForParticipant(emptyState([conduit]), conduit)?.baseGain.onTurnStart,
      ).toEqual({ kind: 'd3' });
    });

    it('L7+ conduit gets d3+1 per turn (Faithful\'s Reward)', () => {
      const conduit = pcWithResource({
        id: 'conduit',
        resourceName: 'piety',
        startValue: 0,
        level: 7,
        className: 'Conduit',
      });
      expect(
        getResourceConfigForParticipant(emptyState([conduit]), conduit)?.baseGain.onTurnStart,
      ).toEqual({ kind: 'd3-plus', bonus: 1 });
    });
  });

  describe('Elementalist essence per-turn (Surging Essence L7)', () => {
    it('L1-L6 elementalist gets +2 essence per turn (baseline)', () => {
      const ele = pcWithResource({
        id: 'ele',
        resourceName: 'essence',
        startValue: 0,
        level: 6,
        className: 'Elementalist',
      });
      expect(
        getResourceConfigForParticipant(emptyState([ele]), ele)?.baseGain.onTurnStart,
      ).toEqual({ kind: 'flat', amount: 2 });
    });

    it('L7+ elementalist gets +3 essence per turn (Surging Essence)', () => {
      const ele = pcWithResource({
        id: 'ele',
        resourceName: 'essence',
        startValue: 0,
        level: 7,
        className: 'Elementalist',
      });
      expect(
        getResourceConfigForParticipant(emptyState([ele]), ele)?.baseGain.onTurnStart,
      ).toEqual({ kind: 'flat', amount: 3 });
    });
  });

  describe('Tactician focus per-turn (Heightened Focus L7, True Focus L10)', () => {
    it('L1-L6 tactician gets +2 focus per turn (baseline)', () => {
      const tac = pcWithResource({
        id: 'tac',
        resourceName: 'focus',
        startValue: 0,
        level: 6,
        className: 'Tactician',
      });
      expect(
        getResourceConfigForParticipant(emptyState([tac]), tac)?.baseGain.onTurnStart,
      ).toEqual({ kind: 'flat', amount: 2 });
    });

    it('L7-L9 tactician gets +3 focus per turn (Heightened Focus)', () => {
      const tac = pcWithResource({
        id: 'tac',
        resourceName: 'focus',
        startValue: 0,
        level: 7,
        className: 'Tactician',
      });
      expect(
        getResourceConfigForParticipant(emptyState([tac]), tac)?.baseGain.onTurnStart,
      ).toEqual({ kind: 'flat', amount: 3 });
    });

    it('L10 tactician gets +4 focus per turn (True Focus)', () => {
      const tac = pcWithResource({
        id: 'tac',
        resourceName: 'focus',
        startValue: 0,
        level: 10,
        className: 'Tactician',
      });
      expect(
        getResourceConfigForParticipant(emptyState([tac]), tac)?.baseGain.onTurnStart,
      ).toEqual({ kind: 'flat', amount: 4 });
    });
  });

  describe('Talent Psion d3-plus stacks with level bumps (none today; future-compat)', () => {
    it('L10 Psion Talent: d3-plus stays at bonus 2 (no Talent per-turn level bump in canon)', () => {
      const talent = pcWithResource({
        id: 'psion',
        resourceName: 'clarity',
        startValue: 0,
        floor: -1,
        level: 10,
        className: 'Talent',
      });
      expect(
        getResourceConfigForParticipant(emptyState([talent]), talent)?.baseGain.onTurnStart,
      ).toEqual({ kind: 'd3-plus', bonus: 2 });
    });
  });

  describe('Classes with no per-turn level scaling remain at baseline', () => {
    it('L10 Fury still gains plain d3 ferocity per turn', () => {
      const fury = pcWithResource({
        id: 'fury',
        resourceName: 'ferocity',
        startValue: 0,
        level: 10,
        className: 'Fury',
      });
      expect(
        getResourceConfigForParticipant(emptyState([fury]), fury)?.baseGain.onTurnStart,
      ).toEqual({ kind: 'd3' });
    });

    it('L10 Shadow still gains plain d3 insight per turn', () => {
      const shadow = pcWithResource({
        id: 'shadow',
        resourceName: 'insight',
        startValue: 0,
        level: 10,
        className: 'Shadow',
      });
      expect(
        getResourceConfigForParticipant(emptyState([shadow]), shadow)?.baseGain.onTurnStart,
      ).toEqual({ kind: 'd3' });
    });

    it('L10 Null still gains flat +2 discipline per turn', () => {
      const nul = pcWithResource({
        id: 'null',
        resourceName: 'discipline',
        startValue: 0,
        level: 10,
        className: 'Null',
      });
      expect(
        getResourceConfigForParticipant(emptyState([nul]), nul)?.baseGain.onTurnStart,
      ).toEqual({ kind: 'flat', amount: 2 });
    });

    it('L10 Troubadour still gains plain d3 drama per turn', () => {
      const trou = pcWithResource({
        id: 'trou',
        resourceName: 'drama',
        startValue: 0,
        level: 10,
        className: 'Troubadour',
      });
      expect(
        getResourceConfigForParticipant(emptyState([trou]), trou)?.baseGain.onTurnStart,
      ).toEqual({ kind: 'd3' });
    });
  });
});

describe('full encounter resource generation cycle (canon § 5 integration)', () => {
  it('5-class party: round-N malice ticks, per-turn gains, end-encounter zeroes everything', () => {
    // Materialize a 5-PC party mid-encounter (skipping StartEncounter — that
    // path is covered by start-encounter.spec.ts integration cases). Each PC
    // is preloaded as if encounter-start had already run with avg victories = 3.
    const pcs: Participant[] = [
      pcWithResource({ id: 'censor', resourceName: 'wrath', startValue: 3, victories: 3 }),
      pcWithResource({ id: 'conduit', resourceName: 'piety', startValue: 3, victories: 3 }),
      pcWithResource({ id: 'tactician', resourceName: 'focus', startValue: 3, victories: 3 }),
      pcWithResource({ id: 'fury', resourceName: 'ferocity', startValue: 3, victories: 3 }),
      pcWithResource({
        id: 'talent',
        resourceName: 'clarity',
        startValue: 3,
        victories: 3,
        floor: -1,
      }),
    ];

    let s: CampaignState = {
      ...emptyCampaignState(campaignId, 'user-owner'),
      participants: pcs,
      encounter: {
        id: 'enc_int',
        currentRound: 1, // round-1 already ticked at StartEncounter time
        activeParticipantId: null,
        turnState: {},
        malice: { current: 9, lastMaliciousStrikeRound: null }, // canon worked example post-round-1
        firstSide: null,
        currentPickingSide: null,
        actedThisRound: [],
        pendingTriggers: null,
        perEncounterFlags: { perTurn: { heroesActedThisTurn: [] } },
      },
    };

    // StartRound → round 2; malice += 5 alive + 2 = +7 → 16
    s = applyIntent(s, intent('StartRound', {})).state;
    expect(s.encounter?.currentRound).toBe(2);
    expect(s.encounter?.malice.current).toBe(16);

    // Per-turn gains for each PC. d3-classes pin to 2 for determinism.
    const turns: Array<{ id: string; rolls?: { d3: number } }> = [
      { id: 'censor' }, // flat +2
      { id: 'conduit', rolls: { d3: 2 } }, // +2
      { id: 'tactician' }, // flat +2
      { id: 'fury', rolls: { d3: 2 } }, // +2
      { id: 'talent', rolls: { d3: 2 } }, // +2
    ];
    for (const t of turns) {
      const payload = t.rolls ? { participantId: t.id, rolls: t.rolls } : { participantId: t.id };
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
