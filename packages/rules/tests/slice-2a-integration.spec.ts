/**
 * Pass 3 Slice 2a — Integration test
 *
 * End-to-end exercises of the class-δ trigger system + Maintenance state
 * machine + posthumous Drama auto-revive flow through the top-level
 * `applyIntent` dispatcher. Every mutation flows through the reducer (no
 * direct call into per-class evaluators or per-intent reducers) so we
 * actually validate the wiring laid down by Tasks 16, 21–28.
 *
 * Six key beats, each in its own `describe` block:
 *   A. Trigger A — Fury takes damage → first-time-per-round Ferocity gain
 *   B. Trigger B — hero becomes winded → Troubadour any-hero-winded fires
 *   C. Trigger C — three heroes use abilities → Troubadour three-heroes fires
 *   D. Maintenance — StartMaintenance, StartTurn auto-deduct, auto-drop chain
 *   E. Posthumous flow — Troubadour dies → drama-cross-30 → auto-revive
 *   F. EndEncounter cleanup — all slice-2a state reset
 *
 * Plus a separate Auto-Drop Chain test that verifies the descending-cost
 * skip-when-unaffordable semantics in turn.ts §StartTurn.
 */

import { defaultPerEncounterFlags, type Participant } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import { applyIntent } from '../src/reducer';
import type { CampaignState, DerivedIntent, IntentResult, StampedIntent } from '../src/types';
import { isParticipant } from '../src/types';
import {
  OWNER_ID,
  baseState,
  makeHeroParticipant,
  makeMonsterParticipant,
  makeRunningEncounterPhase,
  stamped,
} from './intents/test-utils';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const DIRECTOR_ACTOR: StampedIntent['actor'] = { userId: OWNER_ID, role: 'director' };

/**
 * Stamp a derived intent so it can be re-dispatched. Mirrors the
 * `_applyOne` path in `apps/api/src/lobby-do.ts:687` (id + campaignId +
 * timestamp). We use a counter to keep test ids deterministic.
 */
let derivedCounter = 0;
function stampDerived(d: DerivedIntent): StampedIntent {
  derivedCounter += 1;
  return {
    ...d,
    id: `derived-${derivedCounter}`,
    campaignId: 'camp-test',
    timestamp: 1_700_000_000_000 + derivedCounter,
  };
}

/**
 * Apply one intent and recursively cascade every derived intent it emits.
 * This is the test-side mirror of `LobbyDO._applyOne`.
 *
 * Returns the final state plus an aggregated list of all derived intents
 * (in the order they were dispatched) and all log entries — useful for
 * assertions about side effects fired anywhere down the cascade.
 */
function applyWithCascade(
  state: CampaignState,
  intent: StampedIntent,
): { state: CampaignState; allDerived: StampedIntent[]; result: IntentResult } {
  let current = state;
  const allDerived: StampedIntent[] = [];
  // Breadth-first queue so derived-of-derived fire in dispatch order.
  const queue: StampedIntent[] = [intent];
  let firstResult: IntentResult | null = null;
  while (queue.length > 0) {
    const next = queue.shift()!;
    const result = applyIntent(current, next);
    if (firstResult === null) firstResult = result;
    if (result.errors && result.errors.length > 0) {
      throw new Error(
        `applyWithCascade: ${next.type} rejected: ${result.errors.map((e) => e.message).join('; ')}`,
      );
    }
    current = result.state;
    if (next !== intent) allDerived.push(next);
    for (const d of result.derived) {
      queue.push(stampDerived(d));
    }
  }
  return { state: current, allDerived, result: firstResult! };
}

/** Build a campaign state with an active encounter and the given participants. */
function withEncounter(participants: Participant[], currentRound = 1): CampaignState {
  return baseState({
    currentSessionId: 'sess-1',
    participants,
    encounter: makeRunningEncounterPhase('enc-2a', { currentRound }),
  });
}

/** Pull a participant out of state by id. Throws if missing — keeps assertions terse. */
function getPc(state: CampaignState, id: string): Participant {
  const p = state.participants.filter(isParticipant).find((x) => x.id === id);
  if (!p) throw new Error(`participant ${id} not found in state`);
  return p;
}

// ---------------------------------------------------------------------------
// Beat A — Fury Ferocity (action-trigger, damage-applied)
// ---------------------------------------------------------------------------

