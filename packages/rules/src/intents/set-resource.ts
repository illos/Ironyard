import {
  type ExtraResourceInstance,
  type HeroicResourceInstance,
  type Participant,
  SetResourcePayloadSchema,
} from '@ironyard/shared';
import {
  appendExtra,
  appendHeroic,
  refLabel,
  resolveResource,
  updateExtra,
  updateHeroic,
} from '../resources';
import type { CampaignState, IntentResult, StampedIntent } from '../types';
import { isParticipant } from '../types';

// Slice 7: manual override path for resources. Ignores floor and ceiling
// (Director-typed integer fits in any integer). If the resource isn't yet
// allocated, `initialize` provides max/floor — Talent dispatchers pass
// `initialize.floor = -(1 + Reason)`.
export function applySetResource(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = SetResourcePayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `SetResource rejected: ${parsed.error.message}`,
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

  const { participantId, name, value, initialize } = parsed.data;
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

  let updatedTarget: Participant;
  if (resolved) {
    // Replace existing value, ignoring floor and ceiling (override path).
    if (resolved.kind === 'heroic') {
      updatedTarget = updateHeroic(target, resolved.index, { ...resolved.instance, value });
    } else {
      updatedTarget = updateExtra(target, resolved.index, { ...resolved.instance, value });
    }
  } else {
    if (!initialize) {
      return {
        state,
        derived: [],
        log: [
          {
            kind: 'error',
            text: `SetResource rejected: ${target.name} has no ${label} pool and no initialize block`,
            intentId: intent.id,
          },
        ],
        errors: [
          {
            code: 'resource_missing',
            message: `${label} not allocated; pass initialize to create it`,
          },
        ],
      };
    }
    if (typeof name === 'string') {
      const fresh: HeroicResourceInstance = {
        name,
        value,
        ...(initialize.max !== undefined ? { max: initialize.max } : {}),
        floor: initialize.floor ?? 0,
      };
      updatedTarget = appendHeroic(target, fresh);
    } else {
      const fresh: ExtraResourceInstance = {
        name: name.extra,
        value,
        ...(initialize.max !== undefined ? { max: initialize.max } : {}),
        floor: initialize.floor ?? 0,
      };
      updatedTarget = appendExtra(target, fresh);
    }
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
        text: `${target.name} ${label} set to ${value} (manual_override)`,
        intentId: intent.id,
      },
    ],
  };
}
