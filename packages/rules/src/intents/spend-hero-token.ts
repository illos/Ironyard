import { IntentTypes, SpendHeroTokenPayloadSchema } from '@ironyard/shared';
import type {
  CampaignState,
  DerivedIntent,
  IntentResult,
  StampedIntent,
} from '../types';
import { isParticipant } from '../types';

export function applySpendHeroToken(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = SpendHeroTokenPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        { kind: 'error', text: `SpendHeroToken rejected: ${parsed.error.message}`, intentId: intent.id },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }

  if (state.currentSessionId === null) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: 'no active session', intentId: intent.id }],
      errors: [{ code: 'no_active_session', message: 'no session is active' }],
    };
  }

  const { amount, reason, participantId } = parsed.data;

  // Reason / amount coherence: surge_burst must be 1, regain_stamina must be 2.
  if (reason === 'surge_burst' && amount !== 1) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: 'surge_burst requires amount 1', intentId: intent.id }],
      errors: [
        { code: 'invalid_spend_reason', message: 'surge_burst requires amount 1' },
      ],
    };
  }
  if (reason === 'regain_stamina' && amount !== 2) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: 'regain_stamina requires amount 2', intentId: intent.id }],
      errors: [
        { code: 'invalid_spend_reason', message: 'regain_stamina requires amount 2' },
      ],
    };
  }

  if (state.heroTokens < amount) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `insufficient tokens (have ${state.heroTokens}, need ${amount})`,
          intentId: intent.id,
        },
      ],
      errors: [
        { code: 'insufficient_tokens', message: `have ${state.heroTokens}, need ${amount}` },
      ],
    };
  }

  // Build derived intent per reason.
  const derived: DerivedIntent[] = [];

  if (reason === 'surge_burst') {
    derived.push({
      type: IntentTypes.GainResource,
      actor: intent.actor,
      source: 'auto' as const,
      causedBy: intent.id,
      payload: { participantId, name: 'surges', amount: 2 },
    });
  } else if (reason === 'regain_stamina') {
    // ApplyHeal needs participant.recoveryValue; require participant in encounter.
    const participant = state.participants
      .filter(isParticipant)
      .find((p) => p.id === participantId);
    if (!participant) {
      return {
        state,
        derived: [],
        log: [
          {
            kind: 'error',
            text: `participant ${participantId} not in active encounter`,
            intentId: intent.id,
          },
        ],
        errors: [
          {
            code: 'participant_not_in_encounter',
            message: `${participantId} must be in the active encounter to regain stamina`,
          },
        ],
      };
    }
    derived.push({
      type: IntentTypes.ApplyHeal,
      actor: intent.actor,
      source: 'auto' as const,
      causedBy: intent.id,
      payload: { targetId: participantId, amount: participant.recoveryValue },
    });
  }
  // 'narrative' emits nothing — table narrates.

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      heroTokens: state.heroTokens - amount,
    },
    derived,
    log: [
      {
        kind: 'info',
        text: `${participantId} spends ${amount} hero token(s) — ${reason}`,
        intentId: intent.id,
      },
    ],
  };
}
