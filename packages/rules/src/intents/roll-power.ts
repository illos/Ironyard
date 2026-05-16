import { IntentTypes, RollPowerPayloadSchema } from '@ironyard/shared';
import { evaluateActionTriggers } from '../class-triggers/action-triggers';
import {
  type BleedingTrigger,
  bleedingDamageHook,
  computeRollContributions,
  gateActionForDazed,
} from '../condition-hooks';
import { resolvePowerRoll } from '../power-roll';
import { requireCanon } from '../require-canon';
import type { CampaignState, DerivedIntent, IntentResult, LogEntry, StampedIntent } from '../types';
import { isParticipant } from '../types';

export function applyRollPower(state: CampaignState, intent: StampedIntent): IntentResult {
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

  if (!state.encounter) {
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
    abilityKeywords,
  } = parsed.data;

  const participants = state.participants.filter(isParticipant);
  const attacker = participants.find((p) => p.id === attackerId);
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
    const target = participants.find((p) => p.id === id);
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
    const turnState = state.encounter.turnState[attackerId] ?? {
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

  // Slice 6 / Epic 2C § 10.8: fold the attacker's per-tier weapon damage bonus
  // into the rolled damage when the ability has Weapon + Melee or Ranged
  // keywords. Snapshot lives on the participant; populated by StartEncounter
  // from the derived CharacterRuntime. Matching is case-insensitive because
  // dispatchers pass keywords through unchanged from AbilitySchema (capitalized
  // in source markdown).
  const lowerKeywords = abilityKeywords.map((k) => k.toLowerCase());
  const hasWeapon = lowerKeywords.includes('weapon');
  const isMelee = lowerKeywords.includes('melee');
  const isRanged = lowerKeywords.includes('ranged');
  let kitDamageBonus = 0;
  if (hasWeapon && (isMelee || isRanged)) {
    const slot: 'melee' | 'ranged' = isMelee ? 'melee' : 'ranged';
    kitDamageBonus = attacker.weaponDamageBonus[slot][outcome.tier - 1] ?? 0;
  }
  const finalDamage = tierEffect.damage + kitDamageBonus;

  // Emit one ApplyDamage per target.
  const derived: DerivedIntent[] = targetIds.map((targetId) => ({
    actor: intent.actor,
    source: 'auto' as const,
    type: IntentTypes.ApplyDamage,
    payload: {
      targetId,
      amount: finalDamage,
      damageType: tierEffect.damageType,
      sourceIntentId: intent.id,
    },
    causedBy: intent.id,
  }));

  // Slice: auto-apply conditions in the landing tier (canon §3.5). The data
  // parser extracted these from the ability's tier-outcome effect text and
  // `buildLadder` filtered them to scope='target'. Each application becomes
  // a real derived SetCondition so bounded undo (slice 8) treats it as part
  // of the parent chain. `source.kind = 'creature'` with id = attackerId so
  // canon §3.4 stacking (Frightened/Taunted replace-by-source) works.
  if (requireCanon('conditions.what-a-condition-is') && tierEffect.conditions.length > 0) {
    for (const targetId of targetIds) {
      for (const c of tierEffect.conditions) {
        derived.push({
          actor: intent.actor,
          source: 'auto' as const,
          type: IntentTypes.SetCondition,
          payload: {
            targetId,
            condition: c.condition,
            duration: c.duration,
            source: { kind: 'creature', id: attackerId },
          },
          causedBy: intent.id,
        });
      }
    }
  }

  // Slice 6: Bleeding hook (canon §3.5.1 / Classes.md:448). Per canon Bleeding
  // damage fires on "a test or ability roll using Might or Agility" — not on
  // every characteristic. Phase 2b 2b.15 B33 gates this to Might/Agility ability
  // rolls (the main-action / triggered-action branches are handled outside
  // RollPower via separate trigger discriminants — see condition-hooks.ts).
  const bleedingTrigger: BleedingTrigger = { kind: 'ability_roll' };
  const bleedingLog: LogEntry[] = [];
  const usesMightOrAgility = characteristic === 'might' || characteristic === 'agility';
  if (requireCanon('conditions.the-9-conditions') && usesMightOrAgility) {
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
  const wasFlagSet = state.encounter.turnState[attackerId]?.dazeActionUsedThisTurn ?? false;
  const nextTurnState = !wasFlagSet
    ? {
        ...state.encounter.turnState,
        [attackerId]: { dazeActionUsedThisTurn: true },
      }
    : state.encounter.turnState;

  // Phase 5 Pass 2a — auto-mark the Turn-flow slot used when rolling an
  // action- or maneuver-type ability. Triggered / villain / free-triggered /
  // trait abilities do NOT consume a turn-flow slot. abilityType is optional;
  // legacy payloads without it skip the emission.
  const turnFlowSlot: 'main' | 'maneuver' | null =
    parsed.data.abilityType === 'action'
      ? 'main'
      : parsed.data.abilityType === 'maneuver'
        ? 'maneuver'
        : null;
  if (turnFlowSlot) {
    derived.push({
      actor: intent.actor,
      source: 'auto' as const,
      type: IntentTypes.MarkActionUsed,
      payload: { participantId: attackerId, slot: turnFlowSlot, used: true },
      causedBy: intent.id,
    });
  }

  // Pass 3 Slice 1 §4.10 — nat 19/20 with a main-action ability grants the
  // actor an extra main action this turn. Works even off-turn, even while
  // Dazed. Not granted to dead actors.
  const natural = rolls.d10[0] + rolls.d10[1];
  const isCrit = natural === 19 || natural === 20;
  const isMainActionAbility = parsed.data.abilityType === 'action';
  const actorAlive = attacker.staminaState !== 'dead';
  if (isCrit && isMainActionAbility && actorAlive) {
    derived.push({
      actor: intent.actor,
      source: 'auto' as const,
      type: IntentTypes.GrantExtraMainAction,
      payload: { participantId: attackerId },
      causedBy: intent.id,
    });
  }

  // Pass 3 Slice 2a — action-event class-trigger evaluation. Two distinct
  // events fire from RollPower:
  //
  //   1. `surge-spent-with-damage` — when the actor spent surges to fuel the
  //      ability AND damage was dealt this tier. Shadow's Insight latch
  //      (canon § 5.4.6) reads this. Skipped when `surgesSpent === 0` or the
  //      tier's damage rolled to 0 (e.g. immune target on a future ApplyDamage
  //      branch — here we gate on `finalDamage > 0` so a 0-damage tier doesn't
  //      mark dealtSurgeDamage). The Shadow trigger gates further on the actor
  //      being a Shadow with the per-round latch unflipped; if the actor is
  //      anyone else the evaluator returns [].
  //   2. `roll-power-outcome` — always fires. Carries the natural sum so
  //      Troubadour's spatial Line-of-Effect OA raiser (canon § 5.4.8) can
  //      check for 19/20 and raise an OA for every eligible Troubadour. No
  //      latch — every qualifying roll raises a fresh OA.
  //
  // Ordering: these fire AFTER the existing derived intents (damage,
  // conditions, MarkActionUsed, GrantExtraMainAction) so any flag writes the
  // trigger emits land after the action's own writes in the derived stream.
  // ctx carries the originating actor for attribution; no random rolls are
  // needed for these two event kinds.
  const triggerCtx = { actor: intent.actor, rolls: {} };
  if (parsed.data.surgesSpent > 0 && finalDamage > 0) {
    const surgeDerived = evaluateActionTriggers(
      state,
      {
        kind: 'surge-spent-with-damage',
        actorId: attackerId,
        surgesSpent: parsed.data.surgesSpent,
        damageType: tierEffect.damageType,
      },
      triggerCtx,
    );
    for (const d of surgeDerived) {
      derived.push({ ...d, causedBy: intent.id });
    }
  }
  const outcomeDerived = evaluateActionTriggers(
    state,
    {
      kind: 'roll-power-outcome',
      actorId: attackerId,
      abilityId,
      naturalValues: [natural],
    },
    triggerCtx,
  );
  for (const d of outcomeDerived) {
    derived.push({ ...d, causedBy: intent.id });
  }

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      encounter: {
        ...state.encounter,
        turnState: nextTurnState,
      },
    },
    derived,
    log: [
      {
        kind: 'info',
        text: `${attacker.name} rolls ${outcome.total} (t${outcome.tier}) via ${abilityId} vs ${targetIds.length} target(s) → ${finalDamage} ${tierEffect.damageType}${kitDamageBonus !== 0 ? ` (kit +${kitDamageBonus})` : ''}`,
        intentId: intent.id,
      },
      ...contributionLog,
      ...bleedingLog,
    ],
  };
}
