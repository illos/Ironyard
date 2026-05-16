import type { Actor, DamageType } from '@ironyard/shared';
import type { CampaignState, DerivedIntent } from '../types';
import * as censor from './per-class/censor';
import * as elementalist from './per-class/elementalist';
import * as fury from './per-class/fury';
import * as nullClass from './per-class/null';
import * as shadow from './per-class/shadow';
import * as tactician from './per-class/tactician';
import * as talent from './per-class/talent';
import * as troubadour from './per-class/troubadour';

// Pass 3 Slice 2a — Action-event dispatch for class-δ triggers.
//
// Parallel sibling to `stamina-transition.ts`. Where the stamina-transition
// substrate hangs off slice-1's StaminaTransitioned event, this module is
// driven directly from the action reducers (apply-damage, use-ability,
// roll-power, spend-malice, mark-action-used — wired in Tasks 21–24).
//
// Per-class evaluators in `./per-class/*.ts` each implement
// `evaluate(state, event): DerivedIntent[]` and internally route by
// `event.kind`. This isolation keeps each class's trigger logic in one file
// at the cost of one extra function call per registered class per event —
// fine for our scale (≤9 classes, single-digit triggers per encounter).
//
// Conduit has a stub file at `./per-class/conduit.ts` for completeness, but
// is not imported here: its only class-δ trigger is StartTurn-driven "pray",
// which is handled in turn.ts. The empty stub keeps the directory layout
// uniform for Tasks 15+ to fill in when/if Conduit grows action triggers.
//
// Purity contract: this module is pure. Any random draws required by a
// per-class trigger MUST be pre-rolled at the impure call site and passed
// through the event payload. Per the reducer header (reducer.ts:80),
// Math.random is forbidden anywhere under packages/rules/src/.
//
// See `docs/superpowers/specs/2026-05-15-pass-3-slice-2a-class-delta-and-open-actions-design.md`
// § action-driven path.

// AbilityCategory carries the cost-class grouping (signature/heroic) needed by
// Tactician's "ally heroic ability within 10 sq" trigger and similar. Defined
// locally because `@ironyard/shared` does not yet expose this enum — Tasks 22+
// will wire the actual call site, which currently has `Ability.cost` (0 =
// signature, 3/5/7/9 = heroic). When that wire-up lands, this enum can move to
// shared or be derived from the ability record on the fly.
export type AbilityCategory = 'signature' | 'heroic';

/**
 * Context for action-event trigger evaluation. The dispatcher and every
 * per-class evaluator receives this. Tasks 21–24 (call sites in apply-damage,
 * use-ability, roll-power, spend-malice, mark-action-used) build this from:
 *   actor: the originating intent's actor (so derived emissions are attributed
 *     to the user who caused them, not the literal 'server')
 *   rolls: pre-rolled random values needed by class triggers. Engines in
 *     packages/rules/src/ must not call Math.random; the impure call site rolls
 *     and passes values in.
 *
 * Slice 2a entries:
 *   - ferocityD3: Fury Ferocity per-event 1d3 (per-round tookDamage gain, etc.)
 */
export type ActionTriggerContext = {
  actor: Actor;
  rolls: {
    ferocityD3?: number;
  };
};

export type ActionEvent =
  | {
      kind: 'damage-applied';
      dealerId: string | null;
      targetId: string;
      amount: number;
      type: DamageType;
    }
  | {
      kind: 'ability-used';
      actorId: string;
      abilityId: string;
      abilityCategory: AbilityCategory;
      abilityKind: string;
      sideOfActor: 'heroes' | 'foes';
    }
  | {
      kind: 'surge-spent-with-damage';
      actorId: string;
      surgesSpent: number;
      damageType: DamageType;
    }
  | {
      kind: 'creature-force-moved';
      sourceId: string | null;
      targetId: string;
      subkind: 'push' | 'pull' | 'slide';
      distance: number;
    }
  | { kind: 'main-action-used'; actorId: string }
  | { kind: 'malice-spent'; amount: number }
  | { kind: 'roll-power-outcome'; actorId: string; abilityId: string; naturalValues: number[] };

export function evaluateActionTriggers(
  state: CampaignState,
  event: ActionEvent,
  ctx: ActionTriggerContext,
): DerivedIntent[] {
  const derived: DerivedIntent[] = [];
  derived.push(...censor.evaluate(state, event, ctx));
  derived.push(...fury.evaluate(state, event, ctx));
  derived.push(...tactician.evaluate(state, event, ctx));
  derived.push(...shadow.evaluate(state, event, ctx));
  derived.push(...nullClass.evaluate(state, event, ctx));
  derived.push(...talent.evaluate(state, event, ctx));
  derived.push(...troubadour.evaluate(state, event, ctx));
  derived.push(...elementalist.evaluate(state, event, ctx));
  // Conduit's Pray-to-the-Gods is StartTurn-driven; not subscribed here.
  return derived;
}
