import { SpendMalicePayloadSchema } from '@ironyard/shared';
import { evaluateActionTriggers } from '../class-triggers/action-triggers';
import type { CampaignState, DerivedIntent, IntentResult, StampedIntent } from '../types';

// Slice 7: subtract from the Director's Malice counter (canon §5.5). No
// `insufficient_malice` rejection — canon explicitly permits going negative
// ("Negative Malice. Some abilities can drive Malice below 0...").
export function applySpendMalice(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = SpendMalicePayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `SpendMalice rejected: ${parsed.error.message}`,
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

  const { amount, reason } = parsed.data;
  const before = state.encounter.malice.current;
  const after = before - amount;

  const nextState: CampaignState = {
    ...state,
    seq: state.seq + 1,
    encounter: {
      ...state.encounter,
      malice: { ...state.encounter.malice, current: after },
    },
  };

  // Pass 3 Slice 2a — action-event class-trigger evaluation.
  // Null's Discipline trigger 1 (canon §5.4.5): on director malice spend,
  // every Null gains 1 discipline (latched per-round). Per-class evaluator
  // emits GainResource + per-round latch flip; we decorate each derived
  // intent with `causedBy: intent.id` so the audit log can trace the chain
  // back to the originating SpendMalice.
  const derived: DerivedIntent[] = [];
  const triggerDerived = evaluateActionTriggers(
    nextState,
    { kind: 'malice-spent', amount },
    { actor: intent.actor, rolls: {} },
  );
  for (const d of triggerDerived) {
    derived.push({ ...d, causedBy: intent.id });
  }

  return {
    state: nextState,
    derived,
    log: [
      {
        kind: 'info',
        text: `Director spends ${amount} Malice${reason ? ` (${reason})` : ''} (${before} → ${after})`,
        intentId: intent.id,
      },
    ],
  };
}
