import type { Intent, Participant } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import {
  type CampaignState,
  type StampedIntent,
  applyIntent,
  emptyCampaignState,
  isParticipant,
} from '../src/index';
import { resetParticipantForEndOfEncounter } from '../src/intents/end-encounter';

// Phase 1 cleanup: EndEncounter intent — closes out the active encounter and
// resets every per-encounter pool (heroicResources, extras, surges, malice).
// Recoveries do NOT reset (canon §2.13 — respite-only). Conditions with
// `duration.kind === 'end_of_encounter'` are filtered from every participant.

const T = 1_700_000_000_000;
const campaignId = 'sess_test';

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

function pc(over: Partial<Participant> = {}): Participant {
  return {
    id: 'pc_alice',
    name: 'Alice',
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
    ...over,
  };
}

function monster(over: Partial<Participant> = {}): Participant {
  return {
    id: 'm_goblin',
    name: 'Goblin',
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
    ...over,
  };
}

// Helper: start an encounter and return state (participants empty by default).
// Directly constructs the encounter phase rather than calling StartEncounter,
// because StartEncounter now atomically replaces the roster from stampedPcs.
function withEncounter(): CampaignState {
  const s = emptyCampaignState(campaignId, 'user-owner');
  return {
    ...s,
    encounter: {
      id: 'enc_test',
      currentRound: 1,
      activeParticipantId: null,
      turnState: {},
      malice: { current: 0, lastMaliciousStrikeRound: null },
      firstSide: null,
      currentPickingSide: null,
      actedThisRound: [],
    },
  };
}

// Helper: end the currently active encounter using the encounter id from state
function endEncounter(s: CampaignState) {
  const encounterId = s.encounter?.id;
  if (!encounterId) throw new Error('no active encounter');
  return applyIntent(s, intent('EndEncounter', { encounterId }));
}

function firstParticipant(s: CampaignState): Participant {
  const p = s.participants.find(isParticipant);
  if (!p) throw new Error('no participants');
  return p;
}

function findParticipant(s: CampaignState, id: string): Participant {
  const p = s.participants.find((x): x is Participant => isParticipant(x) && x.id === id);
  if (!p) throw new Error(`participant ${id} not found`);
  return p;
}

