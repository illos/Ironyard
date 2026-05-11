import { IntentTypes, SpendRecoveryPayloadSchema } from '@ironyard/shared';
import { requireCanon } from '../require-canon';
import type { CampaignState, DerivedIntent, IntentResult, StampedIntent } from '../types';

// Slice 7: pay 1 recovery and dispatch a derived ApplyHeal for `recoveryValue`
// HP (canon §2.13). Recoveries are encounter-spanning (not reset per turn);
// the dispatcher / character sheet sets `recoveryValue` (typically
// maxStamina/3 rounded down) on character creation.
export function applySpendRecovery(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = SpendRecoveryPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `SpendRecovery rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }

  if (!state.encounter) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: 'no active encounter', intentId: intent.id }],
      errors: [{ code: 'no_active_encounter', message: 'no active encounter' }],
    };
  }

  const { participantId } = parsed.data;
  const target = state.participants.find((p) => p.id === participantId);
  if (!target) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: `target ${participantId} not found`, intentId: intent.id }],
      errors: [{ code: 'target_missing', message: `${participantId} not in encounter` }],
    };
  }

  if (target.recoveries.current <= 0) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `SpendRecovery rejected: ${target.name} has 0 recoveries`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'no_recoveries', message: `${target.name} has 0 recoveries` }],
    };
  }

  const updatedTarget = {
    ...target,
    recoveries: { ...target.recoveries, current: target.recoveries.current - 1 },
  };
  const updatedParticipants = state.participants.map((p) =>
    p.id === participantId ? updatedTarget : p,
  );

  const derived: DerivedIntent[] = [];
  // The ApplyHeal dispatch is canon §2.13 (recoveries). Gate the auto-fire on
  // the recoveries slug; if `recoveryValue === 0` we still pay the recovery
  // but no derived heal fires (degenerate but honest — the dispatcher might
  // not have set the value yet).
  if (requireCanon('damage-application.recoveries') && target.recoveryValue > 0) {
    derived.push({
      actor: intent.actor,
      source: 'auto' as const,
      type: IntentTypes.ApplyHeal,
      payload: { targetId: participantId, amount: target.recoveryValue },
      causedBy: intent.id,
    });
  }

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      participants: updatedParticipants,
    },
    derived,
    log: [
      {
        kind: 'info',
        text: `${target.name} spends 1 recovery (${target.recoveries.current} → ${updatedTarget.recoveries.current})`,
        intentId: intent.id,
      },
    ],
  };
}
