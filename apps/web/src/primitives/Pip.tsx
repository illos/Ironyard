import type { HTMLAttributes } from 'react';

export interface PipProps extends HTMLAttributes<HTMLSpanElement> {
  on?: boolean;
}

export function Pip({ on = false, className = '', ...rest }: PipProps) {
  return (
    <span
      {...rest}
      className={`inline-block w-1.5 h-1.5 rounded-full border ${
        on ? 'bg-accent border-accent-strong' : 'bg-ink-3 border-line'
      } ${className}`}
    />
  );
}
