// Phase 2b Group A+B (slice 6 stub for slice 9) — Memonek Fall Lightly /
// Lightweight. Slice 9 populates appropriate subscribers (likely on fall /
// forced-move events). Today empty stubs keep the dispatcher compiling.

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
