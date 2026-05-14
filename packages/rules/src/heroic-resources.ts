import type { HeroicResourceName } from '@ironyard/shared';

// Canon § 5.3 / § 5.4 / § 5.4.9. Static per-class config consumed by
// StartEncounter (encounter-start preload) and StartTurn (per-turn gain).
// The 9 resources are a closed canon set; extending requires a canon edit
// and an entry here.

export type ResourceFloor = 0 | { formula: 'negative_one_plus_reason' };

export type TurnStartGain =
  | { kind: 'flat'; amount: number }
  | { kind: 'd3' }
  | { kind: 'd3-plus'; bonus: number }; // 2b.0.1 wires 10th-level Psion 1d3+2

export type HeroicResourceConfig = {
  name: HeroicResourceName;
  floor: ResourceFloor;
  ceiling: null;
  baseGain: {
    onEncounterStart: 'victories';
    onTurnStart: TurnStartGain;
  };
};

export const HEROIC_RESOURCES: Record<HeroicResourceName, HeroicResourceConfig> = {
  wrath:      { name: 'wrath',      floor: 0, ceiling: null, baseGain: { onEncounterStart: 'victories', onTurnStart: { kind: 'flat', amount: 2 } } },
  piety:      { name: 'piety',      floor: 0, ceiling: null, baseGain: { onEncounterStart: 'victories', onTurnStart: { kind: 'd3' } } },
  essence:    { name: 'essence',    floor: 0, ceiling: null, baseGain: { onEncounterStart: 'victories', onTurnStart: { kind: 'flat', amount: 2 } } },
  ferocity:   { name: 'ferocity',   floor: 0, ceiling: null, baseGain: { onEncounterStart: 'victories', onTurnStart: { kind: 'd3' } } },
  discipline: { name: 'discipline', floor: 0, ceiling: null, baseGain: { onEncounterStart: 'victories', onTurnStart: { kind: 'flat', amount: 2 } } },
  insight:    { name: 'insight',    floor: 0, ceiling: null, baseGain: { onEncounterStart: 'victories', onTurnStart: { kind: 'd3' } } },
  focus:      { name: 'focus',      floor: 0, ceiling: null, baseGain: { onEncounterStart: 'victories', onTurnStart: { kind: 'flat', amount: 2 } } },
  drama:      { name: 'drama',      floor: 0, ceiling: null, baseGain: { onEncounterStart: 'victories', onTurnStart: { kind: 'd3' } } },
  clarity:    { name: 'clarity',    floor: { formula: 'negative_one_plus_reason' }, ceiling: null, baseGain: { onEncounterStart: 'victories', onTurnStart: { kind: 'd3' } } },
};

/**
 * Resolve a config-level `ResourceFloor` to a numeric floor for the given
 * character characteristics. Used at StartEncounter participant materialization
 * to compute Talent's per-character `-(1 + reason)` floor.
 */
export function resolveFloor(
  floor: ResourceFloor,
  characteristics: { reason: number },
): number {
  if (typeof floor === 'number') return floor;
  if (floor.formula === 'negative_one_plus_reason') {
    return -(1 + characteristics.reason);
  }
  // Exhaustive switch — TypeScript would catch a new formula at compile time
  // if a new branch was added without handling.
  const _exhaustive: never = floor.formula;
  void _exhaustive;
  return 0;
}