describe('slice-2a integration A — Fury Ferocity on damage-applied', () => {
  const FURY_ID = 'pc:fury-A';

  function buildState(): CampaignState {
    return withEncounter([
      makeHeroParticipant(FURY_ID, {
        className: 'Fury',
        heroicResources: [{ name: 'ferocity', value: 0, floor: 0 }],
      }),
    ]);
  }

  it('ApplyDamage on Fury → +1 ferocity (flat per canon) + perRound.tookDamage latch flipped', () => {
    const state = buildState();
    const { state: next } = applyWithCascade(
      state,
      stamped({
        type: 'ApplyDamage',
        actor: DIRECTOR_ACTOR,
        payload: {
          targetId: FURY_ID,
          amount: 5,
          damageType: 'fire',
          sourceIntentId: 'src-A',
          intent: 'kill',
          // Per-round action trigger is +1 flat (canon § 5.4.4); ferocityD3
          // is only consumed by the per-encounter stamina-transition path.
        },
      }),
    );

    const fury = getPc(next, FURY_ID);
    const ferocity = fury.heroicResources.find((r) => r.name === 'ferocity');
    expect(ferocity?.value).toBe(1);
    expect(fury.perEncounterFlags.perRound.tookDamage).toBe(true);
  });

  it('second damage event in the same round does NOT re-gain ferocity (per-round latch)', () => {
    let state = buildState();
    state = applyWithCascade(
      state,
      stamped({
        type: 'ApplyDamage',
        actor: DIRECTOR_ACTOR,
        payload: {
          targetId: FURY_ID,
          amount: 5,
          damageType: 'fire',
          sourceIntentId: 'src-A1',
          intent: 'kill',
        },
      }),
    ).state;
    state = applyWithCascade(
      state,
      stamped({
        type: 'ApplyDamage',
        actor: DIRECTOR_ACTOR,
        payload: {
          targetId: FURY_ID,
          amount: 3,
          damageType: 'fire',
          sourceIntentId: 'src-A2',
          intent: 'kill',
          // Latch must suppress the second action trigger.
        },
      }),
    ).state;

    const fury = getPc(state, FURY_ID);
    const ferocity = fury.heroicResources.find((r) => r.name === 'ferocity');
    expect(ferocity?.value).toBe(1); // unchanged from first event (+1 flat)
  });
});

// ---------------------------------------------------------------------------
// Beat B — Troubadour any-hero-winded (stamina-transition trigger)
// ---------------------------------------------------------------------------

