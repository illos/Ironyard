import type { CampaignState, DerivedIntent } from '../../types';
import type { ActionEvent } from '../action-triggers';

// Pass 3 Slice 2a — Conduit class-δ action triggers.
//
// Stub: Conduit does not subscribe to any action event in slice-2a — its only
// class-δ trigger is the StartTurn-driven "pray" handled in turn.ts. This
// stub exists for directory uniformity and so future taps (if Conduit grows
// action triggers later) have a landing spot. Not imported by
// `action-triggers.ts`; see the comment block there.
//
// Implementation in Task 15 (Elementalist / Conduit) only if Conduit acquires
// an action-driven trigger; otherwise this stays an intentional no-op.

export function evaluate(_state: CampaignState, _event: ActionEvent): DerivedIntent[] {
  return []; // Implementation in Task 15 (if needed)
}
