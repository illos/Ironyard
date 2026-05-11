type Props = {
  current: number;
  max: number;
  // Visual size; iPad detail pane uses 'lg', initiative panel rows use 'sm'.
  size?: 'sm' | 'lg';
};

export function HpBar({ current, max, size = 'sm' }: Props) {
  const pct = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
  const color = pct >= 0.5 ? 'bg-emerald-500' : pct >= 0.25 ? 'bg-amber-400' : 'bg-rose-500';
  const height = size === 'lg' ? 'h-3' : 'h-1.5';
  // Visual-only — the numeric `current / max` is rendered alongside in the
  // parent. Skipping role="progressbar" avoids the focusable-interactive rule
  // and keeps the bar a pure presentation element; screen readers get the
  // numbers from the adjacent label.
  return (
    <div
      className={`w-full ${height} rounded-full bg-neutral-800 overflow-hidden`}
      aria-hidden="true"
    >
      <div
        className={`${color} ${height} rounded-full transition-[width] duration-300 ease-out`}
        style={{ width: `${pct * 100}%` }}
      />
    </div>
  );
}
