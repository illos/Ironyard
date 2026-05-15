import { describe, it, expect } from 'vitest';
import { RANK_PALETTE, parseMonsterRole, type RankKey } from './rank-palette';

describe('RANK_PALETTE', () => {
  it('exposes six canonical ranks with 3-letter abbreviations', () => {
    expect(Object.keys(RANK_PALETTE).sort()).toEqual(
      ['Elite', 'Horde', 'Leader', 'Minion', 'Platoon', 'Solo']
    );
    const expectedAbbrs: Record<RankKey, string> = {
      Minion: 'MIN', Horde: 'HOR', Platoon: 'PLA',
      Elite: 'ELI', Leader: 'LED', Solo: 'SOL',
    };
    for (const [rank, expected] of Object.entries(expectedAbbrs)) {
      expect(RANK_PALETTE[rank as RankKey].abbr).toBe(expected);
    }
  });
});

describe('parseMonsterRole', () => {
  it('parses a rank-family role string into the discriminated parts', () => {
    expect(parseMonsterRole('Boss Brute')).toEqual({ rank: null, family: 'Boss Brute' });
    expect(parseMonsterRole('Elite Defender')).toEqual({ rank: 'Elite', family: 'Defender' });
    expect(parseMonsterRole('Minion Skirmisher')).toEqual({ rank: 'Minion', family: 'Skirmisher' });
    expect(parseMonsterRole('Solo Brute')).toEqual({ rank: 'Solo', family: 'Brute' });
  });

  it('returns the whole string as family when the leading word is not a known rank', () => {
    expect(parseMonsterRole('Controller')).toEqual({ rank: null, family: 'Controller' });
    expect(parseMonsterRole('\\-')).toEqual({ rank: null, family: '\\-' });
  });

  it('handles single-word role strings as unranked', () => {
    expect(parseMonsterRole('Brute')).toEqual({ rank: null, family: 'Brute' });
  });
});
