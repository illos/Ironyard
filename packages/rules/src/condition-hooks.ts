import type { ConditionInstance, Participant } from '@ironyard/shared';

// Pure hook helpers for slice 6. Every function in this module is a referentially
// transparent computation over conditions + participants. No state mutation, no
// dice rolls (dice enter via payload optionals), no Date.now(). The reducer
// composes these helpers from inside its intent handlers.

// ---------- Flavor 2: edge/bane contributors --------------------------------

export type RollContributions = {
  extraEdges: number;
  extraBanes: number;
  // Human-readable reasons for the engine log. One per contributing condition.
  reasons: string[];
};

// Walk every condition on the attacker and on each defender and translate
// applicable rules into extra edges / banes. Pre-§1.4 contributions: the caller
// adds these to the payload's existing edges/banes and then runs the regular
// cancellation in `resolvePowerRoll`, which caps net contributions at ±2.
//
// Slice-6 simplifications:
// - Every `RollPower` is treated as a strike for the Prone contribution
//   (rules-canon §3.5.5 says strikes get a bane). The ability category is not
//   yet on the payload; slice 7 with the ability registry will narrow this.
// - Every `RollPower` is treated as melee-eligible for Prone-against-defender
//   (canon §3.5.5: "Melee abilities used against them gain an edge"). Same
//   reasoning — no melee/ranged tag on the payload yet.
export function computeRollContributions(
  attacker: Participant,
  defenders: Participant[],
): RollContributions {
  let extraEdges = 0;
  let extraBanes = 0;
  const reasons: string[] = [];

  // ---------- Attacker-side contributions ----------------------------------
  for (const c of attacker.conditions) {
    if (c.type === 'Weakened') {
      // canon §3.5.9: bane on power rolls.
      extraBanes += 1;
      reasons.push(`${attacker.name} is Weakened (+1 bane)`);
    } else if (c.type === 'Restrained') {
      // canon §3.5.6: bane on ability rolls and Might/Agility tests.
      extraBanes += 1;
      reasons.push(`${attacker.name} is Restrained (+1 bane)`);
    } else if (c.type === 'Prone') {
      // canon §3.5.5: strike bane (slice-6 simplification — every RollPower).
      extraBanes += 1;
      reasons.push(`${attacker.name} is Prone (+1 bane)`);
    } else if (c.type === 'Grabbed') {
      // canon §3.5.4: bane on abilities not targeting the grabber.
      const targetingGrabber = defenders.some((d) => d.id === c.source.id);
      if (!targetingGrabber) {
        extraBanes += 1;
        reasons.push(`${attacker.name} is Grabbed by ${c.source.id} (+1 bane, target ≠ grabber)`);
      }
    } else if (c.type === 'Frightened') {
      // canon §3.5.3: bane on ability rolls against the source.
      const targetingSource = defenders.some((d) => d.id === c.source.id);
      if (targetingSource) {
        extraBanes += 1;
        reasons.push(`${attacker.name} is Frightened of ${c.source.id} (+1 bane, target = source)`);
      }
    } else if (c.type === 'Taunted') {
      // canon §3.5.8: double bane (2) when targeting any non-taunter.
      const includesTaunter = defenders.some((d) => d.id === c.source.id);
      if (!includesTaunter) {
        extraBanes += 2;
        reasons.push(
          `${attacker.name} is Taunted by ${c.source.id} (+2 banes, no target = taunter)`,
        );
      }
    }
  }

  // ---------- Defender-side contributions ----------------------------------
  for (const d of defenders) {
    // Phase 2b 2b.15 — Combat.md:677: "Ability rolls against you have a double
    // edge" while unconscious. State-derived (not a condition rule) so it lives
    // outside the conditions loop.
    if (d.staminaState === 'unconscious') {
      extraEdges += 2;
      reasons.push(`${d.name} is unconscious (+2 edges to attacker — double edge)`);
    }
    for (const c of d.conditions) {
      if (c.type === 'Restrained') {
        // canon §3.5.6: abilities used against them gain an edge.
        extraEdges += 1;
        reasons.push(`${d.name} is Restrained (+1 edge to attacker)`);
      } else if (c.type === 'Prone') {
        // canon §3.5.5: melee abilities against them gain an edge.
        extraEdges += 1;
        reasons.push(`${d.name} is Prone (+1 edge to attacker)`);
      } else if (c.type === 'Frightened' && c.source.id === attacker.id) {
        // canon §3.5.3: if source is a creature, that creature gains an edge
        // on ability rolls against the Frightened creature.
        extraEdges += 1;
        reasons.push(`${d.name} is Frightened of ${attacker.name} (+1 edge to attacker)`);
      }
    }
  }

  return { extraEdges, extraBanes, reasons };
}

// ---------- Flavor 3: action gates ------------------------------------------

export type DazeTurnContext = {
  // Whether *any* main/maneuver/move action has already been used this turn.
  // The reducer maintains this per-actor flag in ActiveEncounter.turnState.
  dazeActionUsedThisTurn: boolean;
};

