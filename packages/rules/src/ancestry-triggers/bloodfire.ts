// Phase 2b Group A+B (slice 6 stub for slice 8) — Orc Bloodfire Rush.
//
// Slice 8 populates `onDamageApplied` (first delivered damage of a round →
// set `bloodfireActive = true`, +2 effective speed) and `onEndRound` (clear
// `bloodfireActive`). Today these export empty fns so the dispatcher
// (./index.ts) compiles.

import type { ConditionType } from '@ironyard/shared';
import type { CampaignState, DerivedIntent } from '../types';
import type { AncestryTriggerContext } from './index';

export function onConditionApplied(
  _state: CampaignState,
  _payload: { participantId: string; condition: ConditionType },
  _ctx: AncestryTriggerContext,
): DerivedIntent[] {
  return [];
}

export function onEndRound(_state: CampaignState, _ctx: AncestryTriggerContext): DerivedIntent[] {
  return [];
}

export function onDamageApplied(
  _state: CampaignState,
  _payload: { targetId: string; dealerId: string | null; delivered: number },
  _ctx: AncestryTriggerContext,
): DerivedIntent[] {
  return [];
}
