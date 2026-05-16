// Phase 2b Group A+B (slice 8) — Orc Bloodfire Rush.
//
// Canon (Orc.md "Bloodfire Rush (1 Point)"): "The first time in any combat
// round that you take damage, you gain a +2 bonus to speed until the end
// of the round."
//
// First-damage-this-round latch via `participant.bloodfireActive`. The
// onDamageApplied hook fires SetBloodfireActive { active: true } when an
// Orc with the trait takes their first delivered damage of the round
// (latch held until end of round). The onEndRound hook sweeps and emits
// SetBloodfireActive { active: false } for any participant still flagged.
// getEffectiveSpeed (effective.ts) adds +2 to base speed when active.
//
// Slug + ancestry gate: parse-ancestry slugifies trait names to lowercase
// kebab-case, so Bloodfire Rush → 'bloodfire-rush'. Combined with the
// ancestry check (only Orcs) for safety against future homebrew collisions.

import { type ConditionType, IntentTypes, type Participant } from '@ironyard/shared';
import type { CampaignState, DerivedIntent } from '../types';
import { isParticipant } from '../types';
import type { AncestryTriggerContext } from './index';

const BLOODFIRE_ANCESTRIES = new Set(['orc']);

export function hasBloodfireRush(p: Participant): boolean {
  return (
    p.purchasedTraits.includes('bloodfire-rush') &&
    p.ancestry.some((a) => BLOODFIRE_ANCESTRIES.has(a))
  );
}

export function onConditionApplied(
  _state: CampaignState,
  _payload: { participantId: string; condition: ConditionType },
  _ctx: AncestryTriggerContext,
): DerivedIntent[] {
  return [];
}

export function onDamageApplied(
  state: CampaignState,
  payload: { targetId: string; dealerId: string | null; delivered: number },
  ctx: AncestryTriggerContext,
): DerivedIntent[] {
  if (payload.delivered <= 0) return [];
  const target = state.participants.filter(isParticipant).find((p) => p.id === payload.targetId);
  if (!target || !hasBloodfireRush(target) || target.bloodfireActive) return [];
  return [
    {
      actor: ctx.actor,
      source: 'server' as const,
      type: IntentTypes.SetBloodfireActive,
      payload: { participantId: target.id, active: true },
    },
  ];
}

export function onEndRound(state: CampaignState, ctx: AncestryTriggerContext): DerivedIntent[] {
  const derived: DerivedIntent[] = [];
  for (const p of state.participants.filter(isParticipant)) {
    if (p.bloodfireActive) {
      derived.push({
        actor: ctx.actor,
        source: 'server' as const,
        type: IntentTypes.SetBloodfireActive,
        payload: { participantId: p.id, active: false },
      });
    }
  }
  return derived;
}
