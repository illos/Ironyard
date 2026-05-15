import type { Participant } from '@ironyard/shared';

export interface MonsterStatBlockProps {
  participant: Participant;
}

function fmt(n: number | null): string {
  return n === null ? '—' : String(n);
}

function fmtMod(n: number): string {
  return n >= 0 ? `+${n}` : String(n);
}

const CHAR_LABELS: { key: keyof Participant['characteristics']; label: string }[] = [
  { key: 'might', label: 'Might' },
  { key: 'agility', label: 'Agility' },
  { key: 'reason', label: 'Reason' },
  { key: 'intuition', label: 'Intuition' },
  { key: 'presence', label: 'Presence' },
];

/**
 * Phase 5 Pass 2b2a — DetailPane Full-sheet monster stat-block.
 * Rulebook-style compact block above the abilities list. Renders
 * characteristic 5-up grid, physical-stats row, defenses (when present),
 * and With-Captain effect (when present).
 *
 * Pre-2b2a snapshots show "—" for the new monster-meta fields that load null.
 */
export function MonsterStatBlock({ participant }: MonsterStatBlockProps) {
  const { characteristics, size, speed, stability, freeStrike, ev, immunities, weaknesses, withCaptain } = participant;
  // ?? [] guards WS-mirrored snapshots where Zod .default([]) hasn't fired
  const safeImmunities = immunities ?? [];
  const safeWeaknesses = weaknesses ?? [];
  const hasDefenses = safeImmunities.length > 0 || safeWeaknesses.length > 0;

  return (
    <div className="border border-line bg-ink-1 p-3 space-y-2">
      <div className="grid grid-cols-5 gap-1">
        {CHAR_LABELS.map(({ key, label }) => (
          <div key={key} className="border border-line bg-ink-2 px-1.5 py-2 text-center">
            <div className="font-mono text-[9px] uppercase tracking-[0.06em] text-text-mute">{label}</div>
            <div className="font-mono text-base font-bold tabular-nums text-text mt-0.5">
              {fmtMod(characteristics[key])}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span><span className="font-mono text-[10px] uppercase tracking-[0.06em] text-text-mute">Size</span> <span className="font-mono tabular-nums">{size ?? '—'}</span></span>
        <span><span className="font-mono text-[10px] uppercase tracking-[0.06em] text-text-mute">Speed</span> <span className="font-mono tabular-nums">{fmt(speed)}</span></span>
        <span><span className="font-mono text-[10px] uppercase tracking-[0.06em] text-text-mute">Stab</span> <span className="font-mono tabular-nums">{fmt(stability)}</span></span>
        <span><span className="font-mono text-[10px] uppercase tracking-[0.06em] text-text-mute">Free Strike</span> <span className="font-mono tabular-nums">{fmt(freeStrike)}</span></span>
        <span><span className="font-mono text-[10px] uppercase tracking-[0.06em] text-text-mute">EV</span> <span className="font-mono tabular-nums">{fmt(ev)}</span></span>
      </div>

      {hasDefenses && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {safeImmunities.length > 0 && (
            <span>
              <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-text-mute">Immune</span>{' '}
              <span className="font-mono">{safeImmunities.map((i) => `${i.type} ${i.value}`).join(' · ')}</span>
            </span>
          )}
          {safeWeaknesses.length > 0 && (
            <span>
              <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-text-mute">Weak</span>{' '}
              <span className="font-mono">{safeWeaknesses.map((w) => `${w.type} ${w.value}`).join(' · ')}</span>
            </span>
          )}
        </div>
      )}

      {/* != null catches undefined from WS-mirrored snapshots (bypass Zod parse) */}
      {withCaptain != null && (
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.06em] text-text-mute">With Captain</div>
          <div className="text-xs text-text-dim italic mt-0.5">{withCaptain}</div>
        </div>
      )}
    </div>
  );
}
