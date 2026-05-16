import {
  EndEncounterPayloadSchema,
  IntentTypes,
  defaultPerEncounterLatches,
  defaultTargetingRelations,
  type Participant,
} from '@ironyard/shared';
import { requireCanon } from '../require-canon';
import type {
  CampaignState,
  DerivedIntent,
  IntentResult,
  RosterEntry,
  StampedIntent,
} from '../types';
import { isParticipant } from '../types';

// Phase 1 cleanup: closes out the active encounter. Walks every participant
// and resets the encounter-scoped pools (heroicResources, extras, surges per
// canon §5.4/§5.6) to 0, strips conditions whose duration is
// `end_of_encounter`, then wipes Director's Malice (canon §5.5) and sets
// `encounter` to null. Recoveries are NOT touched (canon §2.13 —
// respite-only). No derived intents — this is a single atomic state-machine
// transition (matches StartEncounter's shape).
//
// Auto-apply branches are wrapped in `requireCanon` to preserve the canon-gate
// idiom. The encounter-scoped soft-reset rule ("at end of encounter, remaining
// resource is lost / any negative resets to 0") is canon-verified independently
// for both Talent (§ 5.3 line 767) and the other 8 classes (§ 5.4.9 explicitly
// labels the shared shape `lifecycle: 'encounter_scoped'`). Both PDF and
// SteelCompendium agree. We gate against `heroic-resources-and-surges.talent-
// clarity` because that slug stays ✅ when § 5.4 itself flips to 🚧 over the
// (separate) class-δ trigger over-firing stubs (Censor isJudgedBy, Null
// hasActiveNullField, Tactician isMarkedBy) and the Fury 1d3-vs-1 bug. Those
// trigger bugs do NOT contaminate the lifecycle clause — keying the reset off
// `talent-clarity` keeps the universally-correct lifecycle running while the
// trigger code is behind manual-override.

// Pure helper. Exported for the unit test — and so a future EndEncounter
// extension (10th-level epic-secondary `persistent` flag, etc.) can be
// composed against this without re-implementing the per-participant walk.
export function resetParticipantForEndOfEncounter(p: Participant): Participant {
  const resetHeroic = requireCanon('heroic-resources-and-surges.talent-clarity')
    ? p.heroicResources.map((r) => ({ ...r, value: 0 }))
    : p.heroicResources;
  // Extras have no `persistent` flag today (slice 7); reset all. When the
  // Censor Virtue / Conduit Divine Power 10th-level epic-secondaries land,
  // add a `persistent: true` skip here.
  const resetExtras = requireCanon('heroic-resources-and-surges.talent-clarity')
    ? p.extras.map((r) => ({ ...r, value: 0 }))
    : p.extras;
  const resetSurges = requireCanon('heroic-resources-and-surges.surges') ? 0 : p.surges;
  // Data-driven condition clearing — no canon slug needed beyond the slice-5
  // condition data model.
  const filteredConditions = p.conditions.filter((c) => c.duration.kind !== 'end_of_encounter');
  // All active-ability tags drop at encounter end — both 'EoT' (residual from
  // a turn that didn't reach EndTurn) and 'end_of_encounter' kinds clear.
  return {
    ...p,
    heroicResources: resetHeroic,
    extras: resetExtras,
    surges: resetSurges,
    conditions: filteredConditions,
    activeAbilities: [],
    // recoveries: not touched (canon §2.13 — respite-only).
  };
}

