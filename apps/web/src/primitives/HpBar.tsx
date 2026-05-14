export type HpBarProps = {
  current: number;
  max: number;
  // Visual size; iPad detail pane uses 'lg', initiative panel rows use 'sm'.
  size?: 'sm' | 'lg';
  // Slim 4px-tall variant (used by ParticipantRow). When true, the bar
  // height becomes h-1 and overrides `size`. The numeric label is not
  // rendered here in any case — it's the caller's responsibility.
  compact?: boolean;
};

export function HpBar({ current, max, size = 'sm', compact = false }: HpBarProps) {
  const pct = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
  const color = pct >= 0.5 ? 'bg-hp-good' : pct >= 0.25 ? 'bg-hp-warn' : 'bg-hp-bad';
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
