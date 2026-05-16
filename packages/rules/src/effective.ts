import type { ConditionType, Participant, TypedResistance } from '@ironyard/shared';
import { hasWings } from './ancestry-triggers/wings';

// Phase 2b Group A+B — read-site helpers for per-encounter dynamic state.
// Pure functions over Participant. Consumers replace direct field reads
// with these so per-encounter dynamic effects layer on cleanly without
// requiring full CharacterRuntime re-derivation.
//
// Slice 2 — isImmuneToCondition. Generalizes 2b.15's Bloodless-specific
// suppression to a typed lookup over participant.conditionImmunities.
// Set-union semantics: additive across all sources.

export function isImmuneToCondition(p: Participant, cond: ConditionType): boolean {
  return p.conditionImmunities.includes(cond);
}

// Slice 6 — getEffectiveWeaknesses layers per-encounter conditional
// weaknesses over the snapshot in participant.weaknesses.
//
// Canon (Devil.md / Dragon Knight.md, "Wings (2 Points)"):
//   "While using your wings to fly at 3rd level or lower, you have damage
//    weakness 5."
//
// The canon text says "damage weakness 5" without a type, but the spec
// (2026-05-16-phase-2b-group-a-plus-b-design.md § Slice 6) calls for fire 5
// — that's the audit-resolved canonical type. If a future audit re-types
// this we update this helper.
//
// Layering: additive set-union with the base list. Consumers (damage.ts)
// then call sumMatching as before.
export function getEffectiveWeaknesses(p: Participant, level: number): TypedResistance[] {
  const base = p.weaknesses;
  const flying = p.movementMode?.mode === 'flying';
  const echelon1 = level <= 3;
  if (flying && echelon1 && hasWings(p)) {
    return [...base, { type: 'fire', value: 5 }];
  }
  return base;
}

// Slice 9 — getSizeForForcedMove reduces a Memonek's size by one tier
// when computing forced-movement resolution. Canon (Memonek.md
// "Signature Trait: Lightweight"): "Whenever another creature attempts to
// force move you, you treat your size as one size smaller than it is."
//
// Engine doesn't currently have a forced-move resolution path that reads
// participant.size for opposed-size checks (no apply-force-move reducer in
// packages/rules/src/intents/). When that lands, the consumer reads through
// this helper. Today the helper is structurally present + tested so the
// trait isn't silently absent; the consumer-site wiring is deferred to the
// future force-move slice.
//
// Size-tier ordering follows the Draw Steel canon: tiny (1T) < small (1S)
// < medium (1M) < large (1L) < huge (2L). The helper drops one tier; at
// the smallest tier it returns the base unchanged (you can't get smaller).
const SIZE_DROP_TIERS: Record<string, string> = {
  '2L': '1L',
  '1L': '1M',
  '1M': '1S',
  '1S': '1T',
};

export function getSizeForForcedMove(p: Participant): string {
  const base = p.size ?? '1M';
  if (!p.ancestry.includes('memonek')) return base;
  return SIZE_DROP_TIERS[base] ?? base;
}

// Slice 8 — getEffectiveSpeed layers Bloodfire Rush's +2 speed over the
// snapshot in participant.speed.
//
// Canon (Orc.md "Bloodfire Rush"): +2 speed until end of round, latched on
// the first delivered damage of the round. Engine doesn't track movement
// distances (per CLAUDE.md / project_no_movement_tracking memory), so this
// helper is a UI / display-time read site.
//
// Defaults: monster participants may have null speed; treat null as 0 for
// the addition. Bloodfire only applies to Orcs (gated by the trigger itself
// via hasBloodfireRush); this helper trusts the latch — if bloodfireActive
// is true, +2 applies regardless of source. Future ancestry buffs to speed
// can layer here additively.
export function getEffectiveSpeed(p: Participant): number {
  const base = p.speed ?? 0;
  return p.bloodfireActive ? base + 2 : base;
}
