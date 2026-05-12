import { describe, expect, it } from 'vitest';
import { getAncestryTraitPointBudget } from '../src/data/ancestry-points';

describe('getAncestryTraitPointBudget', () => {
  it('returns the right budget for each ancestry', () => {
    expect(getAncestryTraitPointBudget('memonek')).toBe(4);
    expect(getAncestryTraitPointBudget('polder')).toBe(4);
    expect(getAncestryTraitPointBudget('human')).toBe(3);
    expect(getAncestryTraitPointBudget('revenant')).toBe(2);
  });

  it('returns null for unknown ancestries', () => {
    expect(getAncestryTraitPointBudget('not-a-real-ancestry')).toBeNull();
  });

  it('returns null for null input', () => {
    expect(getAncestryTraitPointBudget(null)).toBeNull();
  });
});