describe('slice-2a integration B — Troubadour any-hero-winded on stamina transition', () => {
  const TROU_ID = 'pc:trou-B';
  const FRIEND_ID = 'pc:friend-B';

  function buildState(): CampaignState {
    return withEncounter([
      makeHeroParticipant(TROU_ID, {
        className: 'Troubadour',
        heroicResources: [{ name: 'drama', value: 0, floor: 0 }],
      }),
      makeHeroParticipant(FRIEND_ID, {
        // 30 max → windedValue = 15. Damage 16 puts them at 14 (≤15) → winded.
        maxStamina: 30,
        currentStamina: 30,
      }),
    ]);
  }

  it('damage to friend crossing winded → Troubadour gains +2 drama + latch flipped', () => {
    const state = buildState();
    const { state: next } = applyWithCascade(
      state,
      stamped({
        type: 'ApplyDamage',
        actor: DIRECTOR_ACTOR,
        payload: {
          targetId: FRIEND_ID,
          amount: 16,
          damageType: 'untyped',
          sourceIntentId: 'src-B',
          intent: 'kill',
        },
      }),
    );

    const friend = getPc(next, FRIEND_ID);
    expect(friend.staminaState).toBe('winded');

    const trou = getPc(next, TROU_ID);
    const drama = trou.heroicResources.find((r) => r.name === 'drama');
    expect(drama?.value).toBe(2);
    expect(trou.perEncounterFlags.perEncounter.troubadourAnyHeroWindedTriggered).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Beat C — Troubadour three-heroes-this-turn (action-trigger via heroesActedThisTurn)
// ---------------------------------------------------------------------------

describe('slice-2a integration C — Troubadour three heroes acted this turn', () => {
  const TROU_ID = 'pc:trou-C';
  const HERO_1 = 'pc:h1-C';
  const HERO_2 = 'pc:h2-C';

  function buildState(): CampaignState {
    return withEncounter([
      makeHeroParticipant(TROU_ID, {
        ownerId: OWNER_ID,
        className: 'Troubadour',
        heroicResources: [{ name: 'drama', value: 0, floor: 0 }],
      }),
      makeHeroParticipant(HERO_1, { ownerId: OWNER_ID }),
      makeHeroParticipant(HERO_2, { ownerId: OWNER_ID }),
    ]);
  }

  it('three UseAbility dispatches from three heroes → Troubadour +2 drama on the third', () => {
    let state = buildState();

    // Hero 1 — first ability use this turn.
    state = applyWithCascade(
      state,
      stamped({
        type: 'UseAbility',
        actor: DIRECTOR_ACTOR,
        payload: {
          participantId: HERO_1,
          abilityId: 'aA',
          source: 'class',
          duration: { kind: 'EoT' },
        },
      }),
    ).state;

    // Trou: still 0 drama (only 1 hero acted).
    let trou = getPc(state, TROU_ID);
    expect(trou.heroicResources.find((r) => r.name === 'drama')?.value).toBe(0);

    // Hero 2 — second ability use.
    state = applyWithCascade(
      state,
      stamped({
        type: 'UseAbility',
        actor: DIRECTOR_ACTOR,
        payload: {
          participantId: HERO_2,
          abilityId: 'aB',
          source: 'class',
          duration: { kind: 'EoT' },
        },
      }),
    ).state;
    trou = getPc(state, TROU_ID);
    expect(trou.heroicResources.find((r) => r.name === 'drama')?.value).toBe(0);

    // Trou — third ability use (3 unique heroes acted this turn).
    state = applyWithCascade(
      state,
      stamped({
        type: 'UseAbility',
        actor: DIRECTOR_ACTOR,
        payload: {
          participantId: TROU_ID,
          abilityId: 'aC',
          source: 'class',
          duration: { kind: 'EoT' },
        },
      }),
    ).state;

    trou = getPc(state, TROU_ID);
    expect(trou.heroicResources.find((r) => r.name === 'drama')?.value).toBe(2);
    expect(trou.perEncounterFlags.perEncounter.troubadourThreeHeroesTriggered).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Beat D — Elementalist Maintenance: StartMaintenance + StartTurn deduction
// ---------------------------------------------------------------------------

describe('slice-2a integration D — Elementalist Maintenance state machine', () => {
  const ELE_ID = 'pc:ele-D';

  function buildState(essenceStart = 5): CampaignState {
    return withEncounter([
      makeHeroParticipant(ELE_ID, {
        ownerId: OWNER_ID,
        className: 'Elementalist',
        heroicResources: [{ name: 'essence', value: essenceStart, floor: 0 }],
      }),
    ]);
  }

  it('StartMaintenance registers the ability; StartTurn deducts cost from essence', () => {
    let state = buildState(5);

    // Player starts maintaining an ability at cost 2/turn.
    state = applyWithCascade(
      state,
      stamped({
        type: 'StartMaintenance',
        actor: DIRECTOR_ACTOR,
        payload: {
          participantId: ELE_ID,
          abilityId: 'storm-aegis',
          costPerTurn: 2,
        },
      }),
    ).state;

    let ele = getPc(state, ELE_ID);
    expect(ele.maintainedAbilities).toEqual([
      { abilityId: 'storm-aegis', costPerTurn: 2, startedAtRound: 1 },
    ]);

    // StartTurn: Elementalist gains +2 essence (flat) → 7, then maintenance
    // deducts 2 → final 5. Maintenance persists.
    state = applyWithCascade(
      state,
      stamped({
        type: 'StartTurn',
        actor: DIRECTOR_ACTOR,
        payload: { participantId: ELE_ID },
      }),
    ).state;

    ele = getPc(state, ELE_ID);
    expect(ele.heroicResources.find((r) => r.name === 'essence')?.value).toBe(5);
    expect(ele.maintainedAbilities).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Beat E — Posthumous Drama flow: dead Troubadour → drama crosses 30 → revive
// ---------------------------------------------------------------------------

describe('slice-2a integration E — Troubadour posthumous Drama auto-revive', () => {
  const TROU_ID = 'pc:trou-E';

  function buildDeadTrouState(): CampaignState {
    // Dead, body intact, posthumous-eligible — the StaminaTransitioned path in
    // a real fight would have flipped `posthumousDramaEligible` to true on the
    // death event; here we set it manually to keep the test focused on
    // beat E rather than re-asserting beat B.
    return withEncounter([
      makeHeroParticipant(TROU_ID, {
        ownerId: OWNER_ID,
        className: 'Troubadour',
        heroicResources: [{ name: 'drama', value: 28, floor: 0 }],
        currentStamina: -50,
        staminaState: 'dead',
        bodyIntact: true,
        posthumousDramaEligible: true,
      }),
    ]);
  }

  it('GainResource drama crossing 30 → raises troubadour-auto-revive OA', () => {
    const state = buildDeadTrouState();

    const { state: afterGain } = applyWithCascade(
      state,
      stamped({
        type: 'GainResource',
        actor: DIRECTOR_ACTOR,
        payload: { participantId: TROU_ID, name: 'drama', amount: 5 },
      }),
    );

    // Drama is now 33; OA in the queue; latch flipped to prevent re-raise.
    const trou = getPc(afterGain, TROU_ID);
    expect(trou.heroicResources.find((r) => r.name === 'drama')?.value).toBe(33);
    expect(trou.perEncounterFlags.perEncounter.troubadourReviveOARaised).toBe(true);

    const reviveOA = afterGain.openActions.find((o) => o.kind === 'troubadour-auto-revive');
    expect(reviveOA).toBeDefined();
    expect(reviveOA?.participantId).toBe(TROU_ID);
  });

  it('full chain: GainResource → OA → ClaimOpenAction → TroubadourAutoRevive → alive', () => {
    let state = buildDeadTrouState();

    state = applyWithCascade(
      state,
      stamped({
        type: 'GainResource',
        actor: DIRECTOR_ACTOR,
        payload: { participantId: TROU_ID, name: 'drama', amount: 5 },
      }),
    ).state;

    // OA was raised by the cascade above; fetch its id from state.
    const oa = state.openActions.find((o) => o.kind === 'troubadour-auto-revive');
    expect(oa).toBeDefined();

    // Director claims the OA — cascades into TroubadourAutoRevive.
    const { state: afterClaim } = applyWithCascade(
      state,
      stamped({
        type: 'ClaimOpenAction',
        actor: DIRECTOR_ACTOR,
        payload: { openActionId: oa!.id },
      }),
    );

    // The Troubadour is alive again: stamina → 1, state recomputed, drama
    // reset to 0, posthumousDramaEligible cleared, latch reset.
    const trou = getPc(afterClaim, TROU_ID);
    expect(trou.currentStamina).toBe(1);
    expect(trou.staminaState).not.toBe('dead');
    expect(trou.heroicResources.find((r) => r.name === 'drama')?.value).toBe(0);
    expect(trou.posthumousDramaEligible).toBe(false);
    expect(trou.perEncounterFlags.perEncounter.troubadourReviveOARaised).toBe(false);

    // OA was consumed.
    expect(afterClaim.openActions.find((o) => o.id === oa!.id)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Beat F — EndEncounter cleanup of all slice-2a state
// ---------------------------------------------------------------------------

describe('slice-2a integration F — EndEncounter resets slice-2a state', () => {
  const FURY_ID = 'pc:fury-F';
  const TROU_ID = 'pc:trou-F';
  const ELE_ID = 'pc:ele-F';
  const DEAD_TROU_ID = 'pc:dead-trou-F';

  function buildDirtyState(): CampaignState {
    // Build state that has every slice-2a knob flipped to "dirty" so we can
    // assert EndEncounter wipes them.
    const fury = makeHeroParticipant(FURY_ID, { className: 'Fury' });
    fury.perEncounterFlags.perEncounter.firstTimeWindedTriggered = true;
    fury.perEncounterFlags.perEncounter.firstTimeDyingTriggered = true;
    fury.perEncounterFlags.perRound.tookDamage = true;

    const trou = makeHeroParticipant(TROU_ID, { className: 'Troubadour' });
    trou.perEncounterFlags.perEncounter.troubadourThreeHeroesTriggered = true;
    trou.perEncounterFlags.perEncounter.troubadourAnyHeroWindedTriggered = true;

    const ele = makeHeroParticipant(ELE_ID, {
      className: 'Elementalist',
      maintainedAbilities: [
        { abilityId: 'storm-aegis', costPerTurn: 2, startedAtRound: 1 },
      ],
    });

    const deadTrou = makeHeroParticipant(DEAD_TROU_ID, {
      className: 'Troubadour',
      currentStamina: -50,
      staminaState: 'dead',
      bodyIntact: true,
      posthumousDramaEligible: true,
    });

    return withEncounter([fury, trou, ele, deadTrou]);
  }

  it('EndEncounter resets per-encounter latches, maintainedAbilities, and posthumous flag on dead PCs', () => {
    const state = buildDirtyState();
    const encId = state.encounter!.id;

    const { state: after } = applyWithCascade(
      state,
      stamped({
        type: 'EndEncounter',
        actor: DIRECTOR_ACTOR,
        payload: { encounterId: encId },
      }),
    );

    expect(after.encounter).toBeNull();

    const fury = getPc(after, FURY_ID);
    // Per-encounter latches reset to defaults.
    expect(fury.perEncounterFlags.perEncounter).toEqual(
      defaultPerEncounterFlags().perEncounter,
    );

    const trou = getPc(after, TROU_ID);
    expect(trou.perEncounterFlags.perEncounter).toEqual(
      defaultPerEncounterFlags().perEncounter,
    );

    const ele = getPc(after, ELE_ID);
    expect(ele.maintainedAbilities).toEqual([]);

    const deadTrou = getPc(after, DEAD_TROU_ID);
    // Dead-at-end-of-encounter PCs lose posthumous eligibility (locks in
    // canon's "no future encounters" path).
    expect(deadTrou.posthumousDramaEligible).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Beat G — Auto-Drop Chain on StartTurn
// ---------------------------------------------------------------------------

describe('slice-2a integration G — Maintenance auto-drop chain on StartTurn', () => {
  const ELE_ID = 'pc:ele-G';

  it('cost-3 ability survives, cost-2 ability auto-drops when projected essence would go negative', () => {
    // Per the plan:
    //   Start essence: 1
    //   +2 from per-turn gain → projected 3
    //   Sort descending: [Storm Aegis cost 3, Wreath cost 2]
    //   Storm Aegis (3): 3 − 3 = 0 → afford → projected 0
    //   Wreath (2): 0 − 2 = −2 → can't afford → emit StopMaintenance, skip
    //   Final essence: 0; Wreath dropped; Storm Aegis still maintained.
    const ele = makeHeroParticipant(ELE_ID, {
      ownerId: OWNER_ID,
      className: 'Elementalist',
      heroicResources: [{ name: 'essence', value: 1, floor: 0 }],
      maintainedAbilities: [
        { abilityId: 'storm-aegis', costPerTurn: 3, startedAtRound: 1 },
        { abilityId: 'wreath-of-flame', costPerTurn: 2, startedAtRound: 1 },
      ],
    });

    const state = withEncounter([ele]);

    const { state: after, allDerived, result } = applyWithCascade(
      state,
      stamped({
        type: 'StartTurn',
        actor: DIRECTOR_ACTOR,
        payload: { participantId: ELE_ID },
      }),
    );

    // Final essence at 0 — Storm Aegis paid for, Wreath dropped before paying.
    const post = getPc(after, ELE_ID);
    expect(post.heroicResources.find((r) => r.name === 'essence')?.value).toBe(0);
    expect(post.maintainedAbilities).toEqual([
      { abilityId: 'storm-aegis', costPerTurn: 3, startedAtRound: 1 },
    ]);

    // Exactly one StopMaintenance derived was emitted from StartTurn for the
    // dropped ability (Wreath). Storm Aegis was paid for and survived.
    const stopMaintenances = result.derived.filter((d) => d.type === 'StopMaintenance');
    expect(stopMaintenances).toHaveLength(1);
    expect(stopMaintenances[0]!.payload).toMatchObject({
      participantId: ELE_ID,
      abilityId: 'wreath-of-flame',
    });

    // And the cascade actually applied it (the dropped ability is gone).
    const cascaded = allDerived.find(
      (d) =>
        d.type === 'StopMaintenance' &&
        (d.payload as { abilityId: string }).abilityId === 'wreath-of-flame',
    );
    expect(cascaded).toBeDefined();
  });

  it('insufficient essence to pay for both: only the unaffordable one drops (no chain-reaction kills the affordable one)', () => {
    // Two abilities: cost 5 and cost 1.
    // Start essence 4 + 2 = 6.
    // Sort desc: [cost 5, cost 1].
    // 6 − 5 = 1 ≥ 0 → afford → projected 1.
    // 1 − 1 = 0 ≥ 0 → afford → projected 0.
    // Both survive.
    const ele = makeHeroParticipant(ELE_ID, {
      ownerId: OWNER_ID,
      className: 'Elementalist',
      heroicResources: [{ name: 'essence', value: 4, floor: 0 }],
      maintainedAbilities: [
        { abilityId: 'big', costPerTurn: 5, startedAtRound: 1 },
        { abilityId: 'small', costPerTurn: 1, startedAtRound: 1 },
      ],
    });
    const state = withEncounter([ele]);

    const { state: after, result } = applyWithCascade(
      state,
      stamped({
        type: 'StartTurn',
        actor: DIRECTOR_ACTOR,
        payload: { participantId: ELE_ID },
      }),
    );

    const post = getPc(after, ELE_ID);
    expect(post.heroicResources.find((r) => r.name === 'essence')?.value).toBe(0);
    expect(post.maintainedAbilities).toHaveLength(2);
    expect(result.derived.filter((d) => d.type === 'StopMaintenance')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Bonus scenario — multi-class encounter walkthrough that exercises B + C
// across two adjacent dispatches in one cascade. Smaller than the plan's
// "full 4-PC, 3-round" scenario but verifies the same composition.
// ---------------------------------------------------------------------------

describe('slice-2a integration H — Mixed-class encounter walkthrough', () => {
  const FURY_ID = 'pc:fury-H';
  const TROU_ID = 'pc:trou-H';
  const ELE_ID = 'pc:ele-H';
  const MONSTER_ID = 'm:goblin-H';

  it('Fury Ferocity + Troubadour any-hero-winded fire from the SAME ApplyDamage cascade', () => {
    // Fury at low stamina (just above winded). One big hit crosses winded AND
    // is the first damage of the round. Expect:
    //   - Fury: +1 flat from per-round action trigger (canon § 5.4.4),
    //     perRound.tookDamage = true.
    //   - Fury: stamina transitions healthy → winded, firstTimeWindedTriggered
    //     latch flips and Fury gains +ferocityD3 (=3) from the per-encounter
    //     stamina-transition trigger. Total ferocity = 1 + 3 = 4.
    //   - Trou: +2 drama, troubadourAnyHeroWindedTriggered = true.
    const fury = makeHeroParticipant(FURY_ID, {
      ownerId: OWNER_ID,
      className: 'Fury',
      heroicResources: [{ name: 'ferocity', value: 0, floor: 0 }],
      // 30 max → windedValue 15. 16 stamina → 1 damage past winded threshold.
      maxStamina: 30,
      currentStamina: 16,
    });
    const trou = makeHeroParticipant(TROU_ID, {
      ownerId: OWNER_ID,
      className: 'Troubadour',
      heroicResources: [{ name: 'drama', value: 0, floor: 0 }],
    });
    const ele = makeHeroParticipant(ELE_ID, {
      ownerId: OWNER_ID,
      className: 'Elementalist',
      heroicResources: [{ name: 'essence', value: 0, floor: 0 }],
    });
    const monster = makeMonsterParticipant(MONSTER_ID);

    const state = withEncounter([fury, trou, ele, monster]);

    const { state: after } = applyWithCascade(
      state,
      stamped({
        type: 'ApplyDamage',
        actor: DIRECTOR_ACTOR,
        payload: {
          targetId: FURY_ID,
          // 16 − 2 = 14 ≤ 15 windedValue → transitions to winded.
          amount: 2,
          damageType: 'fire',
          sourceIntentId: 'src-H',
          intent: 'kill',
          ferocityD3: 3,
        },
      }),
    );

    // Fury fired both the action trigger AND the stamina trigger.
    const furyAfter = getPc(after, FURY_ID);
    expect(furyAfter.staminaState).toBe('winded');
    expect(furyAfter.perEncounterFlags.perRound.tookDamage).toBe(true);
    expect(furyAfter.perEncounterFlags.perEncounter.firstTimeWindedTriggered).toBe(true);
    expect(furyAfter.heroicResources.find((r) => r.name === 'ferocity')?.value).toBe(4);

    // Trou fired any-hero-winded.
    const trouAfter = getPc(after, TROU_ID);
    expect(trouAfter.perEncounterFlags.perEncounter.troubadourAnyHeroWindedTriggered).toBe(true);
    expect(trouAfter.heroicResources.find((r) => r.name === 'drama')?.value).toBe(2);

    // Elementalist's spatial OA was raised (Fury took fire damage within 10sq
    // — distance is checked at claim time). The OA goes onto the queue.
    const eleOA = after.openActions.find(
      (o) => o.kind === 'spatial-trigger-elementalist-essence' && o.participantId === ELE_ID,
    );
    expect(eleOA).toBeDefined();
  });
});
