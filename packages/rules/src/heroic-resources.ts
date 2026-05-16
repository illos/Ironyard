import type { HeroicResourceName, Participant } from '@ironyard/shared';
import { resolveParticipantClass } from './class-triggers/helpers';
import type { CampaignState } from './types';

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
  wrath: {
    name: 'wrath',
    floor: 0,
    ceiling: null,
    baseGain: { onEncounterStart: 'victories', onTurnStart: { kind: 'flat', amount: 2 } },
  },
  piety: {
    name: 'piety',
    floor: 0,
    ceiling: null,
    baseGain: { onEncounterStart: 'victories', onTurnStart: { kind: 'd3' } },
  },
  essence: {
    name: 'essence',
    floor: 0,
    ceiling: null,
    baseGain: { onEncounterStart: 'victories', onTurnStart: { kind: 'flat', amount: 2 } },
  },
  ferocity: {
    name: 'ferocity',
    floor: 0,
    ceiling: null,
    baseGain: { onEncounterStart: 'victories', onTurnStart: { kind: 'd3' } },
  },
  discipline: {
    name: 'discipline',
    floor: 0,
    ceiling: null,
    baseGain: { onEncounterStart: 'victories', onTurnStart: { kind: 'flat', amount: 2 } },
  },
  insight: {
    name: 'insight',
    floor: 0,
    ceiling: null,
    baseGain: { onEncounterStart: 'victories', onTurnStart: { kind: 'd3' } },
  },
  focus: {
    name: 'focus',
    floor: 0,
    ceiling: null,
    baseGain: { onEncounterStart: 'victories', onTurnStart: { kind: 'flat', amount: 2 } },
  },
  drama: {
    name: 'drama',
    floor: 0,
    ceiling: null,
    baseGain: { onEncounterStart: 'victories', onTurnStart: { kind: 'd3' } },
  },
  clarity: {
    name: 'clarity',
    floor: { formula: 'negative_one_plus_reason' },
    ceiling: null,
    baseGain: { onEncounterStart: 'victories', onTurnStart: { kind: 'd3' } },
  },
};

/**
 * Resolve a config-level `ResourceFloor` to a numeric floor for the given
 * character characteristics. Used at StartEncounter participant materialization
 * to compute Talent's per-character `-(1 + reason)` floor.
 */
