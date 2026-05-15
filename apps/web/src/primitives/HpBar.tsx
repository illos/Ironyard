export type HpBarProps = {
  current: number;
  max: number;
  /** Visual size; iPad detail pane uses 'lg', initiative panel rows use 'sm'. */
  size?: 'sm' | 'lg';
  /** Slim 4px-tall variant. The numeric label is the caller's responsibility. */
  compact?: boolean;
  /**
   * Phase 5 Pass 2b2a — 22px-tall variant with the current/max readout
   * centered inside. Used by ParticipantRow rails. Composes its own colors
   * (good/warn/bad fill + desaturated background pair) — caller renders no
   * external numeric label.
   */
  variant?: 'inline';
};

export function HpBar({ current, max, size = 'sm', compact = false, variant }: HpBarProps) {
  const pct = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
  const zone = pct >= 0.5 ? 'good' : pct >= 0.25 ? 'warn' : 'bad';

  if (variant === 'inline') {
    return (
      <div
        className={`relative h-[22px] w-full overflow-hidden border border-line bg-hp-${zone}-dim`}
        aria-hidden="true"
      >
        <div
          className={`absolute inset-y-0 left-0 bg-hp-${zone} transition-[width] duration-300 ease-out`}
          style={{ width: `${pct * 100}%` }}
        />
        <div className="relative z-10 flex h-full items-center justify-center font-mono text-[13px] font-bold tabular-nums leading-none text-text [text-shadow:0_1px_2px_rgb(0_0_0/0.7)]">
          {current}
          <span className="text-text-dim font-medium text-[10px] ml-px opacity-85">/{max}</span>
        </div>
      </div>
    );
  }

  const color = `bg-hp-${zone}`;
  const height = compact ? 'h-1' : size === 'lg' ? 'h-3' : 'h-1.5';
  // Visual-only — the numeric `current / max` is rendered alongside in the
  // parent. Skipping role="progressbar" avoids the focusable-interactive rule
  // and keeps the bar a pure presentation element; screen readers get the
  // numbers from the adjacent label.
  return (
    <div
      className={`w-full ${height} rounded-full bg-ink-3 overflow-hidden`}
      aria-hidden="true"
    >
      <div
        className={`${color} ${height} rounded-full transition-[width] duration-300 ease-out`}
        style={{ width: `${pct * 100}%` }}
      />
    </div>
  );
}
