import {
  type Participant,
  StartEncounterPayloadSchema,
  type TypedResistance,
  ulid,
} from '@ironyard/shared';
import { deriveCharacterRuntime } from '../derive-character-runtime';
import type {
  CampaignState,
  EncounterPhase,
  IntentResult,
  ReducerContext,
  RosterEntry,
  StampedIntent,
} from '../types';
import { isParticipant } from '../types';

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

  // D4: Materialize PC placeholders into full participants.
  // stampedPcs maps characterId → { name, ownerId, character }.
  const stampedByCharId = new Map(parsed.data.stampedPcs.map((s) => [s.characterId, s]));

  const nextParticipants: RosterEntry[] = state.participants.map((entry) => {
    if (entry.kind !== 'pc-placeholder') return entry;
    const stamped = stampedByCharId.get(entry.characterId);
    if (!stamped) {
      // No blob stamped → leave placeholder (skipped in encounter turnOrder).
      return entry;
    }
    const runtime = deriveCharacterRuntime(stamped.character, ctx.staticData);
    const preservedStamina = preservedRuntime(state, entry.characterId, 'currentStamina');
    const preservedRecoveriesCurrent = preservedRuntime(
      state,
      entry.characterId,
      'recoveriesCurrent',
    );
    const materialized: Participant = {
      id: `pc:${entry.characterId}`, // stable id derived from characterId
      name: stamped.name, // from characters.name column (stamped by DO)
      kind: 'pc',
      ownerId: stamped.ownerId,
      characterId: entry.characterId,
      level: stamped.character.level,
      currentStamina:
        preservedStamina !== null
          ? Math.min(preservedStamina, runtime.maxStamina)
          : runtime.maxStamina,
      maxStamina: runtime.maxStamina,
      characteristics: runtime.characteristics,
      // CharacterRuntime uses `kind` but Participant uses `type` for the damage field name.
      // The values are compatible DamageType strings at runtime; cast for TypeScript.
      immunities: runtime.immunities.map((r) => ({
        type: r.kind as TypedResistance['type'],
        value: r.value,
      })),
      weaknesses: runtime.weaknesses.map((r) => ({
        type: r.kind as TypedResistance['type'],
        value: r.value,
      })),
      conditions: [],
      heroicResources: [], // reset to class floor at encounter start (slice-7 logic)
      extras: [],
      surges: 0,
      recoveries: {
        current:
          preservedRecoveriesCurrent !== null
            ? Math.min(preservedRecoveriesCurrent, runtime.recoveriesMax)
            : runtime.recoveriesMax,
        max: runtime.recoveriesMax,
      },
      recoveryValue: runtime.recoveryValue,
      // Slice 6 / Epic 2C § 10.8: snapshot the derived per-tier weapon bonus.
      weaponDamageBonus: runtime.weaponDamageBonus,
    };
    return materialized;
  });

  // Use the client-suggested encounterId if provided (useful for optimistic
  // local state and integration tests that need to reference the encounter
  // by ID in follow-up intents like EndEncounter). The server-generated ulid()
  // is the fallback.
  const encounterId = parsed.data.encounterId ?? ulid();

  // Only full Participants (not remaining placeholders) go in the turn order.
  const fullParticipants = nextParticipants.filter(isParticipant);

  const encounter: EncounterPhase = {
    id: encounterId,
    currentRound: 1,
    turnOrder: fullParticipants.map((p) => p.id),
    activeParticipantId: null,
    turnState: {},
    // Slice 7: Director's Malice starts at 0 with no Malicious Strike
    // history (canon §5.5). Per-round generation is dispatcher-driven.
    malice: { current: 0, lastMaliciousStrikeRound: null },
  };

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      participants: nextParticipants,
      encounter,
    },
    derived: [],
    log: [
      {
        kind: 'info',
        text: `encounter ${encounterId} started with ${fullParticipants.length} participants`,
        intentId: intent.id,
      },
    ],
  };
}

function preservedRuntime(
  state: CampaignState,
  characterId: string,
  field: 'currentStamina' | 'recoveriesCurrent',
): number | null {
  const existing = state.participants.find(
    (p): p is Participant => isParticipant(p) && p.kind === 'pc' && p.id === `pc:${characterId}`,
  );
  if (!existing) return null;
  if (field === 'currentStamina') return existing.currentStamina;
  return existing.recoveries.current;
}
