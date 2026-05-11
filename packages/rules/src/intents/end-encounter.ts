import { EndEncounterPayloadSchema, type Participant } from '@ironyard/shared';
import { requireCanon } from '../require-canon';
import type { CampaignState, IntentResult, RosterEntry, StampedIntent } from '../types';
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
// idiom; today every cited slug is ✅ so the resets always run. If a slug
// regresses to 🚧 (e.g. someone edits canon §5.4), the reducer falls back to
// leaving that pool untouched and logs a `manual_override_required` entry.

// Pure helper. Exported for the unit test — and so a future EndEncounter
// extension (10th-level epic-secondary `persistent` flag, etc.) can be
// composed against this without re-implementing the per-participant walk.
export function resetParticipantForEndOfEncounter(p: Participant): Participant {
  const resetHeroic = requireCanon('heroic-resources-and-surges.other-classes')
    ? p.heroicResources.map((r) => ({ ...r, value: 0 }))
    : p.heroicResources;
  // Extras have no `persistent` flag today (slice 7); reset all. When the
  // Censor Virtue / Conduit Divine Power 10th-level epic-secondaries land,
  // add a `persistent: true` skip here.
  const resetExtras = requireCanon('heroic-resources-and-surges.other-classes')
    ? p.extras.map((r) => ({ ...r, value: 0 }))
    : p.extras;
  const resetSurges = requireCanon('heroic-resources-and-surges.surges') ? 0 : p.surges;
  // Data-driven condition clearing — no canon slug needed beyond the slice-5
  // condition data model.
  const filteredConditions = p.conditions.filter((c) => c.duration.kind !== 'end_of_encounter');
  return {
    ...p,
    heroicResources: resetHeroic,
    extras: resetExtras,
    surges: resetSurges,
    conditions: filteredConditions,
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
  // PC placeholders are preserved as-is (they have no encounter-scoped state).
  const resetParticipants: RosterEntry[] = state.participants.map((entry) =>
    isParticipant(entry) ? resetParticipantForEndOfEncounter(entry) : entry,
  );

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      participants: resetParticipants,
      encounter: null,
    },
    derived: [],
    log: [
      {
        kind: 'info',
        text: `encounter ${encounterId} ended; resources, surges, malice reset`,
        intentId: intent.id,
      },
    ],
  };
}
