import { GainResourcePayloadSchema, type Participant } from '@ironyard/shared';
import { refLabel, resolveResource, updateExtra, updateHeroic } from '../resources';
import type { CampaignState, IntentResult, StampedIntent } from '../types';
import { isParticipant } from '../types';

// Slice 7: increment a heroic / extras resource on a participant. `amount` is
// signed — negative values are allowed but rejected with `floor_breach` if
// `value + amount < floor`. The reducer never silently allocates a missing
// resource (use SetResource with `initialize` for that — keeps a Conduit from
// accidentally gaining a Wrath pool).
export function applyGainResource(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = GainResourcePayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `GainResource rejected: ${parsed.error.message}`,
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

  const { participantId, name, amount } = parsed.data;
  const participants = state.participants.filter(isParticipant);
  const target = participants.find((p) => p.id === participantId);
  if (!target) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: `target ${participantId} not found`, intentId: intent.id }],
      errors: [{ code: 'target_missing', message: `${participantId} not in encounter` }],
    };
  }

  const resolved = resolveResource(target, name);
  const label = refLabel(name);
  if (!resolved) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `${target.name} has no ${label} pool; initialize via SetResource first`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'resource_missing', message: `${label} not allocated on ${participantId}` }],
    };
  }

  const next = resolved.instance.value + amount;
  if (next < resolved.instance.floor) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `GainResource rejected: ${target.name} ${label} would drop below floor ${resolved.instance.floor}`,
          intentId: intent.id,
        },
      ],
      errors: [
        {
          code: 'floor_breach',
          message: `${next} < floor ${resolved.instance.floor}`,
        },
      ],
    };
  }

  const capped = resolved.instance.max !== undefined ? Math.min(next, resolved.instance.max) : next;
  const updatedInstance = { ...resolved.instance, value: capped };
  let updatedTarget: Participant;
  if (resolved.kind === 'heroic') {
    updatedTarget = updateHeroic(target, resolved.index, {
      ...updatedInstance,
      name: resolved.instance.name,
    });
  } else {
    updatedTarget = updateExtra(target, resolved.index, {
      ...updatedInstance,
      name: resolved.instance.name,
    });
  }
  const updatedParticipants = state.participants.map((p) =>
    isParticipant(p) && p.id === participantId ? updatedTarget : p,
  );

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      participants: updatedParticipants,
    },
    derived: [],
    log: [
      {
        kind: 'info',
        text: `${target.name} ${amount >= 0 ? 'gains' : 'loses'} ${Math.abs(amount)} ${label} (${resolved.instance.value} → ${capped})`,
        intentId: intent.id,
      },
    ],
  };
}
