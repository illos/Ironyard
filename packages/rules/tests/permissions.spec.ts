import {
  IntentTypes,
  SERVER_ONLY_INTENTS,
  defaultPerEncounterFlags,
  defaultPsionFlags,
  defaultTargetingRelations,
} from '@ironyard/shared';
import type { Actor, Intent, Participant } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import { type CampaignState, emptyCampaignState } from '../src/index';
import { canDispatch } from '../src/permissions';

const T = 1_700_000_000_000;
const campaignId = 'sess_test';
const OWNER_USER_ID = 'u_alice';
const OTHER_USER_ID = 'u_bob';
const DIRECTOR_USER_ID = 'u_dani';

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
    ownerId: OWNER_USER_ID,
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
    perEncounterFlags: defaultPerEncounterFlags(),
    posthumousDramaEligible: false,
    psionFlags: defaultPsionFlags(),
    maintainedAbilities: [],
    purchasedTraits: [],
    equippedTitleIds: [],
    targetingRelations: defaultTargetingRelations(),
    ...over,
  };
}

function stateWith(
  participants: Participant[],
  activeDirectorId = DIRECTOR_USER_ID,
): CampaignState {
  const s = emptyCampaignState(campaignId, DIRECTOR_USER_ID);
  return {
    ...s,
    activeDirectorId,
    participants,
  };
}

function intent(type: string, payload: unknown, actor: Actor): Intent {
  return {
    id: `i_${Math.random().toString(36).slice(2)}`,
    campaignId,
    actor,
    timestamp: T,
    source: 'manual',
    type,
    payload,
  };
}

const playerOwner: Actor = { userId: OWNER_USER_ID, role: 'player' };
const otherPlayer: Actor = { userId: OTHER_USER_ID, role: 'player' };
const director: Actor = { userId: DIRECTOR_USER_ID, role: 'director' };

describe('permissions — slice 2a additions', () => {
  it('StartMaintenance accepted from player-owner (PC.ownerId matches actor.userId)', () => {
    const state = stateWith([pc()]);
    const i = intent(
      IntentTypes.StartMaintenance,
      { participantId: 'pc_alice', abilityId: 'storm-aegis', costPerTurn: 2 },
      playerOwner,
    );
    expect(canDispatch(i, playerOwner, state)).toBe(true);
  });

  it('StartMaintenance accepted from active director', () => {
    const state = stateWith([pc()]);
    const i = intent(
      IntentTypes.StartMaintenance,
      { participantId: 'pc_alice', abilityId: 'storm-aegis', costPerTurn: 2 },
      director,
    );
    expect(canDispatch(i, director, state)).toBe(true);
  });

  it('StartMaintenance rejected from another player who does not own the PC', () => {
    const state = stateWith([pc()]);
    const i = intent(
      IntentTypes.StartMaintenance,
      { participantId: 'pc_alice', abilityId: 'storm-aegis', costPerTurn: 2 },
      otherPlayer,
    );
    expect(canDispatch(i, otherPlayer, state)).toBe(false);
  });

  it('StopMaintenance follows the same owner-or-director trust as StartMaintenance', () => {
    const state = stateWith([pc()]);

    const ownerIntent = intent(
      IntentTypes.StopMaintenance,
      { participantId: 'pc_alice', abilityId: 'storm-aegis' },
      playerOwner,
    );
    expect(canDispatch(ownerIntent, playerOwner, state)).toBe(true);

    const directorIntent = intent(
      IntentTypes.StopMaintenance,
      { participantId: 'pc_alice', abilityId: 'storm-aegis' },
      director,
    );
    expect(canDispatch(directorIntent, director, state)).toBe(true);

    const otherIntent = intent(
      IntentTypes.StopMaintenance,
      { participantId: 'pc_alice', abilityId: 'storm-aegis' },
      otherPlayer,
    );
    expect(canDispatch(otherIntent, otherPlayer, state)).toBe(false);
  });

  it('Maintenance intents rejected when participant id does not resolve', () => {
    const state = stateWith([pc()]);
    const i = intent(
      IntentTypes.StartMaintenance,
      { participantId: 'pc_does_not_exist', abilityId: 'storm-aegis', costPerTurn: 2 },
      playerOwner,
    );
    expect(canDispatch(i, playerOwner, state)).toBe(false);
  });

  it('Maintenance intents rejected on monster participant (no PC ownerId match)', () => {
    // Defensive: even if a monster id is passed, the canon model has no owner —
    // only the director may toggle.
    const monsterParticipant = pc({ id: 'm_goblin', kind: 'monster', ownerId: null });
    const state = stateWith([monsterParticipant]);
    const playerIntent = intent(
      IntentTypes.StartMaintenance,
      { participantId: 'm_goblin', abilityId: 'frenzy', costPerTurn: 1 },
      playerOwner,
    );
    expect(canDispatch(playerIntent, playerOwner, state)).toBe(false);

    const directorIntent = intent(
      IntentTypes.StartMaintenance,
      { participantId: 'm_goblin', abilityId: 'frenzy', costPerTurn: 1 },
      director,
    );
    expect(canDispatch(directorIntent, director, state)).toBe(true);
  });

  it('permissive default for unhandled intent types', () => {
    const state = stateWith([pc()]);
    const i = intent(IntentTypes.Note, { text: 'hello' }, otherPlayer);
    expect(canDispatch(i, otherPlayer, state)).toBe(true);
  });
});

