import {
  EndRoundPayloadSchema,
  EndTurnPayloadSchema,
  IntentTypes,
  type Participant,
  SetInitiativePayloadSchema,
  StartRoundPayloadSchema,
  StartTurnPayloadSchema,
} from '@ironyard/shared';
import { HEROIC_RESOURCES } from '../heroic-resources';
import { requireCanon } from '../require-canon';
import { aliveHeroes } from '../state-helpers';
import type {
  ActiveEncounter,
  CampaignState,
  DerivedIntent,
  IntentResult,
  LogEntry,
  StampedIntent,
} from '../types';
import { isParticipant } from '../types';

// Shared guard — every turn intent requires an active encounter.
function requireEncounter(
  state: CampaignState,
  intent: StampedIntent,
  label: string,
): { ok: true; encounter: ActiveEncounter } | { ok: false; result: IntentResult } {
  if (!state.encounter) {
    return {
      ok: false,
      result: {
        state,
        derived: [],
        log: [{ kind: 'error', text: `${label}: no active encounter`, intentId: intent.id }],
        errors: [{ code: 'no_active_encounter', message: 'no active encounter' }],
      },
    };
  }
  return { ok: true, encounter: state.encounter };
}

export function applyStartRound(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = StartRoundPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `StartRound rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }
  const guard = requireEncounter(state, intent, 'StartRound');
  if (!guard.ok) return guard.result;

  const round = (guard.encounter.currentRound ?? 0) + 1;
  const firstId = guard.encounter.turnOrder[0] ?? null;

  // Canon § 5.5: at the start of each round (including round 1), the
  // Director gains `aliveHeroes + roundNumber` malice. Round 1 is applied
  // at StartEncounter time; rounds 2+ apply here.
  const aliveCount = aliveHeroes(state).length;
  const nextMalice = guard.encounter.malice.current + aliveCount + round;

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      encounter: {
        ...guard.encounter,
        currentRound: round,
        activeParticipantId: firstId,
        malice: {
          ...guard.encounter.malice,
          current: nextMalice,
        },
      },
    },
    derived: [],
    log: [
      {
        kind: 'info',
        text: `round ${round} starts; +${aliveCount + round} malice`,
        intentId: intent.id,
      },
    ],
  };
}

export function applyEndRound(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = EndRoundPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        { kind: 'error', text: `EndRound rejected: ${parsed.error.message}`, intentId: intent.id },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }
  const guard = requireEncounter(state, intent, 'EndRound');
  if (!guard.ok) return guard.result;

  if (guard.encounter.currentRound === null) {
    return {
      state: { ...state, seq: state.seq + 1 },
      derived: [],
      log: [{ kind: 'info', text: 'no round in progress', intentId: intent.id }],
    };
  }

  const currentRound = guard.encounter.currentRound;
  const nextOpenActions = state.openActions.filter(
    (o) => o.expiresAtRound === null || o.expiresAtRound !== currentRound,
  );

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      openActions: nextOpenActions,
      encounter: {
        ...guard.encounter,
        activeParticipantId: null,
      },
    },
    derived: [],
    log: [
      {
        kind: 'info',
        text: `round ${guard.encounter.currentRound} ends`,
        intentId: intent.id,
      },
    ],
  };
}

export function applyStartTurn(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = StartTurnPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        { kind: 'error', text: `StartTurn rejected: ${parsed.error.message}`, intentId: intent.id },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }
  const guard = requireEncounter(state, intent, 'StartTurn');
  if (!guard.ok) return guard.result;

  const { participantId } = parsed.data;
  if (!state.participants.some((p) => isParticipant(p) && p.id === participantId)) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `participant ${participantId} not in roster`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'participant_missing', message: `${participantId} not in roster` }],
    };
  }

  // Canon § 5.3 / § 5.4: at the start of each PC's turn, apply the
  // class-specific universal heroic resource gain. Flat-gain classes (Censor,
  // Elementalist, Null, Tactician) add a configured amount; d3-classes
  // (Conduit, Fury, Shadow, Talent, Troubadour) consume a pre-rolled d3
  // from the intent payload. Mismatched payload shapes are rejected.
  const activePc = state.participants.find(
    (p) => isParticipant(p) && p.kind === 'pc' && p.id === participantId,
  );
  let nextParticipants = state.participants;
  if (activePc && isParticipant(activePc) && activePc.heroicResources.length > 0) {
    const resource = activePc.heroicResources[0];
    if (!resource) {
      // Defensive: heroicResources had a length but the entry is undefined.
      // Treat as "no resource pool" and skip the gain.
    } else {
      const config = HEROIC_RESOURCES[resource.name];
      if (config) {
        const gain = config.baseGain.onTurnStart;
        const providedD3 = parsed.data.rolls?.d3;

        if (gain.kind === 'flat') {
          if (providedD3 !== undefined) {
            return {
              state,
              derived: [],
              log: [
                {
                  kind: 'error',
                  text: `StartTurn rejected: ${resource.name} is flat-gain; rolls.d3 not allowed`,
                  intentId: intent.id,
                },
              ],
              errors: [
                {
                  code: 'wrong_payload_shape',
                  message: `${resource.name} uses flat gain; do not provide rolls.d3`,
                },
              ],
            };
          }
          const newValue = resource.value + gain.amount;
          nextParticipants = state.participants.map((p) =>
            isParticipant(p) && p.id === participantId
              ? { ...p, heroicResources: [{ ...resource, value: newValue }] }
              : p,
          );
        } else if (gain.kind === 'd3') {
          if (providedD3 === undefined) {
            return {
              state,
              derived: [],
              log: [
                {
                  kind: 'error',
                  text: `StartTurn rejected: ${resource.name} requires rolls.d3 (dispatcher pre-rolls)`,
                  intentId: intent.id,
                },
              ],
              errors: [
                { code: 'missing_dice', message: `${resource.name} requires rolls.d3` },
              ],
            };
          }
          const newValue = resource.value + providedD3;
          nextParticipants = state.participants.map((p) =>
            isParticipant(p) && p.id === participantId
              ? { ...p, heroicResources: [{ ...resource, value: newValue }] }
              : p,
          );
        } else {
          // 'd3-plus' is stubbed for 2b.0.1 (10th-level Psion 1d3+2).
          return {
            state,
            derived: [],
            log: [
              {
                kind: 'error',
                text: `StartTurn rejected: ${gain.kind} gain not yet supported (2b.0.1)`,
                intentId: intent.id,
              },
            ],
            errors: [{ code: 'not_yet_supported', message: `gain ${gain.kind} not yet wired` }],
          };
        }
      }
    }
  }

  // Phase 5 Pass 2a: clear the turn-flow action slots for the new turn-holder.
  // Unconditional — runs after any heroic-resource gain so it composes with
  // the heroicResources-only map above.
  nextParticipants = nextParticipants.map((p) =>
    isParticipant(p) && p.id === participantId
      ? { ...p, turnActionUsage: { main: false, maneuver: false, move: false } }
      : p,
  );

  // Slice 6: reset per-turn flags consulted by condition hooks. Dazed gating
  // uses `dazeActionUsedThisTurn`. Other flags (mainSpent etc.) join here in
  // slice 7.
  const nextTurnState = {
    ...guard.encounter.turnState,
    [participantId]: { dazeActionUsedThisTurn: false },
  };

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      participants: nextParticipants,
      encounter: {
        ...guard.encounter,
        activeParticipantId: participantId,
        turnState: nextTurnState,
      },
    },
    derived: [],
    log: [{ kind: 'info', text: `${participantId} starts their turn`, intentId: intent.id }],
  };
}

export function applyEndTurn(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = EndTurnPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        { kind: 'error', text: `EndTurn rejected: ${parsed.error.message}`, intentId: intent.id },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }
  const guard = requireEncounter(state, intent, 'EndTurn');
  if (!guard.ok) return guard.result;

  const order = guard.encounter.turnOrder;
  const currentId = guard.encounter.activeParticipantId;
  const currentIdx = currentId === null ? -1 : order.indexOf(currentId);
  // Falling off the end (or off a stale id) parks at null; explicit StartRound
  // or EndRound moves the lifecycle on from there.
  const nextId =
    currentIdx >= 0 && currentIdx + 1 < order.length ? (order[currentIdx + 1] ?? null) : null;

  // Slice 6: clear the ending creature's per-turn flags. StartTurn re-seeds
  // them next turn.
  const { [currentId ?? '']: _cleared, ...remainingTurnState } = guard.encounter.turnState;
  // _cleared is the dropped per-turn record; keeping the name for clarity.
  void _cleared;

  // Slice 6 hook: auto-fire RollResistance for each `save_ends` condition on
  // the ending creature, in `appliedAtSeq` order (canon §3.3, Q9). The d10s
  // ride on the EndTurn payload's `saveRolls` field. Missing or wrong-length
  // ⇒ engine logs `manual_override_required` per save and skips the auto-fire
  // (canon-gate idiom: dispatcher provides dice).
  const derived: DerivedIntent[] = [];
  const log: LogEntry[] = [
    {
      kind: 'info',
      text: nextId
        ? `${currentId ?? 'no one'} ends turn, ${nextId} is up`
        : `${currentId ?? 'no one'} ends turn; round end pending`,
      intentId: intent.id,
    },
  ];

  if (currentId !== null && requireCanon('conditions.saving-throws')) {
    const ending = state.participants.find(
      (p): p is Participant => isParticipant(p) && p.id === currentId,
    );
    if (ending) {
      const saveEndsConditions = ending.conditions
        .filter((c) => c.duration.kind === 'save_ends' && c.removable)
        .slice()
        .sort((a, b) => a.appliedAtSeq - b.appliedAtSeq);

      const providedRolls = parsed.data.saveRolls;
      if (saveEndsConditions.length > 0) {
        if (providedRolls === undefined || providedRolls.length !== saveEndsConditions.length) {
          for (const c of saveEndsConditions) {
            log.push({
              kind: 'info',
              text: `manual_override_required: ${ending.name} owes a save vs ${c.source.id} (no d10 provided)`,
              intentId: intent.id,
            });
          }
        } else {
          for (let i = 0; i < saveEndsConditions.length; i++) {
            const c = saveEndsConditions[i];
            const d10 = providedRolls[i];
            if (!c || d10 === undefined) continue;
            derived.push({
              actor: intent.actor,
              source: 'auto' as const,
              type: IntentTypes.RollResistance,
              payload: {
                characterId: currentId,
                effectId: c.source.id,
                rolls: { d10 },
              },
              causedBy: intent.id,
            });
          }
        }
      }
    }
  }

  // Slice 7: Talent Clarity end-of-turn damage hook (canon §5.3). When the
  // ending creature is "strained" (clarity < 0; rule-questions Q2 — engine
  // status not a Draw Steel condition), dispatch a derived ApplyDamage of
  // `|clarity|` untyped. Effortless Mind (10th-level toggle) suppression is
  // deferred to Phase 2 (character sheet).
  if (currentId !== null && requireCanon('heroic-resources-and-surges.talent-clarity')) {
    const ending = state.participants.find(
      (p): p is Participant => isParticipant(p) && p.id === currentId,
    );
    if (ending) {
      const clarity = ending.heroicResources.find((r) => r.name === 'clarity');
      if (clarity && clarity.value < 0) {
        const damage = Math.abs(clarity.value);
        derived.push({
          actor: intent.actor,
          source: 'auto' as const,
          type: IntentTypes.ApplyDamage,
          payload: {
            targetId: currentId,
            amount: damage,
            damageType: 'untyped',
          },
          causedBy: intent.id,
        });
        log.push({
          kind: 'info',
          text: `${ending.name} takes ${damage} damage from negative clarity (strained)`,
          intentId: intent.id,
        });
      }
    }
  }

  // Q17 Bucket A: drain EoT active-ability tags from the ending creature.
  // 'end_of_encounter' tags persist; EndEncounter sweeps those.
  const updatedParticipants =
    currentId === null
      ? state.participants
      : state.participants.map((p) => {
          if (!isParticipant(p) || p.id !== currentId) return p;
          if (p.activeAbilities.length === 0) return p;
          const next = p.activeAbilities.filter((a) => a.expiresAt.kind !== 'EoT');
          return next.length === p.activeAbilities.length ? p : { ...p, activeAbilities: next };
        });

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      participants: updatedParticipants,
      encounter: {
        ...guard.encounter,
        activeParticipantId: nextId,
        turnState: remainingTurnState,
      },
    },
    derived,
    log,
  };
}

export function applySetInitiative(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = SetInitiativePayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `SetInitiative rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }
  const guard = requireEncounter(state, intent, 'SetInitiative');
  if (!guard.ok) return guard.result;

  const { order } = parsed.data;
  const participantIds = new Set(state.participants.filter(isParticipant).map((p) => p.id));
  const proposedIds = new Set(order);

  if (order.length !== participantIds.size || proposedIds.size !== order.length) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: 'SetInitiative: order must list each participant exactly once',
          intentId: intent.id,
        },
      ],
      errors: [
        {
          code: 'invalid_order',
          message: 'order must contain each participant id exactly once',
        },
      ],
    };
  }
  for (const id of order) {
    if (!participantIds.has(id)) {
      return {
        state,
        derived: [],
        log: [
          {
            kind: 'error',
            text: `SetInitiative: ${id} is not a participant`,
            intentId: intent.id,
          },
        ],
        errors: [{ code: 'invalid_order', message: `unknown participant id ${id}` }],
      };
    }
  }

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      encounter: {
        ...guard.encounter,
        turnOrder: [...order],
      },
    },
    derived: [],
    log: [{ kind: 'info', text: `initiative set: ${order.join(' → ')}`, intentId: intent.id }],
  };
}
