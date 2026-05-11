import { IntentTypes, RollPowerPayloadSchema } from '@ironyard/shared';
import {
  type BleedingTrigger,
  bleedingDamageHook,
  computeRollContributions,
  gateActionForDazed,
} from '../condition-hooks';
import { resolvePowerRoll } from '../power-roll';
import { requireCanon } from '../require-canon';
import type { DerivedIntent, IntentResult, LogEntry, SessionState, StampedIntent } from '../types';

export function applyRollPower(state: SessionState, intent: StampedIntent): IntentResult {
  const parsed = RollPowerPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `RollPower rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }

  if (!state.activeEncounter) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: 'no active encounter', intentId: intent.id }],
      errors: [{ code: 'no_active_encounter', message: 'no active encounter' }],
    };
  }

  const {
    abilityId,
    attackerId,
    targetIds,
    characteristic,
    edges,
    banes,
    rolls,
    ladder,
    bleedingD6,
  } = parsed.data;

  const attacker = state.activeEncounter.participants.find((p) => p.id === attackerId);
  if (!attacker) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: `attacker ${attackerId} not found`, intentId: intent.id }],
      errors: [{ code: 'attacker_missing', message: `attacker ${attackerId} not in encounter` }],
    };
  }

  const defenders = [];
  for (const id of targetIds) {
    const target = state.activeEncounter.participants.find((p) => p.id === id);
    if (!target) {
      return {
        state,
        derived: [],
        log: [{ kind: 'error', text: `target ${id} not found`, intentId: intent.id }],
        errors: [{ code: 'target_missing', message: `target ${id} not in encounter` }],
      };
    }
    defenders.push(target);
  }

  // Slice 6: Dazed action gate (canon §3.5.2 / §4.9 — only one of {main,
  // maneuver, move} per turn). `RollPower` represents the main-action surface
  // in slice 6; maneuver/move intents adopt the same helper in slice 7.
  if (requireCanon('action-economy.condition-interactions-with-action-economy')) {
    const turnState = state.activeEncounter.turnState[attackerId] ?? {
      dazeActionUsedThisTurn: false,
    };
    const gate = gateActionForDazed(turnState, attacker, 'main_action');
    if (!gate.ok) {
      return {
        state,
        derived: [],
        log: [{ kind: 'error', text: gate.reason, intentId: intent.id }],
        errors: [{ code: gate.code, message: gate.reason }],
      };
    }
  }

  // Slice 6: edge/bane contributions from conditions on attacker + defenders.
  // Contributions are added pre-§1.4 cancellation; `resolvePowerRoll` runs the
  // cancellation and caps net at ±2.
  let totalEdges = edges;
  let totalBanes = banes;
  const contributionLog: LogEntry[] = [];
  if (requireCanon('conditions.the-9-conditions')) {
    const c = computeRollContributions(attacker, defenders);
    totalEdges += c.extraEdges;
    totalBanes += c.extraBanes;
    for (const reason of c.reasons) {
      contributionLog.push({ kind: 'info', text: `[condition] ${reason}`, intentId: intent.id });
    }
  }

  const outcome = resolvePowerRoll({
    d10: rolls.d10,
    characteristic: attacker.characteristics[characteristic],
    edges: totalEdges,
    banes: totalBanes,
  });

  const tierEffect = outcome.tier === 1 ? ladder.t1 : outcome.tier === 2 ? ladder.t2 : ladder.t3;

  // Emit one ApplyDamage per target.
  const derived: DerivedIntent[] = targetIds.map((targetId) => ({
    actor: intent.actor,
    source: 'auto' as const,
    type: IntentTypes.ApplyDamage,
    payload: {
      targetId,
      amount: tierEffect.damage,
      damageType: tierEffect.damageType,
      sourceIntentId: intent.id,
    },
    causedBy: intent.id,
  }));

  // Slice 6: Bleeding hook (canon §3.5.1). Fires on every RollPower because
  // RollPower is the main-action surface today AND because Might/Agility
  // characteristic also triggers. We classify the trigger for the log only —
  // damage is identical regardless of which branch fired.
  const bleedingTrigger: BleedingTrigger =
    characteristic === 'might' || characteristic === 'agility'
      ? { kind: 'might_or_agility_roll' }
      : { kind: 'main_action' };
  const bleedingLog: LogEntry[] = [];
  if (requireCanon('conditions.the-9-conditions')) {
    const bleed = bleedingDamageHook(attacker, bleedingTrigger, bleedingD6);
    if ('amount' in bleed) {
      derived.push({
        actor: intent.actor,
        source: 'auto' as const,
        type: IntentTypes.ApplyDamage,
        payload: {
          targetId: attackerId,
          amount: bleed.amount,
          damageType: 'untyped' as const,
          sourceIntentId: intent.id,
        },
        causedBy: intent.id,
      });
      bleedingLog.push({
        kind: 'info',
        text: `[Bleeding] ${attacker.name}: ${bleed.reason}`,
        intentId: intent.id,
      });
    } else if (bleed.skipped === 'manual-override-required') {
      bleedingLog.push({
        kind: 'info',
        text: `manual_override_required: ${attacker.name} is Bleeding but no bleedingD6 was provided`,
        intentId: intent.id,
      });
    }
  }

  // Slice 6: mark the Dazed-tracking flag if the attacker is Dazed. (Always
  // set; non-Dazed actors aren't gated.) The flag is keyed per-attacker on the
  // encounter's turnState; StartTurn resets it.
  const wasFlagSet = state.activeEncounter.turnState[attackerId]?.dazeActionUsedThisTurn ?? false;
  const nextTurnState = !wasFlagSet
    ? {
        ...state.activeEncounter.turnState,
        [attackerId]: { dazeActionUsedThisTurn: true },
      }
    : state.activeEncounter.turnState;

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      activeEncounter: {
        ...state.activeEncounter,
        turnState: nextTurnState,
      },
    },
    derived,
    log: [
      {
        kind: 'info',
        text:
          `${attacker.name} rolls ${outcome.total} (t${outcome.tier}) via ${abilityId} ` +
          `vs ${targetIds.length} target(s) → ${tierEffect.damage} ${tierEffect.damageType}`,
        intentId: intent.id,
      },
      ...contributionLog,
      ...bleedingLog,
    ],
  };
}