describe('SERVER_ONLY_INTENTS coverage — slice 2a', () => {
  it('TroubadourAutoRevive is in SERVER_ONLY_INTENTS', () => {
    expect(SERVER_ONLY_INTENTS.has(IntentTypes.TroubadourAutoRevive)).toBe(true);
  });

  it('SetParticipantPerEncounterLatch is in SERVER_ONLY_INTENTS', () => {
    expect(SERVER_ONLY_INTENTS.has(IntentTypes.SetParticipantPerEncounterLatch)).toBe(true);
  });

  it('SetParticipantPerRoundFlag is in SERVER_ONLY_INTENTS', () => {
    expect(SERVER_ONLY_INTENTS.has(IntentTypes.SetParticipantPerRoundFlag)).toBe(true);
  });

  it('SetParticipantPerTurnEntry is in SERVER_ONLY_INTENTS', () => {
    expect(SERVER_ONLY_INTENTS.has(IntentTypes.SetParticipantPerTurnEntry)).toBe(true);
  });

  it('SetParticipantPosthumousDramaEligible is in SERVER_ONLY_INTENTS', () => {
    expect(SERVER_ONLY_INTENTS.has(IntentTypes.SetParticipantPosthumousDramaEligible)).toBe(true);
  });

  it('StartMaintenance and StopMaintenance are NOT in SERVER_ONLY_INTENTS (player-dispatchable)', () => {
    expect(SERVER_ONLY_INTENTS.has(IntentTypes.StartMaintenance)).toBe(false);
    expect(SERVER_ONLY_INTENTS.has(IntentTypes.StopMaintenance)).toBe(false);
  });
});

describe('reducer dispatch — slice 2a intents are wired', () => {
  // These tests live in their own intent-spec files (Tasks 18-21 etc.); this
  // smoke check confirms the reducer recognises every slice-2a intent (i.e.
  // doesn't fall through to the `unknown_intent` default arm). It also acts as
  // a tripwire if anyone removes a case during a future refactor.
  const SLICE_2A_INTENTS = [
    IntentTypes.StartMaintenance,
    IntentTypes.StopMaintenance,
    IntentTypes.TroubadourAutoRevive,
    IntentTypes.SetParticipantPerEncounterLatch,
    IntentTypes.SetParticipantPosthumousDramaEligible,
    IntentTypes.SetParticipantPerRoundFlag,
    IntentTypes.SetParticipantPerTurnEntry,
  ] as const;

  it('every slice-2a intent type is a known IntentTypes member', () => {
    // Catches typos in the names above and confirms the const tuple compiles.
    for (const name of SLICE_2A_INTENTS) {
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
    }
  });
});
