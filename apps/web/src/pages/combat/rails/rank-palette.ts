/**
 * Phase 5 Pass 2b2a — monster rank → display-pill palette.
 *
 * Six canonical Draw Steel ranks per the SteelCompendium ingest. Categorical
 * palette: each rank gets its own hue (gray / green / teal / violet / amber /
 * red). The 3-letter abbreviation keeps every pill the same width — full
 * words wouldn't fit alongside the level + family on a phone-portrait rail.
 *
 * Seven monsters in the current ingest have role strings that don't match
 * a known rank prefix ("Controller", "Artillery", "Hexer", "\\-"); those
 * render without a pill via `parseMonsterRole` returning `rank: null`.
 */

export const RANK_PALETTE = {
  Minion:  { abbr: 'MIN', cssVar: '--rank-min', tailwindClass: 'text-rank-min bg-rank-min/12 border-rank-min/40' },
  Horde:   { abbr: 'HOR', cssVar: '--rank-hor', tailwindClass: 'text-rank-hor bg-rank-hor/12 border-rank-hor/45' },
  Platoon: { abbr: 'PLA', cssVar: '--rank-pla', tailwindClass: 'text-rank-pla bg-rank-pla/12 border-rank-pla/45' },
  Elite:   { abbr: 'ELI', cssVar: '--rank-eli', tailwindClass: 'text-rank-eli bg-rank-eli/12 border-rank-eli/45' },
  Leader:  { abbr: 'LED', cssVar: '--rank-led', tailwindClass: 'text-rank-led bg-rank-led/14 border-rank-led/50' },
  Solo:    { abbr: 'SOL', cssVar: '--rank-sol', tailwindClass: 'text-rank-sol bg-rank-sol/16 border-rank-sol/55' },
} as const;

export type RankKey = keyof typeof RANK_PALETTE;

const KNOWN_RANKS = new Set(Object.keys(RANK_PALETTE) as RankKey[]);

export function parseMonsterRole(role: string): { rank: RankKey | null; family: string } {
  const parts = role.split(/\s+/);
  if (parts.length >= 2 && KNOWN_RANKS.has(parts[0] as RankKey)) {
    return { rank: parts[0] as RankKey, family: parts.slice(1).join(' ') };
  }
  return { rank: null, family: role };
}
