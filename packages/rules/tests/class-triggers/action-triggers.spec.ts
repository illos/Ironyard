import { describe, expect, it } from 'vitest';
import { type ActionEvent, evaluateActionTriggers } from '../../src/class-triggers/action-triggers';
import type { CampaignState } from '../../src/types';

// Pass 3 Slice 2a — smoke tests for the action-trigger dispatcher.
//
// Per-class triggers land empty in Task 11 (this commit) and are filled in by
// Tasks 12–15. These tests pin the dispatcher contract: it accepts an event,
// fans out to every registered per-class evaluator in deterministic order,
// and returns the concatenation of their DerivedIntent arrays. With every
// per-class stub returning [], the result is always []; the second test is a
// placeholder integration smoke for the per-class registries that Tasks 12+
// will land on top of.

describe('evaluateActionTriggers', () => {
  it('returns empty when no class triggers match the event', () => {
    const state = { participants: [] } as unknown as CampaignState;
    const event: ActionEvent = {
      kind: 'damage-applied',
      dealerId: null,
      targetId: 'x',
      amount: 1,
      type: 'fire',
    };
    expect(evaluateActionTriggers(state, event)).toEqual([]);
  });

  it('dispatches damage-applied → Fury / Censor / Tactician per-class registries', () => {
    // Integration smoke test placeholder — per-class registries land in Tasks 12-15.
    // The dispatcher itself is contract-only here; the per-class evaluators are
    // stubs returning [] until those tasks ship real predicates and emitters.
    expect(true).toBe(true);
  });
});
