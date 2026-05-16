/**
 * Pass 3 Slice 2b — Integration test
 *
 * End-to-end exercises of the targeting-relations system (Judgment, Mark,
 * Null Field) through the top-level `applyIntent` dispatcher. Every mutation
 * flows through the reducer — no direct calls into per-class evaluators or
 * per-intent reducers — so this validates the full wiring from Tasks 1–11.
 *
 * Nine beats driven in a single continuous state thread:
 *   1. Setup: 4 PCs (Censor, Tactician, Null, Talent) + 3 monsters
 *   2. Aldric uses Judgment on Goblin-A → judged relation set
 *   3. Goblin-A damages Aldric → Censor wrath fires (+1) + latch flipped
 *   4. Goblin-B damages Aldric → wrath unchanged (goblin-b not judged)
 *   5. Korva uses Mark on Goblin-A → marked relation set
 *   6. Vex toggles Goblin-A into Null Field → nullField relation set
 *   7. Aldric uses Judgment on Goblin-C (cap-1 replace) → judged replaces
 *   8. RemoveParticipant Goblin-A → dangling refs stripped from korva + vex
 *   9. EndEncounter → all targetingRelations reset to empty
 */

import type { Participant } from '@ironyard/shared';
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
// Shared helpers (mirror slice-2a-integration.spec.ts pattern)
// ---------------------------------------------------------------------------

const DIRECTOR_ACTOR: StampedIntent['actor'] = { userId: OWNER_ID, role: 'director' };

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
 * Breadth-first to match LobbyDO._applyOne ordering.
 */
