import type { ReactNode } from 'react';

export interface SplitPaneProps {
  left: ReactNode;
  right: ReactNode;
  /** Column ratio as CSS grid-template-columns value (e.g. "1.18fr 1fr"). */
  ratio?: string;
  /** Vertical gap in px between cols. */
  gap?: number;
  className?: string;
}

export function SplitPane({
  left,
  right,
  ratio = '1fr 1fr',
  gap = 14,
  className = '',
}: SplitPaneProps) {
  return (
    <div
      className={`grid min-h-0 overflow-hidden ${className}`}
      style={{ gridTemplateColumns: ratio, gap }}
    >
      <div className="flex flex-col gap-3 min-w-0 min-h-0 overflow-y-auto">{left}</div>
      <div className="flex flex-col gap-3 min-w-0 min-h-0 overflow-y-auto">{right}</div>
    </div>
  );
}
