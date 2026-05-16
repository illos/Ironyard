import { RANK_PALETTE, type RankKey } from './rank-palette';

export type RoleReadoutData =
  | { kind: 'monster-ranked'; level: number; rank: RankKey; family: string }
  | { kind: 'monster-unranked'; level: number; family: string }
  | { kind: 'monster-fallback'; level: number }
  | { kind: 'pc'; level: number; className: string | null };

export interface RoleReadoutProps {
  data: RoleReadoutData;
}

/**
 * Renders the role-readout meta line inside a ParticipantRow's `role` slot.
 * Three monster variants (ranked, unranked, pre-2b2a fallback) plus PC.
 * Returns a mono-uppercase line composed in dimmed accent.
 */
export function RoleReadout({ data }: RoleReadoutProps) {
  if (data.kind === 'monster-ranked') {
    const palette = RANK_PALETTE[data.rank];
    return (
      <span className="inline-flex items-center gap-1.5">
        <span
          className={`inline-block px-1 border ${palette.tailwindClass} font-mono text-[9px] tracking-[0.08em]`}
        >
          {palette.abbr}
        </span>
        <span>
          L{data.level} · {data.family.toUpperCase()}
        </span>
      </span>
    );
  }
  if (data.kind === 'monster-unranked') {
    return (
      <span>
        L{data.level} · {data.family.toUpperCase()}
      </span>
    );
  }
  if (data.kind === 'monster-fallback') {
    return <span>L{data.level} · FOE</span>;
  }
  // pc
  const label = data.className ? data.className.toUpperCase() : 'HERO';
  return (
    <span>
      L{data.level} · {label}
    </span>
  );
}
