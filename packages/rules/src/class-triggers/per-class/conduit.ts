import type { CampaignState, DerivedIntent } from '../../types';
import type { ActionEvent, ActionTriggerContext } from '../action-triggers';

// Pass 3 Slice 2a — Conduit class-δ action triggers.
//
// Intentional no-op. Conduit's only class-δ trigger is the StartTurn-driven
// "Pray to the Gods" prompt (canon § 5.4.2), which is handled by turn.ts
// (Task 25) rather than via the action-event dispatcher. There is no
// damage-applied, ability-used, or other action event that grants piety.
//
// This file exists for directory uniformity with the other per-class
// triggers and so future taps (if Conduit grows an action-driven trigger
// later) have an obvious landing spot. It is intentionally NOT imported by
// `action-triggers.ts` (see the comment block there) — adding it to the
// dispatcher would just burn a function call per event for nothing.
//
// Signature mirrors the rest of the per-class evaluators so the file is
// drop-in if/when Conduit acquires an action trigger.

export function evaluate(
  _state: CampaignState,
  _event: ActionEvent,
  _ctx: ActionTriggerContext,
): DerivedIntent[] {
  return [];
}
