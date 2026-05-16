import { StopMaintenancePayloadSchema } from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';
import { isParticipant } from '../types';

// Pass 3 Slice 2a — Elementalist Maintenance state machine.
//
// Drops an ability from the participant's `maintainedAbilities` list so the
// per-turn Essence cost stops applying on subsequent StartTurns. Idempotent:
// silent no-op when the participant is missing, not a PC, or wasn't
// maintaining the named ability — these are not error conditions because the
// state-of-the-world the caller intended is already true.
export function applyStopMaintenance(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = StopMaintenancePayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `StopMaintenance rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }
  const { participantId, abilityId } = parsed.data;
  const target = state.participants.filter(isParticipant).find((p) => p.id === participantId);
  if (!target || target.kind !== 'pc') {
    // Silent no-op — idempotent per spec.
    return { state, derived: [], log: [] };
  }
  const filtered = target.maintainedAbilities.filter((m) => m.abilityId !== abilityId);
  if (filtered.length === target.maintainedAbilities.length) {
    // Wasn't being maintained — silent no-op.
    return { state, derived: [], log: [] };
  }
  const updated = { ...target, maintainedAbilities: filtered };
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
        text: `${target.name} stopped maintaining ${abilityId}`,
        intentId: intent.id,
      },
    ],
  };
}