export function resolveFloor(floor: ResourceFloor, characteristics: { reason: number }): number {
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

// Pass 3 Slice 2a — 10th-level Psion (Talent class feature) heuristic.
//
// Canon: at 10th level a Talent who picks the Psion feature gains `1d3 + 2`
// clarity per turn instead of `1d3`. The "Psion vs. other 10th-level feature"
// choice is part of the class-feature-choice pipeline that lands with Q18 /
// 2b.7. Until then we use the simplest interim heuristic the slice-2a brief
// allowed:
//
//   participant.level >= 10
//
// `Participant.level` is stamped at StartEncounter from `character.level`
// (see start-encounter.ts). When the class-feature-choice schema slot lands,
// rewire this to read the actual 10th-level Talent feature pick (e.g.
// `character.levelChoices['10'].subclassAbilityIds.includes('psion')` or a
// dedicated `tenthLevelFeature` field). Adding a per-class lookup here keeps
// `getResourceConfigForParticipant` as the single chokepoint for the engine.
//
// Behavioural impact today: every 10th-level Talent receives the d3-plus
// variant. That over-includes the small fraction of 10th-level Talents who
// would pick a non-Psion feature, which is acceptable for slice-2a (interim
// gate; documented in the PS section of the slice-2a spec). Below-10th-level
// Talents are unaffected and continue to receive the plain d3 variant.
function hasPsionFeature(_state: CampaignState, p: Participant): boolean {
  return p.level >= 10;
}

// Phase 2b cleanup 2b.13 — per-class level-feature ramps to the per-turn
// heroic-resource gain. Each feature adds +1 to the per-turn amount at the
// indicated echelon. Sources verified against the class markdowns and
// docs/superpowers/notes/2026-05-16-phase-2b-shipped-code-audit.md cluster 3.
//
// Echelon thresholds for canon class features:
//   L7  — Censor Focused Wrath, Conduit Faithful's Reward, Elementalist
//          Surging Essence, Tactician Heightened Focus
//   L10 — Censor Wrath of the Gods, Tactician True Focus
//
// Bumps stack (Censor at L10 has both Focused Wrath +1 and Wrath of the Gods
// +1, total +2 over baseline).
const PER_TURN_BUMPS: Record<string, { atLevel: number; bump: number }[]> = {
  censor: [
    { atLevel: 7, bump: 1 }, // Focused Wrath (+2 → +3)
    { atLevel: 10, bump: 1 }, // Wrath of the Gods (+3 → +4)
  ],
  conduit: [
    { atLevel: 7, bump: 1 }, // Faithful's Reward (d3 → d3+1)
  ],
  elementalist: [
    { atLevel: 7, bump: 1 }, // Surging Essence (+2 → +3)
  ],
  tactician: [
    { atLevel: 7, bump: 1 }, // Heightened Focus (+2 → +3)
    { atLevel: 10, bump: 1 }, // True Focus (+3 → +4)
  ],
};

/**
 * Total per-turn bump for a class at a given level, summed over all qualifying
 * level features. Returns 0 for classes with no level-feature bumps (Fury,
 * Null, Shadow, Talent, Troubadour — none of these have per-turn-amount level
 * features in canon today; Talent's Psion override is handled separately via
 * the d3-plus path).
 */
function perTurnBump(className: string | null, level: number): number {
  if (!className) return 0;
  const features = PER_TURN_BUMPS[className] ?? [];
  return features.filter((f) => level >= f.atLevel).reduce((sum, f) => sum + f.bump, 0);
}

/**
 * Resolve the active `HeroicResourceConfig` for a participant. Most participants
 * receive the static `HEROIC_RESOURCES[name]` entry verbatim; the only slice-2a
 * variance is the 10th-level Psion Talent override which upgrades the per-turn
 * `1d3` gain to `1d3 + 2`.
 *
 * Returns `null` when the participant carries no heroic resource pool
 * (monsters; PCs with classes whose `heroicResource` is `'unknown'`). Call
 * sites must null-check.
 *
 * Note on `extraGainTriggers`: the slice-2a file-structure note ("populated
 * where table-driven") was preemptive. The per-class extra gain hooks for
 * Censor (Wrath on damage), Fury (Ferocity on damage taken), Shadow (Insight
 * on first-time kill of a target type), Talent (Clarity on creature
 * force-moved), Tactician (Focus on heroes acting), Null (Discipline on
 * heroes acting), Troubadour (Drama on death) and Elementalist (Essence on
 * Maintenance start) are all event-driven derived intents — they live in
 * `class-triggers/per-class/*.ts` (per Tasks 12–15) rather than as a static
 * table on `HeroicResourceConfig`. Adding an `extraGainTriggers` field here
 * would be redundant with the trigger registry. Defer until a gain variant
 * appears that genuinely needs declarative table-driven config.
 */
export function getResourceConfigForParticipant(
  state: CampaignState,
  p: Participant,
): HeroicResourceConfig | null {
  if (p.heroicResources.length === 0) return null;
  const resource = p.heroicResources[0];
  if (!resource) return null;
  const base = HEROIC_RESOURCES[resource.name];
  if (!base) return null;

  const className = resolveParticipantClass(state, p);

  // Slice 2a: 10th-level Psion Talent gets d3-plus instead of d3.
  if (
    className === 'talent' &&
    base.baseGain.onTurnStart.kind === 'd3' &&
    hasPsionFeature(state, p)
  ) {
    return {
      ...base,
      baseGain: {
        ...base.baseGain,
        onTurnStart: { kind: 'd3-plus', bonus: 2 },
      },
    };
  }

  // Phase 2b 2b.13: per-class level-feature bumps to the per-turn gain.
  // Apply additively over the base shape: flat → flat+N; d3 → d3-plus(N);
  // d3-plus → d3-plus(existing+N). Returns the original base when no bump.
  const bump = perTurnBump(className, p.level);
  if (bump > 0) {
    const gain = base.baseGain.onTurnStart;
    if (gain.kind === 'flat') {
      return {
        ...base,
        baseGain: { ...base.baseGain, onTurnStart: { kind: 'flat', amount: gain.amount + bump } },
      };
    }
    if (gain.kind === 'd3') {
      return {
        ...base,
        baseGain: { ...base.baseGain, onTurnStart: { kind: 'd3-plus', bonus: bump } },
      };
    }
    if (gain.kind === 'd3-plus') {
      return {
        ...base,
        baseGain: {
          ...base.baseGain,
          onTurnStart: { kind: 'd3-plus', bonus: gain.bonus + bump },
        },
      };
    }
  }

  return base;
}
