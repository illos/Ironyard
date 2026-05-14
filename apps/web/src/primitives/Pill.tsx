// apps/web/src/primitives/Pill.tsx
import type { HTMLAttributes, ReactNode } from 'react';

export interface PillProps extends HTMLAttributes<HTMLSpanElement> {
  /** Color of the leading dot. CSS class accepted via `dotClassName`. */
  dotClassName?: string;
  children: ReactNode;
}

export function Pill({ dotClassName = 'bg-foe', children, className = '', ...rest }: PillProps) {
  return (
    <span
      {...rest}
      className={`inline-flex items-center gap-2 px-2.5 py-1 bg-ink-2 border border-line rounded-full text-xs ${className}`}
    >
      <span className={`w-2 h-2 rounded-full ${dotClassName}`} />
      {children}
    </span>
  );
}
