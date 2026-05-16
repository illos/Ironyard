// Phase 2b Group A+B (slice 6 stub for slice 9) — Orc Relentless.
//
// Slice 9 populates `onStaminaTransitioned` (winded → +N temp stamina or
// edge per canon). Today exports empty fn so the dispatcher compiles.

import type { StaminaTransitionedPayload } from '@ironyard/shared';
import type { CampaignState, DerivedIntent } from '../types';
import type { AncestryTriggerContext } from './index';

export function onStaminaTransitioned(
  _state: CampaignState,
  _payload: StaminaTransitionedPayload,
  _ctx: AncestryTriggerContext,
): DerivedIntent[] {
  return [];
}
