import {
  EndRoundPayloadSchema,
  EndTurnPayloadSchema,
  IntentTypes,
  type Participant,
  StartRoundPayloadSchema,
  StartTurnPayloadSchema,
  defaultPerRoundFlags,
} from '@ironyard/shared';
import { resolveParticipantClass } from '../class-triggers/helpers';
import { getResourceConfigForParticipant } from '../heroic-resources';
import { requireCanon } from '../require-canon';
import { aliveHeroes, nextPickingSide } from '../state-helpers';
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

  // Canon § 5.5: at the start of each round (including round 1), the
  // Director gains `aliveHeroes + roundNumber` malice. Round 1 is applied
  // at StartEncounter time; rounds 2+ apply here.
  const aliveCount = aliveHeroes(state).length;
  const nextMalice = guard.encounter.malice.current + aliveCount + round;

  // Reset every participant's per-turn slot usage at round boundary so the
  // Turn-flow UI doesn't display stale "used" pips for the new round before
  // their StartTurn fires. StartTurn re-resets the active participant; this
  // sweep covers everyone else (who would otherwise stay marked from the
  // previous round until their own turn began).
  const nextParticipants = state.participants.map((p) =>
    isParticipant(p) ? { ...p, turnActionUsage: { main: false, maneuver: false, move: false } } : p,
  );

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      participants: nextParticipants,
      encounter: {
        ...guard.encounter,
        currentRound: round,
        // Zipper initiative: reset pick state for the new round.
        currentPickingSide: guard.encounter.firstSide,
        actedThisRound: [],
        activeParticipantId: null,
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

  // Phase 5 Pass 2b1: end-of-round-1 surprise sweep (canon § 4.1).
  // Pass 3 Slice 1 — canon §4.10: reset triggeredActionUsedThisRound each round.
  // Pass 3 Slice 2a — reset participant.perEncounterFlags.perRound (Censor
  // Wrath, Fury Ferocity, Tactician Focus, Shadow Insight, Null Discipline,
  // Talent Clarity per-round latches; spatial-OA per-round latches) so the
  // δ-gain triggers fire again on the next round. perTurn entries and
  // perEncounter latches are NOT touched here (they have their own reset
  // sites: EndTurn and EndEncounter respectively).
  const nextParticipants = state.participants.map((p) => {
    if (!isParticipant(p)) return p;
    const clearSurprise = guard.encounter.currentRound === 1 && p.surprised;
    const resetPerRound = {
      ...p.perEncounterFlags,
      perRound: defaultPerRoundFlags(),
    };
    if (clearSurprise && p.triggeredActionUsedThisRound) {
      return {
        ...p,
        surprised: false,
        triggeredActionUsedThisRound: false,
        perEncounterFlags: resetPerRound,
      };
    }
    if (clearSurprise) {
      return { ...p, surprised: false, perEncounterFlags: resetPerRound };
    }
    if (p.triggeredActionUsedThisRound) {
      return {
        ...p,
        triggeredActionUsedThisRound: false,
        perEncounterFlags: resetPerRound,
      };
    }
    return { ...p, perEncounterFlags: resetPerRound };
  });

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      participants: nextParticipants,
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
  // from the intent payload. Slice 2a adds the 10th-level Psion d3-plus
  // variant resolved by `getResourceConfigForParticipant`. Mismatched
  // payload shapes are rejected.
  const activePc = state.participants.find(
    (p) => isParticipant(p) && p.kind === 'pc' && p.id === participantId,
  );
  let nextParticipants = state.participants;
  const derived: DerivedIntent[] = [];
  const log: LogEntry[] = [];

  if (activePc && isParticipant(activePc) && activePc.heroicResources.length > 0) {
    const resource = activePc.heroicResources[0];
    if (resource) {
      // Slice 2a: route through getResourceConfigForParticipant so a 10th-level
      // Psion Talent receives the d3-plus variant.
      const config = getResourceConfigForParticipant(state, activePc);
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
              errors: [{ code: 'missing_dice', message: `${resource.name} requires rolls.d3` }],
            };
          }
          const newValue = resource.value + providedD3;
          nextParticipants = state.participants.map((p) =>
            isParticipant(p) && p.id === participantId
              ? { ...p, heroicResources: [{ ...resource, value: newValue }] }
              : p,
          );
        } else {
          // 'd3-plus' — 10th-level Psion Talent: gain = rolls.d3 + bonus.
          if (providedD3 === undefined) {
            return {
              state,
              derived: [],
              log: [
                {
                  kind: 'error',
                  text: `StartTurn rejected: ${resource.name} (d3-plus) requires rolls.d3 (dispatcher pre-rolls)`,
                  intentId: intent.id,
                },
              ],
              errors: [
                { code: 'missing_dice', message: `${resource.name} requires rolls.d3` },
              ],
            };
          }
          const newValue = resource.value + providedD3 + gain.bonus;
          nextParticipants = state.participants.map((p) =>
            isParticipant(p) && p.id === participantId
              ? { ...p, heroicResources: [{ ...resource, value: newValue }] }
              : p,
          );
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

  // Slice 2a: clear the encounter-scoped heroesActedThisTurn set. Per the
  // spec § Reset semantics this is cleared at StartTurn (single-owner = the
  // currently-acting participant). UseAbility appends the active PC's id;
  // triggered actions by other PCs during this turn also append. Troubadour
  // three-heroes-acted evaluator reads .length >= 3.
  const updatedEncounterFlags = {
    ...guard.encounter.perEncounterFlags,
    perTurn: { ...guard.encounter.perEncounterFlags.perTurn, heroesActedThisTurn: [] },
  };

  // Slice 2a: Elementalist Maintenance auto-drop chain.
  //
  // After the per-turn essence gain applies, walk the maintained-abilities
  // list in descending costPerTurn order; for each, if the remaining essence
  // can cover the cost deduct it, otherwise emit a derived StopMaintenance
  // intent (the next reducer dispatch handles roster + log mutation) and
  // skip the deduction. The descending-cost iteration preserves the most
  // maintenances (canon-trust: "you cannot maintain an ability that would
  // make you earn a negative amount").
  if (activePc && isParticipant(activePc) && activePc.maintainedAbilities.length > 0) {
    const cls = resolveParticipantClass(state, activePc);
    if (cls === 'elementalist') {
      // Read the post-gain essence from `nextParticipants` so the projection
      // accounts for the +2 per-turn gain that just applied above.
      const postGainPc = nextParticipants.find(
        (p): p is Participant => isParticipant(p) && p.id === participantId,
      );
      const essenceResource = postGainPc?.heroicResources.find((r) => r.name === 'essence');
      if (postGainPc && essenceResource) {
        const sortedMaintenances = [...activePc.maintainedAbilities].sort(
          (a, b) => b.costPerTurn - a.costPerTurn,
        );
        let projected = essenceResource.value;
        for (const m of sortedMaintenances) {
          if (projected - m.costPerTurn >= 0) {
            projected -= m.costPerTurn;
          } else {
            // Auto-drop — emit derived StopMaintenance. Decorate per Task
            // 21–24 pattern (actor = the StartTurn dispatcher; source =
            // server for derived intents).
            derived.push({
              actor: intent.actor,
              source: 'server' as const,
              type: IntentTypes.StopMaintenance,
              payload: { participantId, abilityId: m.abilityId },
              causedBy: intent.id,
            });
            log.push({
              kind: 'info',
              text: `${postGainPc.name} can no longer maintain ${m.abilityId} (projected essence ${projected} − ${m.costPerTurn} < 0); auto-dropping`,
              intentId: intent.id,
            });
          }
        }
        // Write the final projected essence back to the active PC.
        nextParticipants = nextParticipants.map((p) =>
          isParticipant(p) && p.id === participantId
            ? {
                ...p,
                heroicResources: p.heroicResources.map((r) =>
                  r.name === 'essence' ? { ...r, value: projected } : r,
                ),
              }
            : p,
        );
      }
    }
  }

  // Slice 2a: Conduit *Pray to the Gods* OA — raised at StartTurn before the
  // standard 1d3 piety gain takes effect at the table. The OA gives the
  // player the option to convert the standard gain into a pray-table draw
  // (see canon § 5.4.2 and slice-2a spec). Standard gain already applied
  // above; claim path adjusts if the player opts in. Unclaimed pray OAs
  // expire at EndTurn (special-cased — earlier than the standard EndRound
  // expiry framework).
  if (activePc && isParticipant(activePc)) {
    const cls = resolveParticipantClass(state, activePc);
    if (cls === 'conduit') {
      const currentRound = guard.encounter.currentRound ?? 1;
      derived.push({
        actor: intent.actor,
        source: 'server' as const,
        type: IntentTypes.RaiseOpenAction,
        payload: {
          kind: 'pray-to-the-gods',
          participantId,
          // Hard upper bound — actual prune happens at the participant's
          // EndTurn (see applyEndTurn below). EndRound is the safety net.
          expiresAtRound: currentRound,
          payload: {},
        },
        causedBy: intent.id,
      });
    }
  }

  log.push({ kind: 'info', text: `${participantId} starts their turn`, intentId: intent.id });

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      participants: nextParticipants,
      encounter: {
        ...guard.encounter,
        activeParticipantId: participantId,
        turnState: nextTurnState,
        perEncounterFlags: updatedEncounterFlags,
      },
    },
    derived,
    log,
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

  const currentId = guard.encounter.activeParticipantId;
  // Zipper initiative (canon § 4.1): the ending participant joins
  // `actedThisRound` here (not at PickNextActor time — they're "done" when
  // the turn ends, not when it starts). nextPickingSide consumes the updated
  // acted set to apply the run-out rule.
  const nextActedThisRound =
    currentId && !guard.encounter.actedThisRound.includes(currentId)
      ? [...guard.encounter.actedThisRound, currentId]
      : guard.encounter.actedThisRound;
  const nextSide = nextPickingSide({
    ...state,
    encounter: {
      ...guard.encounter,
      activeParticipantId: null,
      actedThisRound: nextActedThisRound,
    },
  });

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
      text: nextSide
        ? `${currentId ?? 'no one'} ends turn; ${nextSide} pick next`
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
  //
  // Slice 2a: 10th-level Psion opt-out — when
  // `participant.psionFlags.clarityDamageOptOutThisTurn === true` the EoT
  // damage is skipped for this turn. The flag is reset below regardless.
  if (currentId !== null && requireCanon('heroic-resources-and-surges.talent-clarity')) {
    const ending = state.participants.find(
      (p): p is Participant => isParticipant(p) && p.id === currentId,
    );
    if (ending) {
      const clarity = ending.heroicResources.find((r) => r.name === 'clarity');
      if (clarity && clarity.value < 0) {
        if (ending.psionFlags.clarityDamageOptOutThisTurn) {
          log.push({
            kind: 'info',
            text: `${ending.name} opted OUT of EoT clarity damage this turn (Psion)`,
            intentId: intent.id,
          });
        } else {
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
  }

  // Q17 Bucket A: drain EoT active-ability tags from the ending creature.
  // 'end_of_encounter' tags persist; EndEncounter sweeps those.
  //
  // Slice 2a: for EVERY participant, filter `perEncounterFlags.perTurn.entries`
  // whose `scopedToTurnOf === currentId`. The tagged-map shape (see spec §
  // Reset semantics) means the ending creature's perTurn writes attached to
  // any participant get cleaned at EndTurn.
  //
  // Slice 2a: reset ending creature's `psionFlags.clarityDamageOptOutThisTurn`
  // to false regardless of whether the opt-out fired this turn.
  const updatedParticipants = state.participants.map((p) => {
    if (!isParticipant(p)) return p;

    let next = p;

    // Per-turn entry filter (every participant, scoped to ending id).
    if (currentId !== null) {
      const filteredEntries = next.perEncounterFlags.perTurn.entries.filter(
        (e) => e.scopedToTurnOf !== currentId,
      );
      if (filteredEntries.length !== next.perEncounterFlags.perTurn.entries.length) {
        next = {
          ...next,
          perEncounterFlags: {
            ...next.perEncounterFlags,
            perTurn: { ...next.perEncounterFlags.perTurn, entries: filteredEntries },
          },
        };
      }
    }

    if (currentId !== null && p.id === currentId) {
      // Drain EoT active-ability tags on the ending creature.
      if (next.activeAbilities.length > 0) {
        const remaining = next.activeAbilities.filter((a) => a.expiresAt.kind !== 'EoT');
        if (remaining.length !== next.activeAbilities.length) {
          next = { ...next, activeAbilities: remaining };
        }
      }
      // Reset Psion EoT-clarity-damage opt-out.
      if (next.psionFlags.clarityDamageOptOutThisTurn) {
        next = {
          ...next,
          psionFlags: { ...next.psionFlags, clarityDamageOptOutThisTurn: false },
        };
      }
    }

    return next;
  });

  // Slice 2a: prune unclaimed Pray-to-the-Gods OAs at the ending Conduit's
  // EndTurn (spec § Pray-to-the-Gods: "special-cased to expire at end-of-
  // current-turn rather than EndRound"). All `pray-to-the-gods` OAs raised
  // for the ending participant are dropped here.
  const nextOpenActions =
    currentId === null
      ? state.openActions
      : state.openActions.filter(
          (oa) => !(oa.kind === 'pray-to-the-gods' && oa.participantId === currentId),
        );

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      participants: updatedParticipants,
      openActions: nextOpenActions,
      encounter: {
        ...guard.encounter,
        activeParticipantId: null,
        currentPickingSide: nextSide,
        actedThisRound: nextActedThisRound,
        turnState: remainingTurnState,
      },
    },
    derived,
    log,
  };
}
