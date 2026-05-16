import { describe, expect, it } from 'vitest';
import { getSizeForForcedMove } from '../../src/effective';
import { makeHeroParticipant } from '../intents/test-utils';

// Phase 2b Group A+B (slice 9) — Memonek Lightweight (signature trait).
// Canon (Memonek.md): "Whenever another creature attempts to force move you,
// you treat your size as one size smaller than it is."
//
// Read-site helper only — no force-move consumer in packages/rules/src/intents/
// today, so this is structurally present and tested. Consumer-site wiring
// lands when force-move infrastructure ships.

describe('effective.getSizeForForcedMove — Memonek Lightweight', () => {
  it.each([
    ['2L', '1L'],
    ['1L', '1M'],
    ['1M', '1S'],
    ['1S', '1T'],
  ])('Memonek size %s drops one tier to %s for forced-move resolution', (base, expected) => {
    const memonek = makeHeroParticipant('pc-memo', { ancestry: ['memonek'], size: base });
    expect(getSizeForForcedMove(memonek)).toBe(expected);
  });

  it('Memonek already at smallest tier (1T) returns 1T unchanged', () => {
    const memonek = makeHeroParticipant('pc-memo', { ancestry: ['memonek'], size: '1T' });
    expect(getSizeForForcedMove(memonek)).toBe('1T');
  });

  it('non-Memonek returns base size unchanged regardless of size', () => {
    const human = makeHeroParticipant('pc-human', { ancestry: ['human'], size: '1M' });
    expect(getSizeForForcedMove(human)).toBe('1M');
  });

  it('returns default 1M when size is null', () => {
    const memonek = makeHeroParticipant('pc-memo', { ancestry: ['memonek'], size: null });
    // null → defaults to '1M' inside helper; Memonek drops to '1S'
    expect(getSizeForForcedMove(memonek)).toBe('1S');
  });
});