function applyWithCascade(
  state: CampaignState,
  intent: StampedIntent,
): { state: CampaignState; allDerived: StampedIntent[]; result: IntentResult } {
  let current = state;
  const allDerived: StampedIntent[] = [];
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

/** Pull a participant by id. Throws if missing — keeps assertions terse. */
function getP(state: CampaignState, id: string): Participant {
  const p = state.participants.filter(isParticipant).find((x) => x.id === id);
  if (!p) throw new Error(`participant ${id} not found`);
  return p;
}

// ---------------------------------------------------------------------------
// Participant ids
// ---------------------------------------------------------------------------

const ALDRIC_ID = 'pc:aldric';
const KORVA_ID = 'pc:korva';
const VEX_ID = 'pc:vex';
const ELDRA_ID = 'pc:eldra';
const GOBLIN_A_ID = 'm:goblin-a';
const GOBLIN_B_ID = 'm:goblin-b';
const GOBLIN_C_ID = 'm:goblin-c';
const ENC_ID = 'enc-2b';

// ---------------------------------------------------------------------------
// State builder
// ---------------------------------------------------------------------------

function buildInitialState(): CampaignState {
  const aldric = makeHeroParticipant(ALDRIC_ID, {
    name: 'Aldric',
    className: 'Censor',
    ownerId: OWNER_ID,
    // Censor class: heroicResources = wrath
    heroicResources: [{ name: 'wrath', value: 0, floor: 0 }],
    // Keep stamina high enough that small hits don't kill them
    maxStamina: 40,
    currentStamina: 40,
  });

  const korva = makeHeroParticipant(KORVA_ID, {
    name: 'Korva',
    className: 'Tactician',
    ownerId: OWNER_ID,
    heroicResources: [{ name: 'focus', value: 0, floor: 0 }],
  });

  const vex = makeHeroParticipant(VEX_ID, {
    name: 'Vex',
    className: 'Null',
    ownerId: OWNER_ID,
    heroicResources: [{ name: 'discipline', value: 0, floor: 0 }],
  });

  const eldra = makeHeroParticipant(ELDRA_ID, {
    name: 'Eldra',
    className: 'Talent',
    ownerId: OWNER_ID,
    heroicResources: [{ name: 'clarity', value: 0, floor: 0 }],
  });

  const goblinA = makeMonsterParticipant(GOBLIN_A_ID, { name: 'Goblin A' });
  const goblinB = makeMonsterParticipant(GOBLIN_B_ID, { name: 'Goblin B' });
  const goblinC = makeMonsterParticipant(GOBLIN_C_ID, { name: 'Goblin C' });

  return baseState({
    currentSessionId: 'sess-1',
    participants: [aldric, korva, vex, eldra, goblinA, goblinB, goblinC],
    encounter: makeRunningEncounterPhase(ENC_ID, { currentRound: 1 }),
  });
}

// ---------------------------------------------------------------------------
// The integration scenario — single describe, beats in order
// ---------------------------------------------------------------------------

describe('slice-2b integration — full lifecycle', () => {
  // Thread state through all beats.
  let state = buildInitialState();

  // ──────────────────────────────────────────────────────────────────────────
  // Beat 1 — Aldric uses Judgment on Goblin-A
  // ──────────────────────────────────────────────────────────────────────────
  it('beat 1: Aldric UseAbility censor-judgment-t1 on Goblin-A → judged includes goblin-a', () => {
    const { state: next } = applyWithCascade(
      state,
      stamped({
        type: 'UseAbility',
        actor: DIRECTOR_ACTOR,
        payload: {
          participantId: ALDRIC_ID,
          abilityId: 'censor-judgment-t1',
          source: 'class',
          duration: { kind: 'end_of_encounter' },
          targetIds: [GOBLIN_A_ID],
        },
      }),
    );
    state = next;

    const aldric = getP(state, ALDRIC_ID);
    expect(aldric.targetingRelations.judged).toEqual([GOBLIN_A_ID]);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Beat 2 — Goblin-A damages Aldric → Censor δ fires → +1 wrath + latch
  //
  // Critical: applyApplyDamage derives dealerId from encounter.activeParticipantId.
  // We must set goblin-A as the active participant before dispatching ApplyDamage.
  // ──────────────────────────────────────────────────────────────────────────
  it('beat 2: Goblin-A damages Aldric → +1 wrath + judgedTargetDamagedMe latch', () => {
    // Set goblin-A as the active participant for the damage event.
    state = {
      ...state,
      encounter: {
        ...state.encounter!,
        activeParticipantId: GOBLIN_A_ID,
      },
    };

    const { state: next } = applyWithCascade(
      state,
      stamped({
        type: 'ApplyDamage',
        actor: DIRECTOR_ACTOR,
        payload: {
          targetId: ALDRIC_ID,
          amount: 3,
          damageType: 'fire',
          sourceIntentId: 'src-2b-beat2',
          intent: 'kill',
        },
      }),
    );
    state = next;

    const aldric = getP(state, ALDRIC_ID);
    const wrath = aldric.heroicResources.find((r) => r.name === 'wrath');
    expect(wrath?.value).toBe(1);
    expect(aldric.perEncounterFlags.perRound.judgedTargetDamagedMe).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Beat 3 — Goblin-B damages Aldric → wrath UNCHANGED (not judged)
  // ──────────────────────────────────────────────────────────────────────────
  it('beat 3: Goblin-B damages Aldric → wrath unchanged (goblin-b not in judged list)', () => {
    // Set goblin-B as the active participant.
    state = {
      ...state,
      encounter: {
        ...state.encounter!,
        activeParticipantId: GOBLIN_B_ID,
      },
    };

    const { state: next } = applyWithCascade(
      state,
      stamped({
        type: 'ApplyDamage',
        actor: DIRECTOR_ACTOR,
        payload: {
          targetId: ALDRIC_ID,
          amount: 2,
          damageType: 'fire',
          sourceIntentId: 'src-2b-beat3',
          intent: 'kill',
        },
      }),
    );
    state = next;

    const aldric = getP(state, ALDRIC_ID);
    const wrath = aldric.heroicResources.find((r) => r.name === 'wrath');
    // Still 1 — goblin-b is not judged, and the per-round latch is already set anyway.
    expect(wrath?.value).toBe(1);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Beat 4 — Korva uses Mark on Goblin-A
  // ──────────────────────────────────────────────────────────────────────────
  it('beat 4: Korva UseAbility tactician-mark-t1 on Goblin-A → marked includes goblin-a', () => {
    const { state: next } = applyWithCascade(
      state,
      stamped({
        type: 'UseAbility',
        actor: DIRECTOR_ACTOR,
        payload: {
          participantId: KORVA_ID,
          abilityId: 'tactician-mark-t1',
          source: 'class',
          duration: { kind: 'end_of_encounter' },
          targetIds: [GOBLIN_A_ID],
        },
      }),
    );
    state = next;

    const korva = getP(state, KORVA_ID);
    expect(korva.targetingRelations.marked).toEqual([GOBLIN_A_ID]);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Beat 5 — Vex toggles Goblin-A into Null Field via SetTargetingRelation
  // ──────────────────────────────────────────────────────────────────────────
  it('beat 5: Vex SetTargetingRelation nullField Goblin-A present:true → nullField includes goblin-a', () => {
    const { state: next } = applyWithCascade(
      state,
      stamped({
        type: 'SetTargetingRelation',
        // Director actor satisfies isActiveDirector check in the reducer.
        actor: DIRECTOR_ACTOR,
        payload: {
          sourceId: VEX_ID,
          relationKind: 'nullField',
          targetId: GOBLIN_A_ID,
          present: true,
        },
      }),
    );
    state = next;

    const vex = getP(state, VEX_ID);
    expect(vex.targetingRelations.nullField).toEqual([GOBLIN_A_ID]);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Beat 6 — Aldric uses Judgment on Goblin-C (cap-1 replace)
  // Before: judged = [goblin-a]. After: judged = [goblin-c].
  // ──────────────────────────────────────────────────────────────────────────
  it('beat 6: Aldric UseAbility censor-judgment-t1 on Goblin-C (replace) → judged = [goblin-c]', () => {
    const { state: next } = applyWithCascade(
      state,
      stamped({
        type: 'UseAbility',
        actor: DIRECTOR_ACTOR,
        payload: {
          participantId: ALDRIC_ID,
          abilityId: 'censor-judgment-t1',
          source: 'class',
          duration: { kind: 'end_of_encounter' },
          targetIds: [GOBLIN_C_ID],
        },
      }),
    );
    state = next;

    const aldric = getP(state, ALDRIC_ID);
    // Mode is 'replace': goblin-a should be removed, goblin-c added.
    expect(aldric.targetingRelations.judged).toEqual([GOBLIN_C_ID]);
    expect(aldric.targetingRelations.judged).not.toContain(GOBLIN_A_ID);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Beat 7 — RemoveParticipant Goblin-A → strips dangling refs from Korva + Vex
  // ──────────────────────────────────────────────────────────────────────────
  it('beat 7: RemoveParticipant goblin-a → korva.marked=[], vex.nullField=[], goblin-a gone', () => {
    const { state: next } = applyWithCascade(
      state,
      stamped({
        type: 'RemoveParticipant',
        actor: DIRECTOR_ACTOR,
        payload: { participantId: GOBLIN_A_ID },
      }),
    );
    state = next;

    const korva = getP(state, KORVA_ID);
    expect(korva.targetingRelations.marked).toEqual([]);

    const vex = getP(state, VEX_ID);
    expect(vex.targetingRelations.nullField).toEqual([]);

    // Goblin-A is gone from the roster.
    const gA = state.participants.filter(isParticipant).find((p) => p.id === GOBLIN_A_ID);
    expect(gA).toBeUndefined();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Beat 8 — EndEncounter → all targetingRelations reset
  // ──────────────────────────────────────────────────────────────────────────
  it('beat 8: EndEncounter → all participants have empty targetingRelations', () => {
    const { state: next } = applyWithCascade(
      state,
      stamped({
        type: 'EndEncounter',
        actor: DIRECTOR_ACTOR,
        payload: { encounterId: ENC_ID },
      }),
    );
    state = next;

    expect(state.encounter).toBeNull();

    // Every surviving participant should have cleared targetingRelations.
    const all = state.participants.filter(isParticipant);
    for (const p of all) {
      expect(p.targetingRelations).toEqual({ judged: [], marked: [], nullField: [] });
    }
  });
});

// ---------------------------------------------------------------------------
// Supplemental: control participant (Eldra/Talent) is unaffected by targeting
// ---------------------------------------------------------------------------

describe('slice-2b integration — Talent (Eldra) is a clean control', () => {
  it('Eldra targetingRelations remain empty throughout the scenario', () => {
    // Re-run the full scenario up to just before EndEncounter and verify Eldra
    // was never touched by any of the targeting-relation machinery.
    let state = buildInitialState();
    derivedCounter = 0; // reset for determinism

    // Beat 1: Aldric judgment
    state = applyWithCascade(
      state,
      stamped({
        type: 'UseAbility',
        actor: DIRECTOR_ACTOR,
        payload: {
          participantId: ALDRIC_ID,
          abilityId: 'censor-judgment-t1',
          source: 'class',
          duration: { kind: 'end_of_encounter' },
          targetIds: [GOBLIN_A_ID],
        },
      }),
    ).state;

    // Beat 4: Korva mark
    state = applyWithCascade(
      state,
      stamped({
        type: 'UseAbility',
        actor: DIRECTOR_ACTOR,
        payload: {
          participantId: KORVA_ID,
          abilityId: 'tactician-mark-t1',
          source: 'class',
          duration: { kind: 'end_of_encounter' },
          targetIds: [GOBLIN_A_ID],
        },
      }),
    ).state;

    // Beat 5: Vex null field
    state = applyWithCascade(
      state,
      stamped({
        type: 'SetTargetingRelation',
        actor: DIRECTOR_ACTOR,
        payload: {
          sourceId: VEX_ID,
          relationKind: 'nullField',
          targetId: GOBLIN_A_ID,
          present: true,
        },
      }),
    ).state;

    const eldra = getP(state, ELDRA_ID);
    expect(eldra.targetingRelations).toEqual({ judged: [], marked: [], nullField: [] });
  });
});

// ---------------------------------------------------------------------------
// Supplemental: idempotent SetTargetingRelation
// ---------------------------------------------------------------------------

describe('slice-2b integration — SetTargetingRelation idempotency', () => {
  it('adding the same target twice is a no-op on the second dispatch', () => {
    let state = buildInitialState();
    derivedCounter = 0;

    // First add.
    state = applyWithCascade(
      state,
      stamped({
        type: 'SetTargetingRelation',
        actor: DIRECTOR_ACTOR,
        payload: {
          sourceId: VEX_ID,
          relationKind: 'nullField',
          targetId: GOBLIN_A_ID,
          present: true,
        },
      }),
    ).state;

    expect(getP(state, VEX_ID).targetingRelations.nullField).toEqual([GOBLIN_A_ID]);

    // Second add — same id — should not duplicate.
    state = applyWithCascade(
      state,
      stamped({
        type: 'SetTargetingRelation',
        actor: DIRECTOR_ACTOR,
        payload: {
          sourceId: VEX_ID,
          relationKind: 'nullField',
          targetId: GOBLIN_A_ID,
          present: true,
        },
      }),
    ).state;

    expect(getP(state, VEX_ID).targetingRelations.nullField).toEqual([GOBLIN_A_ID]);
  });

  it('removing a non-existent target is a no-op', () => {
    let state = buildInitialState();
    derivedCounter = 0;

    state = applyWithCascade(
      state,
      stamped({
        type: 'SetTargetingRelation',
        actor: DIRECTOR_ACTOR,
        payload: {
          sourceId: KORVA_ID,
          relationKind: 'marked',
          targetId: GOBLIN_B_ID,
          present: false,
        },
      }),
    ).state;

    expect(getP(state, KORVA_ID).targetingRelations.marked).toEqual([]);
  });
});
