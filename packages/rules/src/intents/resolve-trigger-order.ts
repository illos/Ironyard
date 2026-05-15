import { IntentTypes, ResolveTriggerOrderPayloadSchema } from '@ironyard/shared';
import type { CampaignState, DerivedIntent, IntentResult, StampedIntent } from '../types';

export function applyResolveTriggerOrder(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = ResolveTriggerOrderPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: `ResolveTriggerOrder rejected: ${parsed.error.message}`, intentId: intent.id }],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }

  // Active-director-only.
  if (intent.actor.userId !== state.activeDirectorId) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: 'ResolveTriggerOrder rejected: director only', intentId: intent.id }],
      errors: [{ code: 'not_authorized', message: 'director only' }],
    };
  }

  const pt = state.encounter?.pendingTriggers ?? null;
  if (pt === null) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: 'ResolveTriggerOrder rejected: no pending triggers', intentId: intent.id }],
      errors: [{ code: 'no_pending_triggers', message: 'no pending triggers' }],
    };
  }

  if (pt.id !== parsed.data.pendingTriggerSetId) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: 'ResolveTriggerOrder rejected: pendingTriggerSetId mismatch', intentId: intent.id }],
      errors: [{ code: 'id_mismatch', message: 'pendingTriggerSetId mismatch' }],
    };
  }

  // Order set must exactly match candidate set (no missing, no extras, no duplicates).
  const orderSet = new Set(parsed.data.order);
  if (orderSet.size !== parsed.data.order.length) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: 'ResolveTriggerOrder rejected: order has duplicates', intentId: intent.id }],
      errors: [{ code: 'order_duplicates', message: 'order has duplicates' }],
    };
  }

  const candidateIds = pt.candidates.map((c) => c.participantId).sort();
  const orderIds = [...parsed.data.order].sort();
  if (candidateIds.join('|') !== orderIds.join('|')) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: 'ResolveTriggerOrder rejected: order set mismatch', intentId: intent.id }],
      errors: [{ code: 'order_mismatch', message: 'order set mismatch' }],
    };
  }

  // Build ExecuteTrigger derived intents in the chosen order.
  const derived: DerivedIntent[] = parsed.data.order.map((participantId) => {
    const cand = pt.candidates.find((c) => c.participantId === participantId)!;
    return {
      type: IntentTypes.ExecuteTrigger,
      source: 'server' as const,
      actor: intent.actor,
      causedBy: intent.id,
      payload: {
        participantId,
        triggeredActionId: cand.triggeredActionId,
        triggerEvent: pt.triggerEvent,
      },
    };
  });

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      encounter: state.encounter ? { ...state.encounter, pendingTriggers: null } : null,
    },
    derived,
    log: [
      {
        kind: 'info',
        text: `Trigger order resolved: ${parsed.data.order.join(' → ')}`,
        intentId: intent.id,
      },
    ],
  };
}
