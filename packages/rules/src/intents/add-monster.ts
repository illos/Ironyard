import { AddMonsterPayloadSchema, type Monster, type Participant, ulid } from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';

// Convert a Monster stat block into a lobby Participant. Named separately from
// the handler so tests and future helpers can call it directly.
export function participantFromMonster(
  monster: Monster,
  opts: { id: string; name: string },
): Participant {
  return {
    id: opts.id,
    name: opts.name,
    kind: 'monster',
    level: monster.level,
    currentStamina: monster.stamina.base,
    maxStamina: monster.stamina.base,
    characteristics: monster.characteristics,
    immunities: monster.immunities,
    weaknesses: monster.weaknesses,
    conditions: [],
    heroicResources: [],
    extras: [],
    surges: 0,
    recoveries: { current: 0, max: 0 },
    recoveryValue: 0,
    ownerId: null,
    characterId: null,
  };
}

export function applyAddMonster(state: CampaignState, intent: StampedIntent): IntentResult {
  if (intent.actor.userId !== state.activeDirectorId) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: 'AddMonster requires active director', intentId: intent.id }],
      errors: [
        { code: 'not_active_director', message: 'only the active director may add monsters' },
      ],
    };
  }

  const parsed = AddMonsterPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `AddMonster rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }

  const { quantity, nameOverride, monster } = parsed.data;
  const baseName = nameOverride ?? monster.name;
  const newParticipants: Participant[] = Array.from({ length: quantity }).map((_, i) => {
    const suffix = quantity > 1 ? ` ${i + 1}` : '';
    return participantFromMonster(monster, { id: ulid(), name: `${baseName}${suffix}` });
  });

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      participants: [...state.participants, ...newParticipants],
    },
    derived: [],
    log: [
      {
        kind: 'info',
        text: `added ${quantity}× ${baseName}`,
        intentId: intent.id,
      },
    ],
  };
}
