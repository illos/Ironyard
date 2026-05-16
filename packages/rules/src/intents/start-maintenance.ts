import { StartMaintenancePayloadSchema } from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';
import { isParticipant } from '../types';
import { resolveParticipantClass } from '../class-triggers/helpers';

// Pass 3 Slice 2a — Elementalist Maintenance state machine.
//
// The Elementalist class can keep abilities active across turns by paying a
// per-turn Essence cost. This reducer registers the abilityId on the
// participant's `maintainedAbilities` list; per-turn deduction lives in
// StartTurn (Task 25). The per-turn cost auto-drops the maintained ability
// when Essence would go negative.
//
// Player-trust: dispatched by the Elementalist's owner (UI-gated by
// StartMaintenanceModal). Server-only validation: target must be the
// Elementalist class, and the same ability cannot be doubly-maintained.
export function applyStartMaintenance(
  state: CampaignState,
  intent: StampedIntent,
): IntentResult {
  const parsed = StartMaintenancePayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `StartMaintenance rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }
  const { participantId, abilityId, costPerTurn } = parsed.data;
  const target = state.participants.filter(isParticipant).find((p) => p.id === participantId);
  if (!target || target.kind !== 'pc') {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `StartMaintenance: PC participant ${participantId} not found`,
          intentId: intent.id,
        },
      ],
      errors: [
        { code: 'participant_not_found', message: `No PC with id ${participantId}` },
      ],
    };
  }
  if (resolveParticipantClass(state, target) !== 'elementalist') {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `StartMaintenance: ${target.name} is not an Elementalist`,
          intentId: intent.id,
        },
      ],
      errors: [
        { code: 'not_elementalist', message: 'Only Elementalists can start maintenance' },
      ],
    };
  }
  if (target.maintainedAbilities.some((m) => m.abilityId === abilityId)) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `StartMaintenance: ${abilityId} already maintained by ${target.name}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'already_maintained', message: `${abilityId} already maintained` }],
    };
  }
  const startedAtRound = state.encounter?.currentRound ?? 1;
  const updated = {
    ...target,
    maintainedAbilities: [
      ...target.maintainedAbilities,
      { abilityId, costPerTurn, startedAtRound },
    ],
  };
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
        text: `${target.name} began maintaining ${abilityId} (${costPerTurn}/turn)`,
        intentId: intent.id,
      },
    ],
  };
}
