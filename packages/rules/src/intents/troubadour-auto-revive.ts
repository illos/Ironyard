import { TroubadourAutoRevivePayloadSchema } from '@ironyard/shared';
import { recomputeStaminaState } from '../stamina';
import type { CampaignState, IntentResult, StampedIntent } from '../types';
import { isParticipant } from '../types';

// Pass 3 Slice 2a — Troubadour posthumous Drama auto-revive.
//
// Fired (server-only) as the cash-out half of the troubadour-auto-revive OA
// once the Director (or another player) claims it from the OA stack. The
// preceding RaiseOpenAction was emitted by gain-resource when a posthumous-
// eligible Troubadour's drama crossed 30 (Task 28). This reducer restores the
// Troubadour to life:
//   • currentStamina → 1 (rises out of dead/dying)
//   • drama resource value → 0 (if present in heroicResources)
//   • posthumousDramaEligible → false (one-shot consumed)
//   • troubadourReviveOARaised latch → false (allow future re-arm in a new encounter)
// staminaState is recomputed via the canonical derivation in stamina.ts;
// transitioning from dead → winded does not emit StaminaTransitioned here —
// that event substrate is owned by apply-damage / apply-heal sites in slice 1.
//
// Server-only — present in SERVER_ONLY_INTENTS (Task 6). Lobby envelope rejects
// client dispatch.
export function applyTroubadourAutoRevive(
  state: CampaignState,
  intent: StampedIntent,
): IntentResult {
  const parsed = TroubadourAutoRevivePayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `TroubadourAutoRevive rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }
  const { participantId } = parsed.data;
  const target = state.participants.filter(isParticipant).find((p) => p.id === participantId);
  if (!target || target.kind !== 'pc') {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `TroubadourAutoRevive: PC participant ${participantId} not found`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'participant_not_found', message: `No PC with id ${participantId}` }],
    };
  }

  // Build the post-revive participant in two steps: (1) field writes,
  // (2) recompute staminaState off the new currentStamina.
  const heroicResources = target.heroicResources.map((r) =>
    r.name === 'drama' ? { ...r, value: 0 } : r,
  );
  const intermediate = {
    ...target,
    currentStamina: 1,
    heroicResources,
    posthumousDramaEligible: false,
    perEncounterFlags: {
      ...target.perEncounterFlags,
      perEncounter: {
        ...target.perEncounterFlags.perEncounter,
        troubadourReviveOARaised: false,
      },
    },
  };
  const { newState: staminaState } = recomputeStaminaState(intermediate);
  const updated = { ...intermediate, staminaState };

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      participants: state.participants.map((p) =>
        isParticipant(p) && p.id === participantId ? updated : p,
      ),
    },
    derived: [],
    log: [
      {
        kind: 'info',
        text: `${target.name} auto-revived by posthumous Drama (stamina → 1)`,
        intentId: intent.id,
      },
    ],
  };
}