export function applyEndEncounter(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = EndEncounterPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `EndEncounter rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }

  const { encounterId } = parsed.data;

  // Idempotent no-op: dispatching EndEncounter when none is active is logged
  // but does not error. Bumps seq so the intent still appears in the log.
  if (!state.encounter) {
    return {
      state: { ...state, seq: state.seq + 1 },
      derived: [],
      log: [
        {
          kind: 'info',
          text: 'no active encounter to end (idempotent)',
          intentId: intent.id,
        },
      ],
    };
  }

  if (state.encounter.id !== encounterId) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `cannot end ${encounterId}: active encounter is ${state.encounter.id}`,
          intentId: intent.id,
        },
      ],
      errors: [
        {
          code: 'wrong_encounter',
          message: `active encounter id is ${state.encounter.id}`,
        },
      ],
    };
  }

  // Reset every participant's encounter-scoped pools and conditions.
  // Participants survive EndEncounter at the campaign level (lobby-persistent).
  const resetParticipants: RosterEntry[] = state.participants.map((entry) =>
    isParticipant(entry) ? resetParticipantForEndOfEncounter(entry) : entry,
  );

  // Pass 3 Slice 1 — fire doomed dieAtEncounterEnd: transition any participant
  // with staminaOverride.kind === 'doomed' && dieAtEncounterEnd === true to
  // 'dead'. Emit a StaminaTransitioned derived intent for each.
  const derived: DerivedIntent[] = [];
  const finalParticipants: RosterEntry[] = resetParticipants.map((entry) => {
    if (!isParticipant(entry)) return entry;
    if (entry.staminaOverride?.kind === 'doomed' && entry.staminaOverride.dieAtEncounterEnd) {
      derived.push({
        actor: intent.actor,
        source: 'server' as const,
        type: IntentTypes.StaminaTransitioned,
        payload: {
          participantId: entry.id,
          from: entry.staminaState,
          to: 'dead',
          cause: 'encounter-end',
        },
        causedBy: intent.id,
      });
      return {
        ...entry,
        currentStamina: -entry.maxStamina - 1,
        staminaState: 'dead' as const,
        staminaOverride: null,
        conditions: [],
      };
    }
    return entry;
  });

  // Pass 3 Slice 2a — per-PC cleanup (canon § 5.4 encounter-scoped soft-reset):
  //   1. Reset `perEncounterFlags.perEncounter` latches to defaults so the next
  //      encounter starts with a clean Fury winded/dying ledger, Troubadour
  //      drama gates, etc.
  //   2. Clear `posthumousDramaEligible` on any PC still at `staminaState ===
  //      'dead'` after the dieAtEncounterEnd pass — locks in canon's "no future
  //      encounters" path; an alive (e.g. auto-revived) PC keeps their flag
  //      state (it's already false by Troubadour reducers in that case).
  //   3. Drop every PC's `maintainedAbilities` to []. Maintenance is
  //      encounter-scoped per canon § 5.4; new encounters start with no
  //      maintained loops.
  // perTurn entries and perRound flags are NOT touched here — StartTurn (slice
  // 2a Task 25) clears perTurn entries scoped to the starting participant and
  // EndRound clears the perRound record. EndEncounter is the catch-all for the
  // `perEncounter` latches only.
  const slice2aParticipants: RosterEntry[] = finalParticipants.map((entry) => {
    if (!isParticipant(entry)) return entry;
    if (entry.kind !== 'pc') {
      // Slice 2b — monsters/non-PC entries: only targetingRelations need clearing.
      // (They don't carry perEncounterFlags or maintainedAbilities reset semantics.)
      return { ...entry, targetingRelations: defaultTargetingRelations() };
    }
    return {
      ...entry,
      perEncounterFlags: {
        ...entry.perEncounterFlags,
        perEncounter: defaultPerEncounterLatches(),
      },
      posthumousDramaEligible:
        entry.staminaState === 'dead' ? false : entry.posthumousDramaEligible,
      maintainedAbilities: [],
      targetingRelations: defaultTargetingRelations(),
    };
  });

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      participants: slice2aParticipants,
      encounter: null,
      openActions: [],
    },
    derived,
    log: [
      {
        kind: 'info',
        text: `encounter ${encounterId} ended; resources, surges, openActions cleared`,
        intentId: intent.id,
      },
    ],
  };
}
