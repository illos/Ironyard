import {
  defaultPerEncounterFlags,
  defaultPsionFlags,
  defaultTargetingRelations,
} from '@ironyard/shared';
import {
  type Participant,
  StartEncounterPayloadSchema,
  type TypedResistance,
  ulid,
} from '@ironyard/shared';
import { deriveCharacterRuntime } from '../derive-character-runtime';
import { HEROIC_RESOURCES, resolveFloor } from '../heroic-resources';
import { aliveHeroes, averageVictoriesAlive } from '../state-helpers';
import type {
  CampaignState,
  EncounterPhase,
  IntentResult,
  ReducerContext,
  StampedIntent,
} from '../types';
import { participantFromMonster } from './add-monster';

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

  if (state.currentSessionId === null) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: 'start a session before running combat', intentId: intent.id }],
      errors: [{ code: 'no_active_session', message: 'start a session before running combat' }],
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

    // Heroic resource preload (canon § 5.4): seed from character.victories.
    // If the class has no known resource (name === 'unknown'), gracefully yield [].
    const resourceName = runtime.heroicResource.name as keyof typeof HEROIC_RESOURCES;
    const resourceConfig = HEROIC_RESOURCES[resourceName];
    const heroicResources = resourceConfig
      ? [
          {
            name: resourceConfig.name,
            value: stamped.character.victories ?? 0,
            floor: resolveFloor(resourceConfig.floor, runtime.characteristics),
          },
        ]
      : [];

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
      heroicResources,
      extras: [],
      surges: 0,
      recoveries: {
        current: recoveriesCurrent,
        max: runtime.recoveriesMax,
      },
      recoveryValue: runtime.recoveryValue,
      weaponDamageBonus: runtime.weaponDamageBonus,
      activeAbilities: [],
      victories: stamped.character.victories ?? 0,
      turnActionUsage: { main: false, maneuver: false, move: false },
      surprised: false,
      role: null,
      // Stamp ancestry id from character blob so reducer helpers (Revenant
      // inert-intercept, Hakaan rubble-intercept) can check p.ancestry without
      // a character lookup. Single-element array matches the monster convention.
      ancestry: stamped.character.ancestryId ? [stamped.character.ancestryId] : [],
      size: null,
      speed: null,
      stability: null,
      freeStrike: null,
      ev: null,
      withCaptain: null,
      className: stamped.character.classId
        ? (ctx.staticData.classes.get(stamped.character.classId)?.name ?? null)
        : null,
      // Pass 3 Slice 1 — stamp purchased ancestry traits and title for
      // reducer-side trait-gating (Hakaan-Doomsight, Title Doomed).
      purchasedTraits: stamped.character.ancestryChoices?.traitIds ?? [],
      equippedTitleIds: stamped.character.titleId ? [stamped.character.titleId] : [],
      staminaState: 'healthy',
      staminaOverride: null,
      bodyIntact: true,
      triggeredActionUsedThisRound: false,
      perEncounterFlags: defaultPerEncounterFlags(),
      posthumousDramaEligible: false,
      psionFlags: defaultPsionFlags(),
      maintainedAbilities: [],
      targetingRelations: defaultTargetingRelations(),
      // Phase 2b Group A+B (2b.1, 2b.3, 2b.4, 2b.8): scaffolding snapshot from
      // CharacterRuntime. Read sites land in later slices; this slice ships
      // the shape so per-trait overrides can populate the runtime fields.
      movementMode: null,
      bloodfireActive: false,
      conditionImmunities: runtime.conditionImmunities,
      disengageBonus: runtime.disengageBonus,
      meleeDistanceBonus: runtime.meleeDistanceBonus,
      rangedDistanceBonus: runtime.rangedDistanceBonus,
    };
  });

  // Materialize monster participants from DO-stamped monster stat blocks.
  // IDs use the `${monsterId}-instance-N` convention so CombatRun can
  // reverse-look up the monster's abilities by stripping the suffix.
  const monsterParticipants: Participant[] = parsed.data.stampedMonsters.flatMap((entry) => {
    const baseName = entry.nameOverride ?? entry.monster.name;
    return Array.from({ length: entry.quantity }, (_, i) => {
      const suffix = entry.quantity > 1 ? ` ${i + 1}` : '';
      return participantFromMonster(entry.monster, {
        id: `${entry.monster.id}-instance-${i + 1}`,
        name: `${baseName}${suffix}`,
      });
    });
  });

  const allParticipants: Participant[] = [...pcParticipants, ...monsterParticipants];
  const encounterId = parsed.data.encounterId ?? ulid();

  // Initial Malice = floor(avgVictories) + aliveHeroes + 1 (canon § 5.5 round-1 tick).
  // Use an interim state view so aliveHeroes/averageVictoriesAlive can inspect the
  // freshly materialized participants without mutating the real state yet.
  const interimState: CampaignState = { ...state, participants: allParticipants };
  const initialMalice = averageVictoriesAlive(interimState) + aliveHeroes(interimState).length + 1;

  const encounter: EncounterPhase = {
    id: encounterId,
    currentRound: 1,
    activeParticipantId: null,
    turnState: {},
    malice: { current: initialMalice, lastMaliciousStrikeRound: null },
    firstSide: null,
    currentPickingSide: null,
    actedThisRound: [],
    pendingTriggers: null,
    perEncounterFlags: { perTurn: { heroesActedThisTurn: [] } },
  };

  return {
    state: {
      ...state,
      seq: state.seq + 1,
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
