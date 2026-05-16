import type { CampaignState, DerivedIntent } from '../../types';
import type { ActionEvent } from '../action-triggers';

// Pass 3 Slice 2a — Troubadour class-δ action triggers.
//
// Stub: Task 11 ships the dispatch infrastructure with empty per-class
// evaluators so the action-trigger pipeline compiles end-to-end. Real
// implementation lands in Task 14 (Troubadour).

export function evaluate(_state: CampaignState, _event: ActionEvent): DerivedIntent[] {
  return []; // Implementation in Task 14
}
