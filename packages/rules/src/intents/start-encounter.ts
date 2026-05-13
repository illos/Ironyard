import {
  type Participant,
  StartEncounterPayloadSchema,
  type TypedResistance,
  ulid,
} from '@ironyard/shared';
import { participantFromMonster } from './add-monster';
import { deriveCharacterRuntime } from '../derive-character-runtime';
import type {
  CampaignState,
  EncounterPhase,
  IntentResult,
  ReducerContext,
  StampedIntent,
} from '../types';

export function applyStartEncounter(
  state: CampaignState,
  intent: StampedIntent,
  ctx: ReducerContext,
): IntentResult {
  const parsed = StartEncounterPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `StartEncounter rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }

  if (state.encounter !== null) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `cannot start encounter: ${state.encounter.id} is already active`,
          intentId: intent.id,
        },
      ],
      errors: [
        {
          code: 'encounter_already_active',
          message: 'an encounter is already in progress',
        },
      ],
    };
  }

  // Materialize PC participants from DO-stamped character blobs.
  const pcParticipants: Participant[] = parsed.data.stampedPcs.map((stamped) => {
    const runtime = deriveCharacterRuntime(stamped.character, ctx.staticData);

    // Apply persisted stamina: null means fresh (use derived max).
    const currentStamina =
      stamped.character.currentStamina !== null
        ? Math.min(stamped.character.currentStamina, runtime.maxStamina)
        : runtime.maxStamina;

    // Recoveries: start with max, subtract how many were used before respite.
    const recoveriesUsed = stamped.character.recoveriesUsed;
    const recoveriesCurrent = Math.max(0, runtime.recoveriesMax - recoveriesUsed);

    return {
      id: `pc:${stamped.characterId}`,
      name: stamped.name,
      kind: 'pc',
      ownerId: stamped.ownerId,
      characterId: stamped.characterId,
      level: stamped.character.level,
      currentStamina,
      maxStamina: runtime.maxStamina,
      characteristics: runtime.characteristics,
      immunities: runtime.immunities.map((r) => ({
        type: r.kind as TypedResistance['type'],
        value: r.value,
      })),
      weaknesses: runtime.weaknesses.map((r) => ({
        type: r.kind as TypedResistance['type'],
        value: r.value,
      })),
      conditions: [],
      heroicResources: [],
      extras: [],
      surges: 0,
      recoveries: {
        current: recoveriesCurrent,
        max: runtime.recoveriesMax,
      },
      recoveryValue: runtime.recoveryValue,
      weaponDamageBonus: runtime.weaponDamageBonus,
    };
  });

  // Materialize monster participants from DO-stamped monster stat blocks.
  const monsterParticipants: Participant[] = parsed.data.stampedMonsters.flatMap((entry) => {
    const baseName = entry.nameOverride ?? entry.monster.name;
    return Array.from({ length: entry.quantity }, (_, i) => {
      const suffix = entry.quantity > 1 ? ` ${i + 1}` : '';
      return participantFromMonster(entry.monster, {
        id: ulid(),
        name: `${baseName}${suffix}`,
      });
    });
  });

  const allParticipants: Participant[] = [...pcParticipants, ...monsterParticipants];
  const encounterId = parsed.data.encounterId ?? ulid();

  const encounter: EncounterPhase = {
    id: encounterId,
    currentRound: 1,
    turnOrder: allParticipants.map((p) => p.id),
    activeParticipantId: null,
    turnState: {},
    malice: { current: 0, lastMaliciousStrikeRound: null },
  };

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      // REPLACE the existing roster — the new encounter is the single source of truth.
      participants: allParticipants,
      encounter,
    },
    derived: [],
    log: [
      {
        kind: 'info',
        text: `encounter ${encounterId} started with ${pcParticipants.length} PC(s) and ${monsterParticipants.length} monster(s)`,
        intentId: intent.id,
      },
    ],
  };
}