export type ActionGate = { ok: true } | { ok: false; code: 'action_gated'; reason: string };

// Dazed (canon §3.5.2 + §4.9): on a Dazed turn, the actor may use exactly one
// of {main, maneuver, move}. Slice 6 only surfaces the main_action path; the
// other kinds are reachable for future intent handlers without changing the
// helper signature.
export function gateActionForDazed(
  ctx: DazeTurnContext,
  actor: Participant,
  kind: 'main_action' | 'maneuver' | 'move',
): ActionGate {
  const isDazed = actor.conditions.some((c) => c.type === 'Dazed');
  if (!isDazed) return { ok: true };
  if (!ctx.dazeActionUsedThisTurn) return { ok: true };
  return {
    ok: false,
    code: 'action_gated',
    reason: `${actor.name} is Dazed and has already used a ${kind} this turn (canon §3.5.2)`,
  };
}

// ---------- Flavor: onCheckTriggerEnd ---------------------------------------

export type TriggerEvent = { kind: 'teleport' | 'force_move_apart' };

// canon §3.5.4 (Grabbed): "the Grabbed condition ends if the grabbed creature
// teleports, or if either creature is force-moved such that they're no longer
// adjacent." canon §3.5.6 (Restrained): "Restrained ends if the affected
// creature teleports." Other conditions are unaffected.
export function removeTriggerEndedConditions(
  subject: Participant,
  event: TriggerEvent,
): ConditionInstance[] {
  return subject.conditions.filter((c) => {
    if (c.type === 'Grabbed') {
      // Drop on teleport or force_move_apart.
      return false;
    }
    if (c.type === 'Restrained' && event.kind === 'teleport') {
      return false;
    }
    return true;
  });
}

// ---------- Flavor 1: post-action emitters (Bleeding) -----------------------

// The Bleeding hook returns a derived ApplyDamage spec the caller wraps into
// a full DerivedIntent (with causedBy / actor / source filled in from the
// parent intent). Separating "compute the damage amount" from "build the
// envelope" keeps this module dependency-free of the intent envelope shape.
//
// Pass 3 Slice 1 — canon clarification: "ability roll" and "test" are two
// subkinds of power roll. Per Classes.md:448 Bleeding fires "whenever they
// use a main action, use a triggered action, or make a test or ability roll
// using Might or Agility." Phase 2b 2b.15 B33 narrows `ability_roll` to
// Might/Agility-characteristic rolls at the RollPower call site.
//
// Phase 2b 2b.15 B34 — `main_action`, `triggered_action`, and
// `might_or_agility_test` discriminants are intentionally not yet wired:
// - `main_action` / `triggered_action`: adding emits at MarkActionUsed would
//   double-fire alongside RollPower's `ability_roll` for the typical case
//   (most main actions are M/A power rolls that already trigger here).
//   Canon §3.5.1 says Bleeding "only happens once per action," so the
//   dedupe pattern needs the trigger-cascade substrate from 2b.9 to land
//   before these call sites can be added safely.
// - `might_or_agility_test`: blocked on a `RollTest` intent that doesn't
//   exist yet. Currently under-fires for non-RollPower M/A tests.
// Both deferrals are P2 under-fires; tracked in the 2b shipped-code audit.
export type BleedingTrigger =
  | { kind: 'main_action' }
  | { kind: 'triggered_action' }
  | { kind: 'might_or_agility_test' }
  | { kind: 'ability_roll' };

export type BleedingDamageSpec = {
  // The amount to deal. Computed as `bleedingD6 + actor.level` per canon
  // §3.5.1. `untyped` damage type per canon §3.5.1.
  amount: number;
  // Why the engine emitted it; appears in the log.
  reason: string;
};

// Returns the Bleeding damage to inflict on `actor` given that the actor just
// performed a triggering action, *iff* the actor is Bleeding AND the dispatcher
// provided a `bleedingD6` value. Returns null in two cases that the caller
// handles differently:
// - `not-bleeding`: actor has no Bleeding condition — no damage, no log.
// - `manual-override-required`: actor is Bleeding but no d6 was provided.
//   The caller logs `manual_override_required` so the table can roll manually.
export function bleedingDamageHook(
  actor: Participant,
  trigger: BleedingTrigger,
  bleedingD6: number | undefined,
): BleedingDamageSpec | { skipped: 'not-bleeding' } | { skipped: 'manual-override-required' } {
  const isBleeding = actor.conditions.some((c) => c.type === 'Bleeding');
  if (!isBleeding) return { skipped: 'not-bleeding' };
  if (bleedingD6 === undefined) return { skipped: 'manual-override-required' };
  return {
    amount: bleedingD6 + actor.level,
    reason: `Bleeding damage (${bleedingD6} + level ${actor.level}, trigger=${trigger.kind})`,
  };
}
