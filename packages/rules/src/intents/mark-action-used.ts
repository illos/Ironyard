import { MarkActionUsedPayloadSchema } from '@ironyard/shared';
import { evaluateActionTriggers } from '../class-triggers/action-triggers';
import type { CampaignState, DerivedIntent, IntentResult, StampedIntent } from '../types';
import { isParticipant } from '../types';

export function applyMarkActionUsed(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = MarkActionUsedPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `MarkActionUsed rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }

  const { participantId, slot, used } = parsed.data;

  const target = state.participants.find((p) => isParticipant(p) && p.id === participantId);
  if (!target || !isParticipant(target)) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `MarkActionUsed: participant ${participantId} not found`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'participant_not_found', message: participantId }],
    };
  }

  // Role gate: actor must own the participant OR be the active director.
  const isOwner = target.ownerId !== null && target.ownerId === intent.actor.userId;
  const isActiveDirector = state.activeDirectorId === intent.actor.userId;
  if (!isOwner && !isActiveDirector) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `MarkActionUsed: forbidden — ${intent.actor.userId} cannot mark slot on ${participantId}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'forbidden', message: 'actor cannot mark this slot' }],
    };
  }

  const nextState: CampaignState = {
    ...state,
    seq: state.seq + 1,
    participants: state.participants.map((p) =>
      isParticipant(p) && p.id === participantId
        ? { ...p, turnActionUsage: { ...p.turnActionUsage, [slot]: used } }
        : p,
    ),
  };

  // Pass 3 Slice 2b — action-event class-trigger evaluation.
  // Null's Discipline trigger 2 (canon §5.4.5): when an enemy uses a main
  // action while in this Null's active Null Field, auto-apply GainResource
  // + SetParticipantPerRoundFlag since we now track nullField in targetingRelations.
  // Only fires for the 'main' slot on `used: true`.
  //
  // Phase 2b 2b.16 B18 — gate on engine-derived sources (`'auto'` from
  // RollPower / triggered ability dispatches, or `'server'` from the DO).
  // Manual director / player toggles of the action slot (e.g. fixing a
  // misclick) must NOT mint Discipline since they don't represent a real
  // action use.
  const derived: DerivedIntent[] = [];
  if (slot === 'main' && used && intent.source !== 'manual') {
    const triggerDerived = evaluateActionTriggers(
      nextState,
      { kind: 'main-action-used', actorId: participantId },
      { actor: intent.actor, rolls: {} },
    );
    for (const d of triggerDerived) {
      derived.push({ ...d, causedBy: intent.id });
    }
  }

  return {
    state: nextState,
    derived,
    log: [
      {
        kind: 'info',
        text: `${target.name} ${used ? 'used' : 'cleared'} ${slot}`,
        intentId: intent.id,
      },
    ],
  };
}
