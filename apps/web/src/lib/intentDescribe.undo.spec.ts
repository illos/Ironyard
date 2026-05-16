// Tests for findLatestUndoable — director bypass and default (player) boundary.

import { IntentTypes } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import type { MirrorIntent } from '../ws/useSessionSocket';
import { findLatestUndoable } from './intentDescribe';

let seq = 0;
function makeEntry(type: string, overrides: Partial<MirrorIntent> = {}): MirrorIntent {
  seq += 1;
  return {
    id: `intent-${seq}`,
    seq,
    type,
    payload: {},
    actor: { userId: 'u1', role: 'director' },
    source: 'manual',
    voided: false,
    ...overrides,
  };
}

describe('findLatestUndoable', () => {
  describe('default behavior — EndRound boundary applies (player path)', () => {
    it('returns null when the only undoable action is before the EndRound', () => {
      const log: MirrorIntent[] = [
        makeEntry(IntentTypes.ApplyDamage),
        makeEntry(IntentTypes.EndRound),
      ];
      expect(findLatestUndoable(log)).toBeNull();
    });

    it('returns an action that is after the EndRound', () => {
      const log: MirrorIntent[] = [
        makeEntry(IntentTypes.ApplyDamage), // before EndRound
        makeEntry(IntentTypes.EndRound),
        makeEntry(IntentTypes.ApplyDamage), // after EndRound → undoable
      ];
      const result = findLatestUndoable(log);
      if (!result) throw new Error('expected a result');
      expect(result.type).toBe(IntentTypes.ApplyDamage);
      const lastEntry = log[2];
      if (!lastEntry) throw new Error('missing log entry');
      expect(result.seq).toBe(lastEntry.seq);
    });

    it('skips voided entries', () => {
      const log: MirrorIntent[] = [
        makeEntry(IntentTypes.ApplyDamage),
        makeEntry(IntentTypes.EndRound),
        makeEntry(IntentTypes.ApplyDamage, { voided: true }),
      ];
      expect(findLatestUndoable(log)).toBeNull();
    });

    it('skips derived (causedBy) entries', () => {
      const log: MirrorIntent[] = [
        makeEntry(IntentTypes.EndRound),
        makeEntry(IntentTypes.ApplyDamage, { causedBy: 'some-parent-id' }),
      ];
      expect(findLatestUndoable(log)).toBeNull();
    });
  });

  describe('bypassRoundBoundary — director gets unbounded undo', () => {
    // Note: EndRound is not in the "always skip" list (only Undo/JoinLobby/LeaveLobby
    // are). So an EndRound at the END of the log IS returned as undoable.
    // The point of bypassRoundBoundary is that actions BEFORE EndRound are also
    // reachable — the boundary clip is skipped entirely.

    it('returns the newest entry when it is after the EndRound', () => {
      // Simulate: round ended, then a new ApplyDamage was dispatched.
      const log: MirrorIntent[] = [
        makeEntry(IntentTypes.ApplyDamage), // past round
        makeEntry(IntentTypes.EndRound),
        makeEntry(IntentTypes.ApplyDamage), // newest — returned first
      ];
      const result = findLatestUndoable(log, { bypassRoundBoundary: true });
      if (!result) throw new Error('expected a result');
      const lastEntry = log[2];
      if (!lastEntry) throw new Error('missing log entry');
      expect(result.seq).toBe(lastEntry.seq);
    });

    it('returns EndRound itself when it is the last entry (director can undo EndRound)', () => {
      // Key director scenario: the log ends with EndRound — director should be
      // able to target it for undo. With bypass=true the boundary does not clip.
      const applyDamage = makeEntry(IntentTypes.ApplyDamage);
      const endRound = makeEntry(IntentTypes.EndRound);
      const log: MirrorIntent[] = [applyDamage, endRound];
      const result = findLatestUndoable(log, { bypassRoundBoundary: true });
      if (!result) throw new Error('expected a result');
      expect(result.seq).toBe(endRound.seq);
    });

    it('returns ApplyDamage when the EndRound before it is voided', () => {
      // After director undoes EndRound it is voided; ApplyDamage becomes reachable.
      const applyDamage = makeEntry(IntentTypes.ApplyDamage);
      const endRound = makeEntry(IntentTypes.EndRound, { voided: true });
      const log: MirrorIntent[] = [applyDamage, endRound];
      const result = findLatestUndoable(log, { bypassRoundBoundary: true });
      if (!result) throw new Error('expected a result');
      expect(result.seq).toBe(applyDamage.seq);
    });

    it('returns the most recent undoable entry across multiple rounds', () => {
      const r1damage = makeEntry(IntentTypes.ApplyDamage); // round 1 action
      const r1end = makeEntry(IntentTypes.EndRound); // round 1 end
      const r2start = makeEntry(IntentTypes.StartRound); // round 2 start
      makeEntry(IntentTypes.ApplyDamage); // round 2 action (seq assigned)
      const r2end = makeEntry(IntentTypes.EndRound); // round 2 end
      const log: MirrorIntent[] = [r1damage, r1end, r2start, r2end];
      const result = findLatestUndoable(log, { bypassRoundBoundary: true });
      if (!result) throw new Error('expected a result');
      // Walking from the end: r2end is last and not filtered → returned.
      expect(result.seq).toBe(r2end.seq);
    });

    it('still skips voided entries even with bypass', () => {
      const log: MirrorIntent[] = [
        makeEntry(IntentTypes.ApplyDamage, { voided: true }),
        makeEntry(IntentTypes.EndRound, { voided: true }),
      ];
      expect(findLatestUndoable(log, { bypassRoundBoundary: true })).toBeNull();
    });

    it('still skips derived (causedBy) entries even with bypass', () => {
      const log: MirrorIntent[] = [
        makeEntry(IntentTypes.ApplyDamage, { causedBy: 'parent-id' }),
        makeEntry(IntentTypes.EndRound, { causedBy: 'some-parent' }),
      ];
      expect(findLatestUndoable(log, { bypassRoundBoundary: true })).toBeNull();
    });

    it('returns null on an empty log', () => {
      expect(findLatestUndoable([], { bypassRoundBoundary: true })).toBeNull();
    });
  });
});