describe('applyIntent — EndEncounter', () => {
  it('is a no-op when no encounter is active', () => {
    const s0 = emptyCampaignState(campaignId, 'user-owner');
    const r = applyIntent(s0, intent('EndEncounter', { encounterId: 'enc_1' }));
    expect(r.errors).toBeUndefined();
    expect(r.state.encounter).toBeNull();
    expect(r.state.seq).toBe(s0.seq + 1);
    expect(r.log[0]?.text).toMatch(/no active encounter/i);
  });

  it('rejects when the supplied encounterId does not match the active encounter', () => {
    const s = withEncounter();
    const encounterId = s.encounter?.id ?? '';
    const r = applyIntent(s, intent('EndEncounter', { encounterId: 'enc_other' }));
    expect(r.errors?.[0]?.code).toBe('wrong_encounter');
    expect(r.state.encounter?.id).toBe(encounterId); // unchanged
  });

  it('drops encounter to null on the happy path', () => {
    const s = withEncounter();
    const r = endEncounter(s);
    expect(r.errors).toBeUndefined();
    expect(r.state.encounter).toBeNull();
    expect(r.state.seq).toBe(s.seq + 1);
  });

  it('preserves participants in the roster after ending the encounter', () => {
    const participants = [pc(), monster()];
    const s: CampaignState = {
      ...emptyCampaignState(campaignId, 'user-owner'),
      participants,
      encounter: {
        id: 'enc_test',
        currentRound: 1,
        activeParticipantId: null,
        turnState: {},
        malice: { current: 0, lastMaliciousStrikeRound: null },
        firstSide: null,
        currentPickingSide: null,
        actedThisRound: [],
      },
    };
    const r = endEncounter(s);
    expect(r.errors).toBeUndefined();
    expect(r.state.encounter).toBeNull();
    expect(r.state.participants).toHaveLength(2);
  });

  it('rejects invalid payload', () => {
    const s = withEncounter();
    const r = applyIntent(s, intent('EndEncounter', {}));
    expect(r.errors?.[0]?.code).toBe('invalid_payload');
  });

  it('resets every participant heroicResources value to 0 while preserving name/floor/max', () => {
    const participants = [
      pc({
        id: 'pc_talent',
        name: 'Talent',
        heroicResources: [{ name: 'clarity', value: -2, floor: -3 }],
      }),
      pc({
        id: 'pc_censor',
        name: 'Censor',
        heroicResources: [{ name: 'wrath', value: 7, floor: 0 }],
      }),
    ];
    let s: CampaignState = {
      ...emptyCampaignState(campaignId, 'user-owner'),
      participants,
      encounter: {
        id: 'enc_test',
        currentRound: 1,
        activeParticipantId: null,
        turnState: {},
        malice: { current: 0, lastMaliciousStrikeRound: null },
        firstSide: null,
        currentPickingSide: null,
        actedThisRound: [],
      },
    };

    // Snapshot the participant before EndEncounter.
    const talent = findParticipant(s, 'pc_talent');
    const censor = findParticipant(s, 'pc_censor');
    expect(talent.heroicResources[0]?.value).toBe(-2);

    const clearedTalent = resetParticipantForEndOfEncounter(talent);
    expect(clearedTalent.heroicResources[0]?.value).toBe(0);
    expect(clearedTalent.heroicResources[0]?.name).toBe('clarity');
    expect(clearedTalent.heroicResources[0]?.floor).toBe(-3); // floor preserved

    const clearedCensor = resetParticipantForEndOfEncounter(censor);
    expect(clearedCensor.heroicResources[0]?.value).toBe(0);

    // After the full EndEncounter dispatch, encounter is null, participants survive.
    const r = endEncounter(s);
    expect(r.errors).toBeUndefined();
    expect(r.state.encounter).toBeNull();
    expect(r.state.participants).toHaveLength(2);
    expect(
      r.state.participants.find((p): p is Participant => isParticipant(p) && p.id === 'pc_talent')
        ?.heroicResources[0]?.value,
    ).toBe(0);
  });

  it('resets extras values to 0 on every participant', () => {
    const participants = [pc({ extras: [{ name: 'virtue', value: 5, floor: 0 }] })];
    const s: CampaignState = {
      ...emptyCampaignState(campaignId, 'user-owner'),
      participants,
      encounter: {
        id: 'enc_test',
        currentRound: 1,
        activeParticipantId: null,
        turnState: {},
        malice: { current: 0, lastMaliciousStrikeRound: null },
        firstSide: null,
        currentPickingSide: null,
        actedThisRound: [],
      },
    };

    const cleared = resetParticipantForEndOfEncounter(firstParticipant(s));
    expect(cleared.extras[0]?.value).toBe(0);
    expect(cleared.extras[0]?.name).toBe('virtue');
  });

  it('resets surges to 0 on every participant', () => {
    const participants = [pc({ surges: 3 }), monster({ surges: 1 })];
    const s: CampaignState = {
      ...emptyCampaignState(campaignId, 'user-owner'),
      participants,
      encounter: {
        id: 'enc_test',
        currentRound: 1,
        activeParticipantId: null,
        turnState: {},
        malice: { current: 0, lastMaliciousStrikeRound: null },
        firstSide: null,
        currentPickingSide: null,
        actedThisRound: [],
      },
    };

    const before = s.participants ?? [];
    expect(before).toHaveLength(2);
    for (const p of before) {
      if (isParticipant(p)) {
        expect(resetParticipantForEndOfEncounter(p).surges).toBe(0);
      }
    }
  });

  it('does NOT reset recoveries.current (canon §2.13: respite only)', () => {
    const participants = [pc({ recoveries: { current: 5, max: 8 } })];
    const s: CampaignState = {
      ...emptyCampaignState(campaignId, 'user-owner'),
      participants,
      encounter: {
        id: 'enc_test',
        currentRound: 1,
        activeParticipantId: null,
        turnState: {},
        malice: { current: 0, lastMaliciousStrikeRound: null },
        firstSide: null,
        currentPickingSide: null,
        actedThisRound: [],
      },
    };

    const cleared = resetParticipantForEndOfEncounter(firstParticipant(s));
    expect(cleared.recoveries.current).toBe(5);
    expect(cleared.recoveries.max).toBe(8);
  });

  it('clears only end_of_encounter-duration conditions', () => {
    const participants = [
      pc({
        conditions: [
          {
            type: 'Bleeding',
            source: { kind: 'effect', id: 'spell-a' },
            duration: { kind: 'EoT' },
            appliedAtSeq: 1,
            removable: true,
          },
          {
            type: 'Frightened',
            source: { kind: 'effect', id: 'spell-b' },
            duration: { kind: 'end_of_encounter' },
            appliedAtSeq: 2,
            removable: true,
          },
          {
            type: 'Grabbed',
            source: { kind: 'creature', id: 'm_goblin' },
            duration: { kind: 'save_ends' },
            appliedAtSeq: 3,
            removable: true,
          },
        ],
      }),
    ];
    const s: CampaignState = {
      ...emptyCampaignState(campaignId, 'user-owner'),
      participants,
      encounter: {
        id: 'enc_test',
        currentRound: 1,
        activeParticipantId: null,
        turnState: {},
        malice: { current: 0, lastMaliciousStrikeRound: null },
        firstSide: null,
        currentPickingSide: null,
        actedThisRound: [],
      },
    };
    const r = endEncounter(s);
    expect(r.errors).toBeUndefined();
    const types = ((r.state.participants[0] as Participant | undefined)?.conditions ?? []).map(
      (c) => c.type,
    );
    expect(types).toContain('Bleeding');
    expect(types).toContain('Grabbed');
    expect(types).not.toContain('Frightened');

    // Also verify via helper on the pre-end participant
    const cleared = resetParticipantForEndOfEncounter(firstParticipant(s));
    expect(cleared.conditions.map((c) => c.type)).not.toContain('Frightened');
  });

  it('resets malice to fresh state (current 0, lastMaliciousStrikeRound null)', () => {
    const s = withEncounter();
    const withMalice = applyIntent(s, intent('GainMalice', { amount: 12 })).state;
    expect(withMalice.encounter?.malice.current).toBe(12);

    const r = endEncounter(withMalice);
    expect(r.errors).toBeUndefined();
    expect(r.state.encounter).toBeNull();

    // Re-start a new encounter and confirm malice was wiped (StartEncounter inits
    // to 0 on its own — this is a sanity check that EndEncounter doesn't leak
    // prior state into a freshly-started encounter via the seq increment).
    const r2 = applyIntent(
      { ...r.state, currentSessionId: 'sess-test' },
      intent('StartEncounter', {}),
    );
    // Canon § 5.5: empty roster → malice = floor(avg) + aliveHeroes + 1 = 0+0+1 = 1.
    expect(r2.state.encounter?.malice).toEqual({
      current: 1,
      lastMaliciousStrikeRound: null,
    });
  });

  it('emits no derived intents', () => {
    const s = withEncounter();
    const r = endEncounter(s);
    expect(r.derived).toEqual([]);
  });

  describe('EndEncounter cleanup', () => {
    it("zeros every PC's heroic resource value (positive)", () => {
      const participants = [
        pc({
          id: 'pc_censor',
          heroicResources: [{ name: 'wrath', value: 7, floor: 0 }],
        }),
        pc({
          id: 'pc_mystic',
          heroicResources: [{ name: 'piety', value: 3, floor: 0 }],
        }),
      ];
      const s: CampaignState = {
        ...emptyCampaignState(campaignId, 'user-owner'),
        participants,
        encounter: {
          id: 'enc_test',
          currentRound: 1,
            activeParticipantId: null,
          turnState: {},
          malice: { current: 0, lastMaliciousStrikeRound: null },
          firstSide: null,
          currentPickingSide: null,
          actedThisRound: [],
        },
      };

      const r = endEncounter(s);
      expect(r.errors).toBeUndefined();
      const censor = r.state.participants.find((p): p is Participant => isParticipant(p) && p.id === 'pc_censor');
      const mystic = r.state.participants.find((p): p is Participant => isParticipant(p) && p.id === 'pc_mystic');
      expect(censor?.heroicResources[0]?.value).toBe(0);
      expect(mystic?.heroicResources[0]?.value).toBe(0);
    });

    it('zeros negative clarity to 0 (canon § 5.3 lifecycle)', () => {
      const participants = [
        pc({
          id: 'pc_talent',
          heroicResources: [{ name: 'clarity', value: -3, floor: -3 }],
        }),
      ];
      const s: CampaignState = {
        ...emptyCampaignState(campaignId, 'user-owner'),
        participants,
        encounter: {
          id: 'enc_test',
          currentRound: 1,
            activeParticipantId: null,
          turnState: {},
          malice: { current: 0, lastMaliciousStrikeRound: null },
          firstSide: null,
          currentPickingSide: null,
          actedThisRound: [],
        },
      };

      const r = endEncounter(s);
      expect(r.errors).toBeUndefined();
      const talent = r.state.participants.find((p): p is Participant => isParticipant(p) && p.id === 'pc_talent');
      expect(talent?.heroicResources[0]?.value).toBe(0);
      expect(talent?.heroicResources[0]?.floor).toBe(-3); // floor preserved
    });

    it('zeros surges to 0 (canon § 5.6)', () => {
      const participants = [
        pc({
          id: 'pc_with_surges',
          surges: 4,
        }),
      ];
      const s: CampaignState = {
        ...emptyCampaignState(campaignId, 'user-owner'),
        participants,
        encounter: {
          id: 'enc_test',
          currentRound: 1,
            activeParticipantId: null,
          turnState: {},
          malice: { current: 0, lastMaliciousStrikeRound: null },
          firstSide: null,
          currentPickingSide: null,
          actedThisRound: [],
        },
      };

      const r = endEncounter(s);
      expect(r.errors).toBeUndefined();
      const p = r.state.participants.find((x): x is Participant => isParticipant(x) && x.id === 'pc_with_surges');
      expect(p?.surges).toBe(0);
    });

    it('clears all open actions', () => {
      const s: CampaignState = {
        ...emptyCampaignState(campaignId, 'user-owner'),
        participants: [],
        openActions: [
          {
            id: 'oa_1',
            kind: 'title-doomed-opt-in' as const,
            participantId: 'pc_alice',
            raisedAtRound: 1,
            raisedByIntentId: 'i_raise_1',
            expiresAtRound: 2,
            payload: {},
          },
        ],
        encounter: {
          id: 'enc_test',
          currentRound: 1,
              activeParticipantId: null,
          turnState: {},
          malice: { current: 0, lastMaliciousStrikeRound: null },
          firstSide: null,
          currentPickingSide: null,
          actedThisRound: [],
        },
      };

      const r = endEncounter(s);
      expect(r.errors).toBeUndefined();
      expect(r.state.openActions).toEqual([]);
    });
  });
});
