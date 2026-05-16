// apps/web/src/pages/combat/detail/TurnFlowSection.tsx
import type { ReactNode } from 'react';

export interface TurnFlowSectionProps {
  /** Display index — 1 / 2 / 3. */
  index: 1 | 2 | 3;
  /** Section label — "Main" / "Maneuver" / "Move". */
  label: string;
  /** Subtitle shown next to the label when state !== 'done' (e.g. "6 squares"). */
  subtitle?: string;
  /** Pending / active / done. */
  state: 'pending' | 'active' | 'done';
  /** Summary text shown when state === 'done' (e.g. "rolled Mind Spike" or "skipped"). */
  doneSummary?: string;
  /** Body content — typically inline AbilityCards. Hidden when state === 'done'. */
  children?: ReactNode;
  /** Skip / Done-moving button label. Hidden when state === 'done'. */
  skipLabel?: string;
  onSkip?: () => void;
  /** Disable the skip button (e.g. WS closed, no roll permission). */
  skipDisabled?: boolean;
}

export function TurnFlowSection({
  index,
  label,
  subtitle,
  state,
  doneSummary,
  children,
  skipLabel,
  onSkip,
  skipDisabled,
}: TurnFlowSectionProps) {
  const borderClass =
    state === 'active'
      ? 'border-l-accent'
      : state === 'done'
        ? 'border-l-line opacity-55'
        : 'border-l-line';
  const numClass = state === 'active' ? 'border-accent text-accent' : 'border-line text-text-dim';
  return (
    <section className={`border-l-2 ${borderClass} pl-3 py-2`}>
      <header className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          <span
            className={`inline-flex w-6 h-6 items-center justify-center text-xs border ${numClass}`}
          >
            {index}
          </span>
          <span className="font-semibold">
            {state === 'done' ? (
              <span className="text-text-mute">{`${label} — ${doneSummary ?? 'done'}`}</span>
            ) : (
              label
            )}
          </span>
          {subtitle && state !== 'done' && (
            <span className="text-xs text-text-mute font-mono">{subtitle}</span>
          )}
        </span>
        {state !== 'done' && skipLabel && onSkip && (
          <button
            type="button"
            onClick={onSkip}
            disabled={skipDisabled}
            className="text-xs px-2 py-0.5 border border-line text-text-dim hover:text-text disabled:opacity-40"
          >
            {skipLabel}
          </button>
        )}
      </header>
      {state !== 'done' && children && <div className="mt-2 space-y-2">{children}</div>}
    </section>
  );
}
